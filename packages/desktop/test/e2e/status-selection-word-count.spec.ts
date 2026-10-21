import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  closeDiscardingChanges,
  enterSourceMode,
  launchWithMarkdown,
  waitForMenuReady
} from './helpers'

const wordCount = (page: Page) => page.locator('.app-status-bar .word-count')

const setSourceSelection = (
  page: Page,
  anchor: { line: number; ch: number },
  head: { line: number; ch: number }
): Promise<boolean> =>
  page.evaluate(
    ({ from, to }) => {
      const element = document.querySelector('.source-code .CodeMirror') as
        | (Element & {
          CodeMirror?: {
            focus(): void
            setSelection(anchor: { line: number; ch: number }, head: { line: number; ch: number }): void
          }
        })
        | null
      if (!element?.CodeMirror) return false
      element.CodeMirror.focus()
      element.CodeMirror.setSelection(from, to)
      return true
    },
    { from: anchor, to: head }
  )

test.describe('Status bar selection word count', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('alpha beta\n\ngamma delta epsilon\n')
    app = launched.app
    page = launched.page
    await waitForMenuReady(app)
  })

  test.afterAll(async() => {
    if (app) await closeDiscardingChanges(app)
  })

  test('shows the selection next to the document total in WYSIWYG mode', async() => {
    await page.locator('span.mu-paragraph-content').first().click()
    await page.keyboard.press('Home')
    await expect(wordCount(page)).toHaveText('W 5')

    await page.keyboard.press('Shift+End')
    await expect(wordCount(page)).toHaveText('W Selected 2 / Total 5')

    await page.keyboard.press('ArrowRight')
    await expect(wordCount(page)).toHaveText('W 5')
  })

  test('counts a selection grown across paragraphs with the keyboard', async() => {
    await page.locator('span.mu-paragraph-content').first().click()
    await page.keyboard.press('Home')
    // Shift+End after this deletes the first paragraph, with or without the count.
    await page.keyboard.press('Shift+ArrowDown')
    await expect(wordCount(page)).toHaveText('W Selected 2 / Total 5')

    await page.keyboard.press('ArrowLeft')
    await expect(wordCount(page)).toHaveText('W 5')
  })

  test('counts the CodeMirror selection in source mode', async() => {
    await enterSourceMode(page, app)
    await expect(wordCount(page)).toHaveText('W 5')

    expect(await setSourceSelection(page, { line: 2, ch: 0 }, { line: 2, ch: 11 })).toBe(true)
    await expect(wordCount(page)).toHaveText('W Selected 2 / Total 5')

    expect(await setSourceSelection(page, { line: 2, ch: 3 }, { line: 2, ch: 3 })).toBe(true)
    await expect(wordCount(page)).toHaveText('W 5')
  })
})
