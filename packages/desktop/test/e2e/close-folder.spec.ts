import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clickMenuById, launchElectron, typeIntoEditor, waitForMenuReady } from './helpers'

const waitForFolderRoot = async(page: Page, name: string): Promise<void> => {
  await expect(page.locator('.project-tree > .title')).toContainText(name, { timeout: 10_000 })
}

const openTreeFile = async(page: Page, filename: string): Promise<void> => {
  const file = page.locator('.side-bar-file').filter({ hasText: filename }).first()
  await expect(file).toBeVisible({ timeout: 10_000 })
  await file.click()
  await expect(page.locator('.tabs-container li').filter({ hasText: filename })).toHaveCount(1)
}

const closeFolderMenuEnabled = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ Menu }) => !!Menu.getApplicationMenu()?.getMenuItemById('closeFolderMenuItem')?.enabled)

test('Close Folder appears only in the Folder root context menu at the specified position', async() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-close-folder-menu-'))
  fs.mkdirSync(path.join(root, 'nested'))
  fs.writeFileSync(path.join(root, 'note.md'), '# Context menu\n')
  const { app, page } = await launchElectron([root])
  try {
    await waitForFolderRoot(page, path.basename(root))
    await expect(page.locator('.side-bar-folder .folder-name')).toBeVisible()
    await expect(page.locator('.side-bar-file')).toBeVisible()
    await app.evaluate(({ ipcMain }) => {
      const state = global as unknown as { __mt_folder_menus__?: unknown[][] }
      state.__mt_folder_menus__ = []
      ipcMain.removeAllListeners('mt::menu::popup')
      ipcMain.on('mt::menu::popup', (event, template: unknown[], _position, popupId) => {
        state.__mt_folder_menus__?.push(template)
        event.sender.send('mt::menu::closed', { popupId, selected: false })
      })
    })

    for (const selector of [
      '.project-tree > .title',
      '.side-bar-folder .folder-name',
      '.side-bar-file'
    ]) {
      await page.locator(selector).first().evaluate((element) => {
        const target = element as HTMLElement
        const box = target.getBoundingClientRect()
        target.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: box.left + 2,
          clientY: box.top + 2
        }))
      })
      await expect.poll(() => app.evaluate(() => {
        const state = global as unknown as { __mt_folder_menus__?: unknown[][] }
        return state.__mt_folder_menus__?.length ?? 0
      })).toBeGreaterThanOrEqual(selector === '.project-tree > .title' ? 1 : selector.includes('folder') ? 2 : 3)
    }

    const menus = await app.evaluate(() => {
      const state = global as unknown as {
        __mt_folder_menus__?: Array<Array<{ id?: string; type?: string }>>
      }
      return state.__mt_folder_menus__ ?? []
    })
    const signature = (items: Array<{ id?: string; type?: string }>) => items.map((item) => {
      if (item.type === 'separator') return 'separator'
      return [
        'newFileMenuItem',
        'newDirectoryMenuItem',
        'closeFolderMenuItem',
        'copyMenuItem',
        'cutMenuItem',
        'pasteMenuItem'
      ].find((prefix) => item.id?.startsWith(prefix)) ?? item.id
    })

    expect(signature(menus[0]).slice(0, 9)).toEqual([
      'newFileMenuItem',
      'newDirectoryMenuItem',
      'separator',
      'closeFolderMenuItem',
      'separator',
      'copyMenuItem',
      'cutMenuItem',
      'pasteMenuItem',
      'separator'
    ])
    expect(signature(menus[1])).not.toContain('closeFolderMenuItem')
    expect(signature(menus[2])).not.toContain('closeFolderMenuItem')
  } finally {
    await app.close().catch(() => undefined)
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('current-window Folder replacement replays the complete new tree without old nodes', async() => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-folder-replacement-'))
  const oldRoot = path.join(fixtureRoot, 'old-root')
  const newRoot = path.join(fixtureRoot, 'new-root')
  fs.mkdirSync(path.join(oldRoot, 'old-only'), { recursive: true })
  fs.mkdirSync(path.join(newRoot, 'nested'), { recursive: true })
  fs.writeFileSync(path.join(oldRoot, 'old.md'), '# Old root\n')
  fs.writeFileSync(path.join(newRoot, 'top.md'), '# New root\n')
  fs.writeFileSync(path.join(newRoot, 'nested', 'inside.md'), '# Nested file\n')
  const { app, page } = await launchElectron([oldRoot])

  try {
    await waitForFolderRoot(page, 'old-root')
    await expect(page.locator('.project-tree')).toContainText('old-only')
    await expect(page.locator('.project-tree')).toContainText('old.md')

    await page.evaluate((pathname) => {
      window.electron.ipcRenderer.send('mt::set-user-preference', {
        openFolderInNewWindow: true
      })
      window.electron.ipcRenderer.send('mt::cmd-open-folder-in-current-window', pathname)
    }, newRoot)

    await waitForFolderRoot(page, 'new-root')
    await expect.poll(() => app.windows().length).toBe(1)
    const newTree = page.locator('.project-tree')
    await expect(newTree).toContainText('nested')
    await expect(newTree).toContainText('top.md')
    await expect(newTree).not.toContainText('old-only')
    await expect(newTree).not.toContainText('old.md')

    await newTree.locator('.side-bar-folder .folder-name').filter({ hasText: 'nested' }).click()
    await expect(newTree.locator('.side-bar-file').filter({ hasText: 'inside.md' })).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('Close Folder preserves tabs and dirty buffers and rejects the old generation', async() => {
  test.setTimeout(60_000)
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-close-folder-'))
  const oldRoot = path.join(fixtureRoot, 'old-root')
  const newRoot = path.join(fixtureRoot, 'new-root')
  fs.mkdirSync(oldRoot)
  fs.mkdirSync(newRoot)
  fs.writeFileSync(path.join(oldRoot, 'dirty.md'), '# Dirty source\n')
  fs.writeFileSync(path.join(oldRoot, 'watched.md'), '# Watched source\n')
  fs.writeFileSync(path.join(newRoot, 'new.md'), '# New root\n')

  const { app, page } = await launchElectron([oldRoot], { suppressErrorDialog: true })
  try {
    await waitForMenuReady(app)
    await waitForFolderRoot(page, 'old-root')
    await expect.poll(() => closeFolderMenuEnabled(app)).toBe(true)
    await openTreeFile(page, 'dirty.md')
    await typeIntoEditor(page, ' CLOSE_FOLDER_DIRTY_MARKER')
    await openTreeFile(page, 'watched.md')
    const tabCount = await page.locator('.tabs-container li').count()
    expect(tabCount).toBe(2)
    await clickMenuById(app, 'closeFolderMenuItem')

    await expect(page.locator('.project-tree')).toHaveCount(0)
    await expect(page.locator('.tree-view .open-project')).toBeVisible()
    await expect(page.locator('.side-bar')).toBeVisible()
    await expect(page.locator('.tabs-container li')).toHaveCount(tabCount)
    await expect.poll(() => closeFolderMenuEnabled(app)).toBe(false)

    await app.evaluate(({ BrowserWindow }) => {
      const state = global as unknown as { __mt_document_watcher_events__?: string[] }
      state.__mt_document_watcher_events__ = []
      const webContents = BrowserWindow.getAllWindows()[0]?.webContents
      if (!webContents) throw new Error('Editor webContents is unavailable')
      const send = webContents.send.bind(webContents)
      webContents.send = ((channel: string, ...args: unknown[]) => {
        if (channel === 'mt::update-file') {
          const payload = args[0] as { change?: { pathname?: string } } | undefined
          state.__mt_document_watcher_events__?.push(String(payload?.change?.pathname))
        }
        send(channel, ...args)
      }) as typeof webContents.send
    })
    const watchedPath = path.join(oldRoot, 'watched.md')
    let externalRevision = 0
    await expect.poll(async() => {
      fs.writeFileSync(
        watchedPath,
        `# Watched source changed outside MarkText ${++externalRevision}\n`
      )
      return app.evaluate((_electron, pathname) => {
        const state = global as unknown as { __mt_document_watcher_events__?: string[] }
        return state.__mt_document_watcher_events__?.includes(pathname) ?? false
      }, watchedPath)
    }, { timeout: 10_000, intervals: [1_500] }).toBe(true)

    await page.locator('.tabs-container li').filter({ hasText: 'dirty.md' }).click()
    await expect(page.locator('.editor-component')).toContainText('CLOSE_FOLDER_DIRTY_MARKER')
    await expect(page.locator('.tabs-container li').filter({ hasText: 'dirty.md' })).toHaveClass(
      /unsaved/
    )
    await app.evaluate(({ BrowserWindow, Menu }) => {
      const saveAccelerator = process.platform === 'darwin' ? 'Command+S' : 'Ctrl+S'
      const item = Menu.getApplicationMenu()?.items
        .flatMap(({ submenu }) => submenu?.items ?? [])
        .find(({ accelerator }) => accelerator === saveAccelerator)
      if (!item) throw new Error('File menu Save action is unavailable')
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      item.click(undefined, win, win?.webContents)
    })
    await expect(page.locator('.tabs-container li').filter({ hasText: 'dirty.md' })).not.toHaveClass(
      /unsaved/
    )
    await expect.poll(() => fs.readFileSync(path.join(oldRoot, 'dirty.md'), 'utf8')).toContain(
      'CLOSE_FOLDER_DIRTY_MARKER'
    )

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('mt::update-object-tree', {
        root: { pathname: 'OLD_ROOT', generation: 1 },
        type: 'addDir',
        change: { pathname: 'OLD_ROOT/ghost', name: 'ghost', isDirectory: true }
      })
    })
    await expect(page.locator('.project-tree')).toHaveCount(0)

    await page.evaluate((pathname) => {
      window.electron.ipcRenderer.send('mt::set-user-preference', {
        openFolderInNewWindow: true
      })
      window.electron.ipcRenderer.send('mt::cmd-open-folder-in-current-window', pathname)
    }, newRoot)
    await waitForFolderRoot(page, 'new-root')
    await expect.poll(() => app.windows().length).toBe(1)
    await page.evaluate((pathname) => {
      window.electron.ipcRenderer.send('mt::cmd-open-folder-in-current-window', pathname)
    }, path.join(fixtureRoot, 'missing-root'))
    await expect(page.locator('.project-tree > .title')).toContainText('new-root')
    await app.evaluate(({ BrowserWindow }, pathname) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('mt::update-object-tree', {
        root: { pathname, generation: 1 },
        type: 'addDir',
        change: { pathname: `${pathname}/ghost`, name: 'ghost', isDirectory: true }
      })
    }, oldRoot)
    await expect(page.locator('.project-tree')).not.toContainText('ghost')
    await expect(page.locator('.tabs-container li')).toHaveCount(tabCount)

    await page.evaluate(() => {
      window.electron.ipcRenderer.send('mt::cmd-close-folder')
      window.electron.ipcRenderer.send('mt::cmd-close-folder')
    })
    await expect(page.locator('.project-tree')).toHaveCount(0)
    await expect(page.locator('.tabs-container li')).toHaveCount(tabCount)
    expect(fs.existsSync(path.join(oldRoot, 'dirty.md'))).toBe(true)
    expect(fs.existsSync(path.join(newRoot, 'new.md'))).toBe(true)
  } finally {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
    }).catch(() => undefined)
    await app.close().catch(() => undefined)
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('a closed Folder root is not restored on restart', async() => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-close-folder-restart-'))
  const userDataDir = path.join(fixtureRoot, 'profile')
  const root = path.join(fixtureRoot, 'root-to-close')
  fs.mkdirSync(root)
  fs.writeFileSync(path.join(root, 'note.md'), '# Restart policy\n')

  const first = await launchElectron([root], { userDataDir, userDataDirOwnership: 'caller' })
  let second: ElectronApplication | undefined
  try {
    await waitForFolderRoot(first.page, 'root-to-close')
    const restoreBufferId = await first.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0] as unknown as { restoreBufferId?: string }
      return win.restoreBufferId ?? ''
    })
    expect(restoreBufferId).not.toBe('')
    const bufferPath = path.join(
      userDataDir,
      'editorStates',
      `${restoreBufferId}_editor_buffer_store.json`
    )
    fs.mkdirSync(path.dirname(bufferPath), { recursive: true })
    fs.writeFileSync(bufferPath, JSON.stringify({
      tabs: [{ pathname: path.join(root, 'note.md'), isSaved: true }],
      project: { rootDirectory: root }
    }))

    await first.page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-folder'))
    await expect(first.page.locator('.project-tree')).toHaveCount(0)
    await expect.poll(() => {
      const state = JSON.parse(fs.readFileSync(bufferPath, 'utf8')) as {
        tabs: unknown[]
        project: { rootDirectory: string }
      }
      return { rootDirectory: state.project.rootDirectory, tabCount: state.tabs.length }
    }).toEqual({ rootDirectory: '', tabCount: 1 })
    await first.app.close()

    const restarted = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    second = restarted.app
    await expect(restarted.page.locator('.project-tree')).toHaveCount(0)
    await expect(restarted.page.locator('.tree-view .open-project')).toBeVisible()
  } finally {
    await first.app.close().catch(() => undefined)
    await second?.close().catch(() => undefined)
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
