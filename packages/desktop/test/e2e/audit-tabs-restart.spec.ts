import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createAuditRun } from './audit-fixtures'
import {
  clickMenuById,
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

const setSource = async (app: ElectronApplication, page: Page, markdown: string): Promise<void> => {
  await enterSourceMode(page, app)
  await page.evaluate((value) => {
    const cm = document.querySelector('.source-code .CodeMirror') as Element & {
      CodeMirror: { setValue(value: string): void }
    }
    cm.CodeMirror.setValue(value)
  }, markdown)
  await exitSourceMode(page, app)
}

const menuChecked = (app: ElectronApplication, id: string): Promise<boolean> =>
  app.evaluate(
    ({ Menu }, menuId) => !!Menu.getApplicationMenu()?.getMenuItemById(menuId)?.checked,
    id
  )

const stubSaveDialog = async (app: ElectronApplication, targetPath: string): Promise<void> => {
  await app.evaluate(async ({ dialog }, savePath) => {
    const g = global as unknown as {
      __mt_audit_original_save_dialog__?: typeof dialog.showSaveDialog
    }
    if (!g.__mt_audit_original_save_dialog__) {
      g.__mt_audit_original_save_dialog__ = dialog.showSaveDialog.bind(dialog)
    }
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({
      canceled: false,
      filePath: savePath
    })
  }, targetPath)
}

const restoreSaveDialog = async (app: ElectronApplication): Promise<void> => {
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

const restartSharedProfile = async (
  app: ElectronApplication,
  userDataDir: string
): Promise<{ app: ElectronApplication; page: Page }> => {
  await app.close()
  const relaunched = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  await waitForEditor(relaunched.page)
  await waitForMenuReady(relaunched.app)
  return relaunched
}

test.describe('W2 audit — tabs, unsaved restart recovery and Save As', () => {
  test('two F1 tabs keep content, dirty state, caret, scroll and history independent', async () => {
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

  test('shared restart profile recovers unsaved F1 content and persisted view preferences', async () => {
    test.setTimeout(90_000)
    const run = createAuditRun()
    let app: ElectronApplication | undefined
    try {
      let launched = await launchElectron(
        [],
        run.launchOptionsForUserDataDir(run.sharedUserDataDir)
      )
      app = launched.app
      let { page } = launched
      await waitForEditor(page)
      await waitForMenuReady(app)

      await setSource(app, page, 'restart tab A\n\nRESTART-A-UNSAVED\n')
      await expect.poll(() => isDirty(page)).toBe(true)
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'restart tab B\n')
      await page.waitForFunction(
        (selector) => document.querySelectorAll(selector).length === 2,
        tabSelector
      )
      await setSource(app, page, 'restart tab B\n\nRESTART-B-UNSAVED\n')
      await expect.poll(() => isDirty(page)).toBe(true)

      if (await page.locator('.editor-tabs').isVisible()) await clickMenuById(app, 'tabBarMenuItem')
      await expect(page.locator('.editor-tabs')).toBeHidden()
      await enterSourceMode(page, app)
      await page.evaluate(() => {
        window.electron.ipcRenderer.send('mt::set-user-preference', {
          sourceCodeModeEnabled: true
        })
      })
      await page.waitForTimeout(1200)

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
      const buffer = JSON.parse(fs.readFileSync(bufferPath, 'utf8')) as {
        tabs: Array<{ markdown: string; isSaved: boolean }>
      }
      expect(buffer.tabs).toHaveLength(2)
      expect(buffer.tabs.map((tab) => tab.markdown).join('\n')).toContain('RESTART-A-UNSAVED')
      expect(buffer.tabs.map((tab) => tab.markdown).join('\n')).toContain('RESTART-B-UNSAVED')
      expect(buffer.tabs.every((tab) => !tab.isSaved)).toBe(true)
      ;({ app, page } = await restartSharedProfile(app, run.sharedUserDataDir))
      await expect.poll(() => page.locator(tabSelector).count()).toBe(2)
      await expect(page.locator('.editor-tabs')).toBeHidden()
      await expect(page.locator('.source-code .CodeMirror')).toBeVisible()
      expect(await menuChecked(app, 'tabBarMenuItem')).toBe(false)
      expect(await menuChecked(app, 'sourceCodeModeMenuItem')).toBe(true)
      await expect.poll(() => sourceValue(page)).toContain('RESTART-B-UNSAVED')
      await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
      await expect.poll(() => sourceValue(page)).toContain('RESTART-A-UNSAVED')
    } finally {
      if (app) await app.close().catch(() => {})
      run.cleanup()
    }
  })

  test('Save As writes a controlled F1 destination and that file reopens with the same content', async () => {
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
