import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createAuditRun } from './audit-fixtures'
import {
  enterSourceMode,
  exitSourceMode,
  launchElectron,
  sendIpcToRenderer,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const tabSelector = '.tabs-container > li'
const isDirty = (page: Page): Promise<boolean> =>
  page.evaluate(() => !!document.querySelector('.tabs-container > li.active.unsaved'))

const activeText = (page: Page): Promise<string> =>
  page.evaluate(() =>
    (document.querySelector('.editor-component')?.textContent ?? '').replace(/\u00a0/g, ' ')
  )

const sourceValue = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const cm = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { getValue(): string } })
      | null
    return cm?.CodeMirror?.getValue() ?? ''
  })

const setSource = async(
  app: ElectronApplication,
  page: Page,
  markdown: string
): Promise<void> => {
  await enterSourceMode(page, app)
  await page.locator('.source-code .CodeMirror').click()
  await page.keyboard.press('Control+A')
  if (markdown.length > 4_000) {
    await page.keyboard.insertText(markdown)
  } else {
    const lines = markdown.split('\n')
    for (const [index, line] of lines.entries()) {
      if (line) await page.keyboard.type(line)
      if (index < lines.length - 1) await page.keyboard.press('Enter')
    }
  }
  await expect.poll(() => sourceValue(page)).toBe(markdown)
  await expect.poll(() => isDirty(page)).toBe(true)
  await exitSourceMode(page, app)
  const visibleMarker = markdown.trim().split(/\s+/).at(-1)
  if (visibleMarker) await expect.poll(() => activeText(page)).toContain(visibleMarker)
}

const stubSaveDialog = async(app: ElectronApplication, targetPath: string): Promise<void> => {
  await app.evaluate(async({ dialog }, savePath) => {
    const g = global as unknown as {
      __mt_audit_original_save_dialog__?: typeof dialog.showSaveDialog
    }
    if (!g.__mt_audit_original_save_dialog__) {
      g.__mt_audit_original_save_dialog__ = dialog.showSaveDialog.bind(dialog)
    }
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => ({
      canceled: false,
      filePath: savePath
    })
  }, targetPath)
}

const restoreSaveDialog = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ dialog }) => {
    const g = global as unknown as {
      __mt_audit_original_save_dialog__?: typeof dialog.showSaveDialog
    }
    if (g.__mt_audit_original_save_dialog__) {
      ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog =
        g.__mt_audit_original_save_dialog__
    }
  })
}

const stubCloseDialog = async(app: ElectronApplication, response: number): Promise<void> => {
  await app.evaluate(async({ dialog }, selectedResponse) => {
    const g = global as unknown as {
      __mt_audit_original_close_dialog__?: typeof dialog.showMessageBox
      __mt_audit_close_response__?: number
      __mt_audit_close_messages__?: string[]
    }
    if (!g.__mt_audit_original_close_dialog__) {
      g.__mt_audit_original_close_dialog__ = dialog.showMessageBox.bind(dialog)
    }
    g.__mt_audit_close_response__ = selectedResponse
    g.__mt_audit_close_messages__ = []
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox = async(
      _windowOrOptions: unknown,
      maybeOptions?: { message?: string }
    ) => {
      g.__mt_audit_close_messages__?.push(maybeOptions?.message ?? '')
      return { response: g.__mt_audit_close_response__ ?? 2 }
    }
  }, response)
}

const restoreCloseDialog = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ dialog }) => {
    const g = global as unknown as { __mt_audit_original_close_dialog__?: typeof dialog.showMessageBox }
    if (g.__mt_audit_original_close_dialog__) {
      ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox =
        g.__mt_audit_original_close_dialog__
    }
  })
}

const restartSharedProfile = async(
  app: ElectronApplication,
  userDataDir: string
): Promise<{ app: ElectronApplication; page: Page }> => {
  await app.close()
  const relaunched = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  await waitForEditor(relaunched.page)
  await waitForMenuReady(relaunched.app)
  return relaunched
}

