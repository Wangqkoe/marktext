import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import {
  launchWithMarkdown,
  waitForMenuReady,
  getMarkdownContent,
  placeCaretInEditor,
  sendIpcToRenderer,
  enterSourceMode
} from './helpers'

// External changes arrive through the real file watcher and DocumentIO: each
// test rewrites or deletes the file on disk, exactly as another program would.

const undo = async(app: ElectronApplication): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
}

const setAutoSave = async(app: ElectronApplication, page: Page, autoSave: boolean): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::user-preference', { autoSave })
  await page.waitForTimeout(100)
}

const editorText = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector('.editor-component')?.textContent?.trim() ?? '')

const isUnsaved = (page: Page): Promise<boolean> =>
  page.evaluate(() => !!document.querySelector('.editor-tabs li.unsaved'))

const notificationText = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.querySelector('.editor-notifications .msg')?.textContent?.trim() ?? null)

const confirmNotification = (page: Page): Promise<void> =>
  page.locator('.editor-notifications .inline-button').first().click()

const dismissNotification = (page: Page): Promise<void> =>
  page.locator('.editor-notifications .inline-button').last().click()

// A dirty document raises the native save prompt on close; these tests are not
// about closing, so skip the prompt.
const closeApp = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.destroy()
  })
  await app.close().catch(() => undefined)
}

// Let the watcher and DocumentIO binding settle before changing the file.
const settle = (page: Page): Promise<void> => page.waitForTimeout(1500)

test.describe('External disk changes', () => {
  test('a clean document reloads automatically with autoSave, and undo restores the old content', async() => {
    const { app, page, filePath } = await launchWithMarkdown('old content here\n')
    await waitForMenuReady(app)
    await setAutoSave(app, page, true)
    await settle(page)

    fs.writeFileSync(filePath, 'new content here\n', 'utf-8')
    await expect.poll(() => editorText(page), { timeout: 10000 }).toBe('new content here')
    expect(await isUnsaved(page)).toBe(false)
    expect(await notificationText(page)).toBeNull()

    await undo(app)
    await expect.poll(() => editorText(page)).toBe('old content here')
    await expect.poll(() => isUnsaved(page)).toBe(true)
    await closeApp(app)
  })

  // #3652: reloading an unedited document discards nothing, so autoSave does
  // not gate it.
  test('a clean document without autoSave also reloads without asking', async() => {
    const { app, page, filePath } = await launchWithMarkdown('old content here\n')
    await waitForMenuReady(app)
    await setAutoSave(app, page, false)
    await settle(page)

    fs.writeFileSync(filePath, 'new content here\n', 'utf-8')
    await expect.poll(() => editorText(page), { timeout: 10000 }).toBe('new content here')
    expect(await isUnsaved(page)).toBe(false)
    expect(await notificationText(page)).toBeNull()
    await closeApp(app)
  })

  test('local edits are never replaced without confirmation, and a declined reload cannot overwrite the file', async() => {
    const { app, page, filePath } = await launchWithMarkdown('old content here\n')
    await waitForMenuReady(app)
    await setAutoSave(app, page, true)
    await settle(page)

    await placeCaretInEditor(page)
    await page.keyboard.type(' LOCAL', { delay: 0 })
    await expect.poll(() => isUnsaved(page)).toBe(true)
    const localText = await editorText(page)
    expect(localText).toContain('LOCAL')

    fs.writeFileSync(filePath, 'external content\n', 'utf-8')
    await expect.poll(() => notificationText(page), { timeout: 10000 }).toContain('changed on disk')
    expect(await editorText(page)).toBe(localText)

    await dismissNotification(page)
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await page.waitForTimeout(1500)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('external content\n')
    await closeApp(app)
  })

  test('confirming a conflict discards local edits and loads the file', async() => {
    const { app, page, filePath } = await launchWithMarkdown('old content here\n')
    await waitForMenuReady(app)
    await setAutoSave(app, page, false)
    await settle(page)

    await placeCaretInEditor(page)
    await page.keyboard.type(' LOCAL', { delay: 0 })
    await expect.poll(() => isUnsaved(page)).toBe(true)

    fs.writeFileSync(filePath, 'external content\n', 'utf-8')
    await expect.poll(() => notificationText(page), { timeout: 10000 }).toContain('changed on disk')
    await confirmNotification(page)
    await expect.poll(() => editorText(page)).toBe('external content')
    expect(await isUnsaved(page)).toBe(false)

    // The reloaded version is now the observed one, so saving is allowed again.
    await placeCaretInEditor(page)
    await page.keyboard.type(' SAVED', { delay: 0 })
    await expect.poll(() => isUnsaved(page)).toBe(true)
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => fs.readFileSync(filePath, 'utf-8'), { timeout: 5000 }).toContain('SAVED')
    await closeApp(app)
  })

  test('a deleted file keeps its content and is marked unsaved', async() => {
    const { app, page, filePath } = await launchWithMarkdown('kept content\n')
    await waitForMenuReady(app)
    await setAutoSave(app, page, true)
    await settle(page)

    fs.rmSync(filePath)
    await expect.poll(() => notificationText(page), { timeout: 10000 }).toContain('removed on disk')
    expect(await editorText(page)).toBe('kept content')
    expect(await isUnsaved(page)).toBe(true)
    await closeApp(app)
  })

  test('identical bytes rewritten on disk change nothing', async() => {
    const { app, page, filePath } = await launchWithMarkdown('same content\n')
    await waitForMenuReady(app)
    await setAutoSave(app, page, false)
    await settle(page)

    fs.writeFileSync(filePath, 'same content\r\n', 'utf-8')
    await page.waitForTimeout(3000)
    expect(await notificationText(page)).toBeNull()
    expect(await isUnsaved(page)).toBe(false)
    await closeApp(app)
  })
})

