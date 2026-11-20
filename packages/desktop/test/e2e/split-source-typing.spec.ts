import { expect, test } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { execFileSync, type ChildProcess } from 'node:child_process'
import {
  clickMenuById,
  closeDiscardingChanges,
  enterSourceMode,
  launchWithMarkdown,
  sendIpcToRenderer,
  waitForMenuReady
} from './helpers'
import type { WorkspaceFacadeSnapshot } from '../../src/shared/workspace'

// Real keystrokes in a Source view whose document is also open in the other
// pane. Each keystroke refreshes the hidden engine and the other pane, and
// that refresh must not take the caret out of CodeMirror's textarea.

const PARAGRAPHS = Array.from({ length: 60 }, (_, index) => `Paragraph ${index + 1}.`)
const DOC = PARAGRAPHS.join('\n\n') + '\n'
const tabSelector = '.tabs-container > li'

type CodeMirrorElement = Element & {
  CodeMirror: {
    getValue(): string
    getCursor(): { line: number; ch: number }
    getLineHandle(line: number): unknown
    heightAtLine(line: number, mode: string): number
    lineCount(): number
    getLine(line: number): string
  }
}

const pane = (page: Page, index: number): Locator => page.locator('.workspace-pane').nth(index)

const tabMenuAction = async(app: ElectronApplication, page: Page, tab: Locator, label: string): Promise<void> => {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function() {
      ;(global as unknown as { __sourceTypingMenu: unknown }).__sourceTypingMenu = this
    }
  })
  await tab.dispatchEvent('contextmenu', { clientX: 20, clientY: 20 })
  await expect.poll(() => app.evaluate(() => !!(global as unknown as { __sourceTypingMenu?: unknown }).__sourceTypingMenu)).toBe(true)
  await app.evaluate(({ BrowserWindow }, itemLabel) => {
    const state = global as unknown as { __sourceTypingMenu?: { items: Array<{ label: string; enabled: boolean; click(...args: unknown[]): void }> } }
    const item = state.__sourceTypingMenu?.items.find(candidate => candidate.label === itemLabel)
    if (!item?.enabled) throw new Error(`Menu action unavailable: ${itemLabel}`)
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    item.click(undefined, win, win?.webContents)
    delete state.__sourceTypingMenu
  }, label)
  await expect(page.locator('.workspace-pane')).toHaveCount(2)
}

const terminate = async(child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
}

const documentMarkdowns = async(page: Page): Promise<string[]> => {
  const snapshot = await page.evaluate(() =>
    (window as unknown as { __mtWorkspaceSnapshot(): WorkspaceFacadeSnapshot }).__mtWorkspaceSnapshot()
  )
  return [...new Set(snapshot.documents.map(document => document.markdown))]
}

const sourceState = (page: Page, index: number) =>
  pane(page, index).evaluate((root) => {
    const cm = (root.querySelector('.source-code .CodeMirror') as CodeMirrorElement).CodeMirror
    const textarea = root.querySelector('.source-code .CodeMirror textarea')
    return {
      value: cm.getValue(),
      cursor: cm.getCursor(),
      scrollTop: (root.querySelector('.source-code') as HTMLElement).scrollTop,
      focused: document.activeElement === textarea
    }
  })

const sourceValue = async(page: Page, index: number): Promise<string> => (await sourceState(page, index)).value

const enterSourceIn = async(app: ElectronApplication, page: Page, index: number): Promise<void> => {
  await pane(page, index).locator('span.mu-paragraph-content').first().click()
  await clickMenuById(app, 'sourceCodeModeMenuItem')
  await expect(pane(page, index).locator('.source-code .CodeMirror')).toBeVisible()
}

/** Scroll `text`'s line to the middle of the Source view, click it, and put the caret at its end. */
const caretAtSourceLineEnd = async(page: Page, index: number, text: string): Promise<void> => {
  await pane(page, index).evaluate((root, lineText) => {
    const cm = (root.querySelector('.source-code .CodeMirror') as CodeMirrorElement).CodeMirror
    const container = root.querySelector('.source-code') as HTMLElement
    let line = 0
    while (line < cm.lineCount() && cm.getLine(line) !== lineText) line++
    container.scrollTop = cm.heightAtLine(line, 'local') - container.clientHeight / 2
  }, text)
  await pane(page, index).locator('.source-code .CodeMirror-line', { hasText: new RegExp(`^${text.replace('.', '\\.')}$`) }).click()
  await page.keyboard.press('End')
}

