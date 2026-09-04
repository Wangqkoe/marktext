import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchElectron, waitForMenuReady } from './helpers'

for (const entry of ['File > Open', 'Files sidebar'] as const) {
  test(`reopens a moved file in its original window through ${entry} after the target closes`, async() => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-transfer-reopen-'))
    const folder = path.join(profile, 'fixtures')
    fs.mkdirSync(folder)
    const file = path.join(folder, 'move.md')
    const markdown = '# Move close reopen\n\nTRANSFER_REOPEN_SENTINEL\n'
    fs.writeFileSync(file, markdown)
    const { app, page } = await launchElectron([file], { userDataDir: profile, userDataDirOwnership: 'caller' })
    try {
      await expect(page.locator('.editor-component')).toContainText('TRANSFER_REOPEN_SENTINEL')
      const sourceId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.id)
      if (!sourceId) throw new Error('source window is unavailable')
      if (entry === 'Files sidebar') {
        await page.evaluate((pathname) => window.electron.ipcRenderer.send('mt::cmd-open-folder-in-current-window', pathname), folder)
        await expect(page.locator('.project-tree .side-bar-file').filter({ hasText: 'move.md' })).toBeVisible()
      }

      // Only replace Electron's native popup boundary. The DOM contextmenu,
      // production MenuItem.click handler and transfer protocol stay intact.
      await app.evaluate(({ BrowserWindow, Menu }) => {
        const original = Menu.prototype.popup
        Menu.prototype.popup = function(options) {
          const move = this.items.find(item => item.label === 'Move to new window')
          if (!move?.enabled) throw new Error('Move to new window is unavailable')
          options?.callback?.()
          const menuWindow = options?.window ? BrowserWindow.fromId(options.window.id) : undefined
          setTimeout(() => move.click(undefined, menuWindow ?? undefined, menuWindow?.webContents), 125)
        }
        ;(global as unknown as { __mtRestoreReopenPopup?: () => void }).__mtRestoreReopenPopup = () => {
          Menu.prototype.popup = original
        }
      })
      const targetCreated = app.waitForEvent('window')
      await page.locator('.tabs-container li.active').evaluate((tab) => {
        const bounds = tab.getBoundingClientRect()
        tab.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + 5,
          clientY: bounds.top + 5
        }))
      })
      const target = await targetCreated
      await expect(target.locator('.tabs-container li.active')).toContainText('move.md')
      await expect(target.locator('.editor-component')).toContainText('TRANSFER_REOPEN_SENTINEL')
      await expect(page.locator('.tabs-container li')).toHaveCount(1)
      await expect(page.locator('.tabs-container li')).toContainText('New Tab')
      // A visible target can still be finishing authorization/checkpoint work.
      // Close only after the successful Move, not during in-flight recovery.
      await expect.poll(() => {
        try {
          return fs.readFileSync(path.join(profile, 'tab-transfer', 'journal.ndjson'), 'utf8')
            .trim().split('\n').map(line => JSON.parse(line) as { phase: string; kind: string })
            .some(record => record.phase === 'completed' && record.kind === 'observed')
        } catch { return false }
      }).toBe(true)
      const targetId = await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find(window => window.id !== id)?.id, sourceId)
      if (!targetId) throw new Error('target window is unavailable')
      const targetClosed = target.waitForEvent('close')
      await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.close(), targetId)
      await targetClosed
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.id))).toEqual([sourceId])

      if (entry === 'File > Open') {
        await waitForMenuReady(app)
        // The selected path is the OS-dialog boundary; the real File > Open
        // handler must still decide whether to open or activate the document.
        await app.evaluate(({ dialog }, pathname) => {
          dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [pathname] })
        }, file)
        await app.evaluate(({ BrowserWindow, Menu }, id) => {
          const source = BrowserWindow.fromId(id)
          const fileMenu = Menu.getApplicationMenu()?.items.find(item => item.submenu?.items.some(menuItem => menuItem.accelerator?.includes('O')))
          const open = fileMenu?.submenu?.items.find(item => item.accelerator?.includes('O'))
          if (!source || !open) throw new Error('File > Open is unavailable')
          open.click(undefined, source, source.webContents)
        }, sourceId)
      } else {
        await page.locator('.project-tree .side-bar-file').filter({ hasText: 'move.md' }).click()
      }
      await expect(page.locator('.tabs-container li.active')).toContainText('move.md')
      await expect(page.locator('.editor-component')).toContainText('TRANSFER_REOPEN_SENTINEL')
      await expect(page.locator('.tabs-container li')).toHaveCount(1)
      expect(fs.readFileSync(file, 'utf8')).toBe(markdown)
    } finally {
      await app.evaluate(() => {
        const state = global as unknown as { __mtRestoreReopenPopup?: () => void }
        state.__mtRestoreReopenPopup?.()
        delete state.__mtRestoreReopenPopup
      }).catch(() => undefined)
      await app.close()
      fs.rmSync(profile, { recursive: true, force: true })
    }
  })
}