test.describe('W2 audit — tabs, no normal restart restore and Save As', () => {
  test('closing a non-active dirty tab keeps the active document and targets its own save decision', async() => {
    test.setTimeout(90_000)
    const run = createAuditRun()
    const profile = run.createIsolatedUserDataDir('w2-close-non-active')
    const saveTarget = path.join(run.fixtures.F1.rootDir, 'non-active-close-save.md')
    let app: ElectronApplication | undefined
    try {
      const launched = await launchElectron([run.fixtures.F2.documentPath!], run.launchOptionsForUserDataDir(profile))
      app = launched.app
      const { page } = launched
      await waitForEditor(page)
      await waitForMenuReady(app)
      const activeBaseline = await activeText(page)

      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'target baseline\n')
      await expect.poll(() => page.locator(tabSelector).count()).toBe(2)
      await expect.poll(() => activeText(page)).toContain('target baseline')
      await page.click('.editor-component')
      await page.keyboard.insertText(' TARGET-DIRTY')
      await expect.poll(() => activeText(page)).toContain('TARGET-DIRTY')
      await expect.poll(() => isDirty(page)).toBe(true)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => activeText(page)).toBe(activeBaseline)

      await stubCloseDialog(app, 2)
      await page.locator(`${tabSelector}:nth-child(2) .close-icon`).evaluate((button) => (button as HTMLElement).click())
      await expect.poll(() => page.locator(tabSelector).count()).toBe(2)
      expect(await activeText(page)).toBe(activeBaseline)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect.poll(() => activeText(page)).toContain('TARGET-DIRTY')
      await expect.poll(() => isDirty(page)).toBe(true)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => activeText(page)).toBe(activeBaseline)

      await stubCloseDialog(app, 1)
      await page.locator(`${tabSelector}:nth-child(2) .close-icon`).evaluate((button) => (button as HTMLElement).click())
      await expect.poll(() => page.locator(tabSelector).count()).toBe(1)
      expect(await activeText(page)).toBe(activeBaseline)

      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'target save baseline\n')
      await expect.poll(() => page.locator(tabSelector).count()).toBe(2)
      await expect.poll(() => activeText(page)).toContain('target save baseline')
      await page.click('.editor-component')
      await page.keyboard.insertText(' TARGET-SAVED')
      await expect.poll(() => activeText(page)).toContain('TARGET-SAVED')
      await expect.poll(() => isDirty(page)).toBe(true)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => activeText(page)).toBe(activeBaseline)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect.poll(() => activeText(page)).toContain('TARGET-SAVED')
      await expect.poll(() => isDirty(page)).toBe(true)
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => activeText(page)).toBe(activeBaseline)
      await stubSaveDialog(app, saveTarget)
      await stubCloseDialog(app, 0)
      await page.locator(`${tabSelector}:nth-child(2) .close-icon`).evaluate((button) => (button as HTMLElement).click())
      await expect.poll(() => page.locator(tabSelector).count()).toBe(1)
      await expect.poll(() => fs.existsSync(saveTarget)).toBe(true)
      expect(fs.readFileSync(saveTarget, 'utf8').replace(/\r\n/g, '\n')).toBe('target save baseline\n\n TARGET-SAVED\n')
      expect(await activeText(page)).toBe(activeBaseline)
      const messages = await app.evaluate(() => {
        const g = global as unknown as { __mt_audit_close_messages__?: string[] }
        return g.__mt_audit_close_messages__ ?? []
      })
      expect(messages).toEqual(['Save changes to New Tab?'])
    } finally {
      if (app) {
        await restoreSaveDialog(app).catch(() => {})
        await restoreCloseDialog(app).catch(() => {})
        await app.close().catch(() => {})
      }
      run.cleanup()
    }
  })

  test('two F1 tabs keep content, dirty state, caret, scroll and history independent', async() => {
    test.setTimeout(90_000)
    const run = createAuditRun()
    const profile = run.createIsolatedUserDataDir('w2-tabs')
    let app: ElectronApplication | undefined
    try {
      const launched = await launchElectron([], run.launchOptionsForUserDataDir(profile))
      app = launched.app
      const { page } = launched
      await waitForEditor(page)
      await waitForMenuReady(app)

      const longA = Array.from({ length: 240 }, (_, index) => `A paragraph ${index}`).join('\n\n')
      await setSource(app, page, `${longA}\n\nA-DIRTY\n`)
      await expect.poll(() => activeText(page)).toContain('A-DIRTY')
      await expect.poll(() => isDirty(page)).toBe(true)

      // Record a non-default per-tab scroll position before switching away.
      await page.evaluate(() => {
        const editor = document.querySelector('.editor-component') as HTMLElement | null
        if (editor) editor.scrollTop = 2500
        editor?.dispatchEvent(new Event('scroll'))
      })
      await expect
        .poll(() =>
          page.evaluate(
            () => (document.querySelector('.editor-component') as HTMLElement)?.scrollTop ?? -1
          )
        )
        .toBeGreaterThan(1000)
      const aScroll = await page.evaluate(
        () => (document.querySelector('.editor-component') as HTMLElement).scrollTop
      )

      // Put the A caret in an unmistakable paragraph and let the editor persist it.
      await page.evaluate(() => {
        const spans = Array.from(document.querySelectorAll('span.mu-paragraph-content'))
        const target = spans[120]
        if (!target) return false
        const text = document.createTreeWalker(target, NodeFilter.SHOW_TEXT).nextNode()
        if (!text) return false
        const range = document.createRange()
        range.setStart(text, Math.min(3, text.textContent?.length ?? 0))
        range.collapse(true)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        ;(document.querySelector('.editor-component') as HTMLElement).dispatchEvent(
          new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })
        )
        return true
      })

      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'B baseline\n')
      await page.waitForFunction(
        (selector) => document.querySelectorAll(selector).length === 2,
        tabSelector
      )
      await expect.poll(() => activeText(page)).toContain('B baseline')
      await setSource(app, page, 'B baseline\n\nB-DIRTY\n')
      await expect.poll(() => activeText(page)).toContain('B-DIRTY')
      await expect.poll(() => isDirty(page)).toBe(true)

      // A source-mode edit is a whole-document history boundary. Undo and redo
      // on B must not reach into A's independently stored history.
      await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
      await expect.poll(() => activeText(page)).not.toContain('B-DIRTY')
      await expect.poll(() => isDirty(page)).toBe(false)
      await sendIpcToRenderer(app, 'mt::editor-edit-action', 'redo')
      await expect.poll(() => activeText(page)).toContain('B-DIRTY')
      await expect.poll(() => isDirty(page)).toBe(true)

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => activeText(page)).toContain('A-DIRTY')
      expect(await activeText(page)).not.toContain('B-DIRTY')
      await expect.poll(() => isDirty(page)).toBe(true)
      await expect
        .poll(() =>
          page.evaluate(
            () => (document.querySelector('.editor-component') as HTMLElement)?.scrollTop ?? -1
          )
        )
        .toBeGreaterThan(1000)
      const restoredScroll = await page.evaluate(
        () => (document.querySelector('.editor-component') as HTMLElement).scrollTop
      )
      expect(Math.abs(restoredScroll - aScroll)).toBeLessThan(aScroll)
      const caretText = await page.evaluate(() => {
        const anchor = window.getSelection()?.anchorNode
        return anchor?.parentElement?.closest('span.mu-paragraph-content')?.textContent ?? ''
      })
      expect(caretText).toContain('A paragraph 120')

      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 1)
      await expect.poll(() => activeText(page)).toContain('B-DIRTY')
    } finally {
      if (app) await app.close().catch(() => {})
      run.cleanup()
    }
  })

  test('shared restart profile ignores legacy normal-session state without overwriting it', async() => {
    test.setTimeout(90_000)
    const run = createAuditRun()
    let app: ElectronApplication | undefined
    try {
      const launched = await launchElectron(
        [],
        run.launchOptionsForUserDataDir(run.sharedUserDataDir)
      )
      app = launched.app
      let { page } = launched
      await waitForEditor(page)
      await waitForMenuReady(app)

      const legacyState = {
        currentFileId: 'legacy-b',
        tabs: [
          {
            id: 'legacy-a',
            pathname: '',
            filename: 'New Tab',
            markdown: 'RESTART-A-UNSAVED\\n',
            isSaved: false
          },
          {
            id: 'legacy-b',
            pathname: '',
            filename: 'New Tab',
            markdown: 'RESTART-B-UNSAVED\\n',
            isSaved: false
          }
        ],
        restoreWarnings: []
      }
      await page.evaluate(
        (state) => window.electron.ipcRenderer.invoke('update-buffer-state', state),
        legacyState
      )

      const stateDir = path.join(run.sharedUserDataDir, 'editorStates')
      await expect
        .poll(
          () =>
            fs.existsSync(stateDir) &&
            fs.readdirSync(stateDir).some((name) => name.endsWith('_editor_buffer_store.json'))
        )
        .toBe(true)
      const bufferPath = fs
        .readdirSync(stateDir)
        .map((name) => path.join(stateDir, name))
        .find((name) => name.endsWith('_editor_buffer_store.json')) as string
      const legacyBytes = fs.readFileSync(bufferPath, 'utf8')
      ;({ app, page } = await restartSharedProfile(app, run.sharedUserDataDir))
      await expect.poll(() => page.locator(tabSelector).count()).toBe(1)
      await expect.poll(() => activeText(page)).not.toContain('RESTART-A-UNSAVED')
      expect(await activeText(page)).not.toContain('RESTART-B-UNSAVED')
      expect(fs.readFileSync(bufferPath, 'utf8')).toBe(legacyBytes)
    } finally {
      if (app) await app.close().catch(() => {})
      run.cleanup()
    }
  })

  test('Save As writes a controlled F1 destination and that file reopens with the same content', async() => {
    test.setTimeout(90_000)
    const run = createAuditRun()
    const profile = run.createIsolatedUserDataDir('w2-save-as')
    const targetPath = path.join(run.fixtures.F1.rootDir, 'controlled-save-as.md')
    const expected = '# Controlled Save As\n\nSAVED-AS-CONTENT\n'
    let app: ElectronApplication | undefined
    try {
      const launched = await launchElectron([], run.launchOptionsForUserDataDir(profile))
      app = launched.app
      const { page } = launched
      await waitForEditor(page)
      await waitForMenuReady(app)
      await setSource(app, page, expected)
      await stubSaveDialog(app, targetPath)
      await sendIpcToRenderer(app, 'mt::editor-ask-file-save-as')
      await expect.poll(() => fs.existsSync(targetPath)).toBe(true)
      await expect
        .poll(() => fs.readFileSync(targetPath, 'utf8').replace(/\r\n/g, '\n'))
        .toBe(expected)
      await expect.poll(() => isDirty(page)).toBe(false)
      await restoreSaveDialog(app)
      await app.close()
      app = undefined

      const reopened = await launchElectron(
        [targetPath],
        run.launchOptionsForUserDataDir(run.createIsolatedUserDataDir('w2-save-as-reopen'))
      )
      app = reopened.app
      await waitForEditor(reopened.page)
      await waitForMenuReady(app)
      await enterSourceMode(reopened.page, app)
      await expect.poll(() => sourceValue(reopened.page)).toBe(expected)
    } finally {
      if (app) {
        await restoreSaveDialog(app).catch(() => {})
        await app.close().catch(() => {})
      }
      run.cleanup()
    }
  })
})