/** Characters, a line break, and a deletion, at a steady typing pace. */
const typeBurst = async(page: Page, word: string): Promise<void> => {
  await page.keyboard.type(word, { delay: 40 })
  await page.keyboard.press('Enter')
  await page.keyboard.type('ab', { delay: 40 })
  await page.keyboard.press('Backspace')
  await page.keyboard.type('c', { delay: 40 })
}

const SOURCE_BURST = (line: string, word: string) => DOC.replace(`${line}\n`, `${line}${word}\nac\n`)

test.describe('Typing in a Source view of a shared document', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    ;({ app, page } = await launchWithMarkdown(DOC))
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForSelector('.tabs-container', { state: 'attached' })
  })

  test.afterEach(async() => {
    if (!app) return
    const child = app.process()
    try {
      await Promise.race([closeDiscardingChanges(app), new Promise<void>(resolve => setTimeout(resolve, 5_000))])
    } finally {
      await terminate(child)
    }
  })

  test('Source beside WYSIWYG: every keystroke lands, the other pane follows, caret and scroll stay', async() => {
    await tabMenuAction(app, page, page.locator(tabSelector).first(), 'Split Right')
    await waitForMenuReady(app)
    await enterSourceIn(app, page, 1)

    await caretAtSourceLineEnd(page, 1, 'Paragraph 30.')
    const before = await sourceState(page, 1)
    await typeBurst(page, 'XYZ')

    const expected = SOURCE_BURST('Paragraph 30.', 'XYZ')
    await expect.poll(() => sourceValue(page, 1)).toBe(expected)
    await expect.poll(() => documentMarkdowns(page)).toEqual([expected])
    await expect.poll(() => pane(page, 0).locator('.editor-component').innerText()).toMatch(/Paragraph 30\.XYZ\s+ac/)
    const after = await sourceState(page, 1)
    expect(after.focused).toBe(true)
    expect(after.cursor).toMatchObject({ line: before.cursor.line + 1, ch: 2 })
    expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(1)

    // Undo walks back through the shared history to the original text, redo
    // restores the burst, and typing still lands afterwards.
    for (let step = 0; step < 20 && (await sourceValue(page, 1)) !== DOC; step++) {
      const current = await sourceValue(page, 1)
      await page.keyboard.press('Control+z')
      await expect.poll(() => sourceValue(page, 1)).not.toBe(current)
    }
    expect(await sourceValue(page, 1)).toBe(DOC)
    await expect.poll(() => documentMarkdowns(page)).toEqual([DOC])
    await expect.poll(() => pane(page, 0).locator('.editor-component').innerText()).not.toContain('XYZ')

    for (let step = 0; step < 20 && (await sourceValue(page, 1)) !== expected; step++) {
      const current = await sourceValue(page, 1)
      await page.keyboard.press('Control+y')
      await expect.poll(() => sourceValue(page, 1)).not.toBe(current)
    }
    expect(await sourceValue(page, 1)).toBe(expected)
    await expect.poll(() => documentMarkdowns(page)).toEqual([expected])

    await caretAtSourceLineEnd(page, 1, 'Paragraph 31.')
    await page.keyboard.type('MORE', { delay: 40 })
    const resumed = expected.replace('Paragraph 31.\n', 'Paragraph 31.MORE\n')
    await expect.poll(() => sourceValue(page, 1)).toBe(resumed)
    await expect.poll(() => documentMarkdowns(page)).toEqual([resumed])
  })

  test('WYSIWYG beside Source: every keystroke lands, Source follows, the WYSIWYG caret stays', async() => {
    await tabMenuAction(app, page, page.locator(tabSelector).first(), 'Split Right')
    await waitForMenuReady(app)
    await enterSourceIn(app, page, 1)
    await caretAtSourceLineEnd(page, 1, 'Paragraph 30.')
    const sourceScrollTop = (await sourceState(page, 1)).scrollTop

    await pane(page, 0).locator('span.mu-paragraph-content', { hasText: /^Paragraph 3\.$/ }).click()
    await page.keyboard.press('End')
    await page.keyboard.type('QRS', { delay: 40 })
    await page.keyboard.press('Enter')
    await page.keyboard.type('de', { delay: 40 })
    await page.keyboard.press('Backspace')
    await page.keyboard.type('f', { delay: 40 })

    const expected = DOC.replace('Paragraph 3.\n', 'Paragraph 3.QRS\n\ndf\n')
    await expect.poll(() => sourceValue(page, 1)).toBe(expected)
    await expect.poll(() => documentMarkdowns(page)).toEqual([expected])
    const caret = await page.evaluate(() => {
      const selection = window.getSelection()
      const block = selection?.anchorNode?.parentElement?.closest('.mu-paragraph-content')
      return { text: block?.textContent, offset: selection?.anchorOffset, collapsed: selection?.isCollapsed }
    })
    expect(caret).toEqual({ text: 'df', offset: 2, collapsed: true })
    expect(Math.abs((await sourceState(page, 1)).scrollTop - sourceScrollTop)).toBeLessThanOrEqual(1)
  })

  test('Source beside Source: typing in either pane lands and leaves the other pane scrolled where it was', async() => {
    await tabMenuAction(app, page, page.locator(tabSelector).first(), 'Split Right')
    await waitForMenuReady(app)
    await enterSourceIn(app, page, 1)
    await enterSourceIn(app, page, 0)

    await caretAtSourceLineEnd(page, 1, 'Paragraph 45.')
    await caretAtSourceLineEnd(page, 0, 'Paragraph 20.')
    const rightScrollTop = (await sourceState(page, 1)).scrollTop
    await typeBurst(page, 'LEFT')
    const afterLeft = SOURCE_BURST('Paragraph 20.', 'LEFT')
    await expect.poll(() => sourceValue(page, 0)).toBe(afterLeft)
    await expect.poll(() => sourceValue(page, 1)).toBe(afterLeft)
    await expect.poll(() => documentMarkdowns(page)).toEqual([afterLeft])
    expect((await sourceState(page, 0)).focused).toBe(true)
    expect(Math.abs((await sourceState(page, 1)).scrollTop - rightScrollTop)).toBeLessThanOrEqual(1)

    const leftScrollTop = (await sourceState(page, 0)).scrollTop
    await caretAtSourceLineEnd(page, 1, 'Paragraph 45.')
    await typeBurst(page, 'RIGHT')
    const afterRight = afterLeft.replace('Paragraph 45.\n', 'Paragraph 45.RIGHT\nac\n')
    await expect.poll(() => sourceValue(page, 1)).toBe(afterRight)
    await expect.poll(() => sourceValue(page, 0)).toBe(afterRight)
    await expect.poll(() => documentMarkdowns(page)).toEqual([afterRight])
    expect((await sourceState(page, 1)).focused).toBe(true)
    expect(Math.abs((await sourceState(page, 0)).scrollTop - leftScrollTop)).toBeLessThanOrEqual(1)
  })

  test('different documents side by side and a single Source pane keep every keystroke', async() => {
    await enterSourceMode(page, app)
    await caretAtSourceLineEnd(page, 0, 'Paragraph 10.')
    await typeBurst(page, 'ONE')
    const single = SOURCE_BURST('Paragraph 10.', 'ONE')
    await expect.poll(() => sourceValue(page, 0)).toBe(single)

    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, DOC)
    await expect(page.locator(tabSelector)).toHaveCount(2)
    await tabMenuAction(app, page, page.locator('.tabs-container > li.active'), 'Move to Right')
    await waitForMenuReady(app)
    if (!(await pane(page, 1).locator('.source-code .CodeMirror').count())) await enterSourceIn(app, page, 1)
    await caretAtSourceLineEnd(page, 1, 'Paragraph 50.')
    await typeBurst(page, 'TWO')
    await expect.poll(() => sourceValue(page, 1)).toBe(SOURCE_BURST('Paragraph 50.', 'TWO'))
    expect(await sourceValue(page, 0)).toBe(single)
  })
})
