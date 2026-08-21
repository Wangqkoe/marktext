import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  enterSourceMode,
  launchWithMarkdown,
  sendIpcToRenderer,
  waitForMenuReady
} from './helpers'

const caretStatus = (page: Page) => page.locator('.status-caret-position')

const placeCaretInParagraph = (
  page: Page,
  paragraphIndex: number,
  offset: number
): Promise<boolean> =>
  page.evaluate(
    ({ index, ch }) => {
      const root = document.querySelector('.editor-component') as HTMLElement | null
      const target = root?.querySelectorAll('span.mu-paragraph-content')[index]
      if (!root || !target) return false
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
      let remaining = ch
      let node = walker.nextNode()
      while (node) {
        const length = node.textContent?.length ?? 0
        if (remaining <= length) break
        remaining -= length
        node = walker.nextNode()
      }
      if (!node) return false
      root.focus()
      const range = document.createRange()
      range.setStart(node, Math.min(remaining, node.textContent?.length ?? 0))
      range.collapse(true)
      const selection = window.getSelection()
      if (!selection) return false
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      root.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true, cancelable: true })
      )
      return true
    },
    { index: paragraphIndex, ch: offset }
  )

const setSourceCaret = (page: Page, line: number, ch: number): Promise<boolean> =>
  page.evaluate(
    ({ targetLine, targetCh }) => {
      const element = document.querySelector('.source-code .CodeMirror') as
        | (Element & {
          CodeMirror?: {
            focus(): void
            setCursor(position: { line: number; ch: number }): void
          }
        })
        | null
      if (!element?.CodeMirror) return false
      element.CodeMirror.focus()
      element.CodeMirror.setCursor({ line: targetLine, ch: targetCh })
      return true
    },
    { targetLine: line, targetCh: ch }
  )

test.describe('Caret status', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('first para\n\nsecond line\n')
    app = launched.app
    page = launched.page
    await waitForMenuReady(app)
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('follows clicking, arrow movement and typing in WYSIWYG mode', async() => {
    expect(await placeCaretInParagraph(page, 1, 3)).toBe(true)
    await expect(caretStatus(page)).toHaveText('Ln 3, Col 4')

    await page.keyboard.press('ArrowRight')
    await expect(caretStatus(page)).toHaveText('Ln 3, Col 5')

    await page.keyboard.type('X')
    await expect(caretStatus(page)).toHaveText('Ln 3, Col 6')
  })

  test('uses CodeMirror head positions and clears the old mode before reporting', async() => {
    await page.evaluate(() => {
      const records: Array<string | null> = []
      ;(window as typeof window & { __caretRecords?: Array<string | null> }).__caretRecords =
        records
      const status = document.querySelector('.app-status-bar')
      if (!status) return
      new MutationObserver(() => {
        records.push(document.querySelector('.status-caret-position')?.textContent?.trim() ?? null)
      }).observe(status, { childList: true, subtree: true, characterData: true })
    })

    await enterSourceMode(page, app)
    await expect(caretStatus(page)).toHaveText('Ln 3, Col 6')
    const modeTransition = await page.evaluate(
      () =>
        (window as typeof window & { __caretRecords?: Array<string | null> }).__caretRecords ?? []
    )
    const clearedAt = modeTransition.indexOf(null)
    expect(clearedAt).toBeGreaterThanOrEqual(0)
    expect(modeTransition.slice(clearedAt + 1)).toContain('Ln 3, Col 6')

    expect(await setSourceCaret(page, 2, 2)).toBe(true)
    await expect(caretStatus(page)).toHaveText('Ln 3, Col 3')
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
    )
    const afterSourceCaret = await page.evaluate(
      () =>
        (window as typeof window & { __caretRecords?: Array<string | null> }).__caretRecords ?? []
    )
    const sourcePositionAt = afterSourceCaret.lastIndexOf('Ln 3, Col 3')
    expect(sourcePositionAt).toBeGreaterThan(clearedAt)
    expect(afterSourceCaret.slice(sourcePositionAt + 1)).not.toContain('Ln 3, Col 6')

    await page.keyboard.press('ArrowRight')
    await expect(caretStatus(page)).toHaveText('Ln 3, Col 4')
    await page.keyboard.type('Z')
    await expect(caretStatus(page)).toHaveText('Ln 3, Col 5')
  })

  test('clears the old tab value and reports only the newly active tab', async() => {
    await page.evaluate(() => {
      const records = (window as typeof window & { __caretRecords?: Array<string | null> })
        .__caretRecords
      if (records) records.length = 0
    })
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'new tab\n')
    await expect(caretStatus(page)).toHaveText('Ln 1, Col 1')

    const transition = await page.evaluate(
      () =>
        (window as typeof window & { __caretRecords?: Array<string | null> }).__caretRecords ?? []
    )
    const clearedAt = transition.indexOf(null)
    expect(clearedAt).toBeGreaterThanOrEqual(0)
    expect(transition.slice(clearedAt + 1)).toContain('Ln 1, Col 1')
    expect(transition.slice(clearedAt + 1)).not.toContain('Ln 3, Col 5')
  })
})