test.describe('External disk reload — source-mode scroll position survives a same-tab reload', () => {
  test('258: same-id reload preserves the source-mode scrollTop', async() => {
    const longBody = 'line\n'.repeat(400)
    const { app, page, filePath } = await launchWithMarkdown(longBody)
    await waitForMenuReady(app)
    await setAutoSave(app, page, true)
    await enterSourceMode(page, app)
    await settle(page)

    const scrollPosition = (): Promise<number> =>
      page.evaluate(() => {
        const container = document.querySelector('.source-code') as HTMLElement | null
        const cmEl = document.querySelector('.source-code .CodeMirror') as
          | (Element & { CodeMirror?: { getScrollerElement(): HTMLElement } })
          | null
        const scroller = cmEl?.CodeMirror?.getScrollerElement?.() ?? null
        return Math.max(container ? container.scrollTop : 0, scroller ? scroller.scrollTop : 0)
      })
    await page.evaluate(() => {
      const container = document.querySelector('.source-code') as HTMLElement | null
      const cmEl = document.querySelector('.source-code .CodeMirror') as
        | (Element & { CodeMirror?: { scrollTo(x: number, y: number): void } })
        | null
      cmEl?.CodeMirror?.scrollTo(0, 4000)
      if (container) container.scrollTop = 4000
    })
    const maxCaptured = await scrollPosition()
    expect(maxCaptured).toBeGreaterThan(0)

    fs.writeFileSync(filePath, longBody + 'tail line\n', 'utf-8')
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const cmEl = document.querySelector('.source-code .CodeMirror') as
              | (Element & { CodeMirror?: { getValue(): string } })
              | null
            return cmEl?.CodeMirror?.getValue() ?? ''
          }),
        { timeout: 10000 }
      )
      .toContain('tail line')
    await expect.poll(scrollPosition, { timeout: 4000 }).toBeGreaterThan(maxCaptured * 0.5)
    expect((await getMarkdownContent(page, app)).trim().endsWith('tail line')).toBe(true)
    await closeApp(app)
  })
})
