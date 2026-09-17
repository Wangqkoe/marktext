import { expect, test } from '@playwright/test'
import {
  enterSourceMode,
  exitSourceMode,
  getMarkdownContent,
  launchWithMarkdown,
  placeCaretInEditor,
  sendIpcToRenderer,
  waitForMenuReady
} from './helpers'

// Entering Source mode refreshes the pane with the document the controller has
// just flushed from the WYSIWYG engine. The engine stays mounted under the
// Source view, so reloading that identical document only rebuilt a hidden
// surface (seconds on a large file). It must keep its tree, content and
// history instead.

test.describe('Entering Source mode keeps the hidden WYSIWYG engine', () => {
  test('does not rebuild the WYSIWYG block tree', async() => {
    const { app, page } = await launchWithMarkdown('# Title\n\nalpha paragraph\n')
    await waitForMenuReady(app)

    await page.evaluate(() => {
      const w = window as typeof window & { __heading?: Element | null }
      w.__heading = document.querySelector('.editor-component h1')
    })
    await enterSourceMode(page, app)
    await page.waitForTimeout(300)

    const retained = await page.evaluate(() => {
      const w = window as typeof window & { __heading?: Element | null }
      return !!w.__heading && w.__heading.isConnected
    })
    expect(retained).toBe(true)

    await exitSourceMode(page, app)
    await app.close()
  })

  test('an unchanged Source round trip keeps content and undo of the earlier WYSIWYG edit', async() => {
    const { app, page } = await launchWithMarkdown('alpha\n')
    await waitForMenuReady(app)

    await placeCaretInEditor(page)
    await page.keyboard.type(' beta', { delay: 0 })
    await page.waitForTimeout(500)

    // Headless caret placement can land anywhere in the paragraph; only the
    // edit itself matters here.
    const edited = await getMarkdownContent(page, app)
    expect(edited).toContain('beta')

    await enterSourceMode(page, app)
    await page.waitForTimeout(300)
    await exitSourceMode(page, app)
    await page.waitForTimeout(300)
    expect(await getMarkdownContent(page, app)).toBe(edited)

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await page.waitForTimeout(600)
    expect((await getMarkdownContent(page, app)).trim()).toBe('alpha')
    await app.close()
  })
})
