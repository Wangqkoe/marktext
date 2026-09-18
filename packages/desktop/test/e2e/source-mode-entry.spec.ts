import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  closeDiscardingChanges,
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

  test('the caret stays on the same text when Source shows the unnormalized file', async() => {
    // The file keeps extra blank lines and `*` bullets that the engine's own
    // serialization rewrites, so line numbers differ between the two texts.
    const { app, page } = await launchWithMarkdown(
      '# Title\n\n\n\npara one\n\n\n\n* star item\n* second TARGET here\n\n\n\nlast para\n'
    )
    await waitForMenuReady(app)

    await page.evaluate(() => {
      const root = document.querySelector('.editor-component') as HTMLElement
      root.focus()
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = (node.textContent ?? '').indexOf('TARGET')
        if (index < 0) continue
        const range = document.createRange()
        range.setStart(node, index + 2)
        range.collapse(true)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
        root.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
        return
      }
    })
    await page.waitForTimeout(300)

    await enterSourceMode(page, app)
    await page.waitForTimeout(300)
    const sourceCaret = await page.evaluate(() => {
      const cm = (document.querySelector('.source-code .CodeMirror') as Element & {
        CodeMirror: { getCursor(): { line: number, ch: number }, getLine(line: number): string }
      }).CodeMirror
      const { line, ch } = cm.getCursor()
      return { line, text: cm.getLine(line), before: cm.getLine(line).slice(0, ch) }
    })
    expect(sourceCaret.line).toBe(9)
    expect(sourceCaret.before).toBe('* second TA')

    await page.evaluate(() => {
      const cm = (document.querySelector('.source-code .CodeMirror') as Element & {
        CodeMirror: { focus(): void, setCursor(pos: { line: number, ch: number }): void }
      }).CodeMirror
      cm.focus()
      cm.setCursor({ line: 13, ch: 3 })
    })
    await page.waitForTimeout(300)
    await exitSourceMode(page, app)
    await page.waitForTimeout(500)
    const caret = await page.evaluate(() => {
      const selection = window.getSelection()
      return { text: selection?.anchorNode?.textContent, offset: selection?.anchorOffset }
    })
    expect(caret).toEqual({ text: 'last para', offset: 3 })
    await app.close()
  })

  test('a file opened in Source mode opens in Source mode and the menu follows the active tab', async() => {
    const { app, page, filePath } = await launchWithMarkdown('# First\n')
    await waitForMenuReady(app)
    const sourceMenuChecked = () => app.evaluate(({ Menu }) =>
      !!Menu.getApplicationMenu()?.getMenuItemById('sourceCodeModeMenuItem')?.checked)

    await enterSourceMode(page, app)
    const second = path.join(path.dirname(filePath), 'second.md')
    fs.writeFileSync(second, '# Second\n', 'utf-8')
    await page.evaluate((file) => window.electron.ipcRenderer.send('mt::open-file', file, {}), second)
    await expect(page.locator('.editor-tabs li.active')).toContainText('second.md')
    await expect(page.locator('.source-code .CodeMirror')).toBeVisible()
    await expect.poll(() => page.evaluate(() =>
      (document.querySelector('.source-code .CodeMirror') as Element & { CodeMirror: { getValue(): string } })
        .CodeMirror.getValue())).toBe('# Second\n')
    expect(await sourceMenuChecked()).toBe(true)

    await exitSourceMode(page, app)
    await page.locator('.editor-tabs .tab-select', { hasText: 'note.md' }).click()
    await expect(page.locator('.source-code .CodeMirror')).toBeVisible()
    await expect.poll(sourceMenuChecked).toBe(true)
    await page.locator('.editor-tabs .tab-select', { hasText: 'second.md' }).click()
    await expect(page.locator('.source-code')).toHaveCount(0)
    await expect.poll(sourceMenuChecked).toBe(false)
    await app.close()
  })

  test('switching between Source tabs keeps each tab its own edits and caret', async() => {
    const { app, page } = await launchWithMarkdown('first para\n\nsecond line\n')
    await waitForMenuReady(app)
    type SourceEditor = Element & {
      CodeMirror: {
        focus(): void
        getValue(): string
        getCursor(): { line: number, ch: number }
        setCursor(pos: { line: number, ch: number }): void
      }
    }
    const placeSourceCaret = (line: number, ch: number) => page.evaluate(({ line, ch }) => {
      const cm = (document.querySelector('.source-code .CodeMirror') as SourceEditor).CodeMirror
      cm.focus()
      cm.setCursor({ line, ch })
    }, { line, ch })
    const sourceState = () => page.evaluate(() => {
      const cm = (document.querySelector('.source-code .CodeMirror') as SourceEditor).CodeMirror
      const { line, ch } = cm.getCursor()
      return { value: cm.getValue(), line, ch }
    })

    await enterSourceMode(page, app)
    await placeSourceCaret(2, 3)
    await page.keyboard.type('Z')
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'new tab\n')
    await expect.poll(sourceState).toEqual({ value: 'new tab\n', line: 0, ch: 0 })
    // CodeMirror resets its input field shortly after it is created; a key
    // pressed within that window is dropped.
    await page.waitForTimeout(200)

    await placeSourceCaret(0, 3)
    await page.keyboard.type('Q')
    await expect.poll(sourceState).toEqual({ value: 'newQ tab\n', line: 0, ch: 4 })
    await expect(page.locator('.editor-tabs li.active')).toHaveClass(/unsaved/)

    await page.locator('.editor-tabs .tab-select', { hasText: 'note.md' }).click()
    await expect.poll(sourceState).toEqual({ value: 'first para\n\nsecZond line\n', line: 2, ch: 4 })
    await page.locator('.editor-tabs .tab-select', { hasText: 'New Tab' }).click()
    await expect.poll(sourceState).toEqual({ value: 'newQ tab\n', line: 0, ch: 4 })
    await closeDiscardingChanges(app)
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
