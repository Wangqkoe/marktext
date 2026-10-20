import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { closeDiscardingChanges, launchWithMarkdown, placeCaretInEditor, sendIpcToRenderer } from './helpers'

// Typewriter mode keeps the caret line at a fixed height (STANDAR_Y = 320px)
// while it moves. The workspace selection listener had dropped this scroll,
// and once restored the container's own keydown listener cancelled the
// animation Muya's keydown had just started.
test.describe('Typewriter mode', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const md = `${Array.from({ length: 120 }, (_, i) => `Paragraph ${i + 1}`).join('\n\n')}\n`
    const launched = await launchWithMarkdown(md)
    app = launched.app
    page = launched.page
    await sendIpcToRenderer(app, 'mt::user-preference', { typewriter: true })
    await expect(page.locator('.typewriter')).toHaveCount(1)
    await placeCaretInEditor(page)
  })

  test.afterAll(async() => {
    if (app) await closeDiscardingChanges(app)
  })

  const caretY = () =>
    page.evaluate(() => {
      const selection = window.getSelection()
      const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null
      const rect = range?.getClientRects()[0] ?? range?.startContainer.parentElement?.getBoundingClientRect()
      return Math.round(rect?.y ?? -1)
    })

  test('keeps the caret at the same height while it moves down', async() => {
    const heights: number[] = []
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowDown')
        await page.waitForTimeout(20)
      }
      await page.waitForTimeout(300)
      heights.push(await caretY())
    }

    for (const y of heights) expect(Math.abs(y - 320)).toBeLessThanOrEqual(4)
  })
})
