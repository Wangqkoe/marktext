import { expect, test } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expectNoRendererErrors, launchElectron } from './helpers'

interface CapturedMenuItem {
  readonly label: string
  readonly type: string
  readonly enabled: boolean
}

const installMenuDriver = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ Menu }) => {
    type PopupOptions = {
      window?: { webContents?: unknown }
    }
    type MenuItemLike = {
      id?: string
      label?: string
      type?: string
      enabled?: boolean
      click?: (...args: unknown[]) => void
    }
    type MenuLike = { items: MenuItemLike[] }
    type Driver = {
      captures: Array<Array<{ label: string; type: string; enabled: boolean }>>
      lastMenu?: MenuLike
      restore(): void
    }
    const prototype = Menu.prototype as unknown as {
      popup(options: PopupOptions): void
    }
    const originalPopup = prototype.popup
    const driver: Driver = {
      captures: [],
      restore: () => {
        prototype.popup = originalPopup
      }
    }
    prototype.popup = function(_options) {
      const menu = this as unknown as MenuLike
      driver.lastMenu = menu
      driver.captures.push(
        menu.items.map((item) => ({
          label: item.label ?? '',
          type: item.type ?? 'normal',
          enabled: item.enabled !== false
        }))
      )
    }
    ;(global as unknown as { __mtOpenedFilesMenuDriver?: Driver }).__mtOpenedFilesMenuDriver =
      driver
  })
}

const restoreMenuDriver = async(app: ElectronApplication): Promise<void> => {
  await app
    .evaluate(() => {
      const state = global as unknown as {
        __mtOpenedFilesMenuDriver?: { restore(): void }
      }
      state.__mtOpenedFilesMenuDriver?.restore()
      delete state.__mtOpenedFilesMenuDriver
    })
    .catch(() => undefined)
}

const triggerContextMenu = async(locator: Locator): Promise<void> => {
  await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    element.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + 4,
        clientY: bounds.top + 4
      })
    )
  })
}

const captureMenu = async(
  app: ElectronApplication,
  locator: Locator
): Promise<CapturedMenuItem[]> => {
  const before = await app.evaluate(() => {
    const state = global as unknown as {
      __mtOpenedFilesMenuDriver?: { captures: unknown[] }
    }
    return state.__mtOpenedFilesMenuDriver?.captures.length ?? 0
  })
  await triggerContextMenu(locator)
  await expect
    .poll(() =>
      app.evaluate(() => {
        const state = global as unknown as {
          __mtOpenedFilesMenuDriver?: { captures: unknown[] }
        }
        return state.__mtOpenedFilesMenuDriver?.captures.length ?? 0
      })
    )
    .toBe(before + 1)
  return app.evaluate(() => {
    const state = global as unknown as {
      __mtOpenedFilesMenuDriver?: { captures: CapturedMenuItem[][] }
    }
    return state.__mtOpenedFilesMenuDriver?.captures.at(-1) ?? []
  })
}

const clickCapturedMenuItem = async(app: ElectronApplication, label: string): Promise<void> => {
  await app.evaluate(({ BrowserWindow }, itemLabel) => {
    const state = global as unknown as {
      __mtOpenedFilesMenuDriver?: {
        lastMenu?: {
          items: Array<{ label?: string; click?: (...args: unknown[]) => void }>
        }
      }
    }
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    const item = state.__mtOpenedFilesMenuDriver?.lastMenu?.items.find(
      (candidate) => candidate.label === itemLabel
    )
    if (!item?.click) throw new Error(`Captured context menu item ${itemLabel} is unavailable`)
    item.click(undefined, win, win?.webContents)
  }, label)
}

const waitForFolderRoot = async(page: Page, name: string): Promise<void> => {
  await expect(page.locator('.project-tree > .title')).toContainText(name, { timeout: 10_000 })
}

test('tab bar and focused-pane Opened Files share the captured complete menu', async() => {
  test.setTimeout(60_000)
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-opened-files-menu-'))
  const profile = path.join(fixture, 'profile')
  const root = path.join(fixture, 'root')
  const nested = path.join(root, 'nested')
  const topFile = path.join(root, 'same.md')
  const nestedFile = path.join(nested, 'same.md')
  fs.mkdirSync(nested, { recursive: true })
  fs.writeFileSync(topFile, '# Top file\n')
  fs.writeFileSync(nestedFile, '# Nested file\n')

  const { app, page } = await launchElectron([root], {
    userDataDir: profile,
    userDataDirOwnership: 'caller',
    suppressErrorDialog: true
  })
  try {
    await waitForFolderRoot(page, 'root')
    await page.getByTitle(topFile, { exact: true }).click()
    await expect(page.locator('.tabs-container > li')).toHaveCount(1)
    await page.evaluate((filePath) => {
      window.electron.ipcRenderer.send('mt::open-file', filePath, {})
    }, nestedFile)
    await expect(page.locator('.tabs-container > li')).toHaveCount(2)

    await installMenuDriver(app)
    const nestedTab = page.locator('.tabs-container > li').nth(1)
    await expect(nestedTab).toHaveAttribute('title', nestedFile)
    const splitMenu = await captureMenu(app, nestedTab)
    expect(splitMenu.find((item) => item.label === 'Split Right')).toMatchObject({ enabled: true })
    await clickCapturedMenuItem(app, 'Split Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    const leftTab = page.locator('.workspace-pane').nth(0).locator('.tabs-container > li')
    const rightTab = page.locator('.workspace-pane').nth(1).locator('.tabs-container > li')
    await expect(leftTab).toHaveAttribute('title', topFile)
    await expect(rightTab).toHaveAttribute('title', nestedFile)

    const rightOpenedFile = page.locator('.opened-file').first()
    await expect(rightOpenedFile).toHaveAttribute('title', nestedFile)
    const tabMenu = await captureMenu(app, rightTab)
    const openedMenu = await captureMenu(app, rightOpenedFile)
    expect(openedMenu).toEqual(tabMenu)
    expect(
      openedMenu.map((item) => (item.type === 'separator' ? 'separator' : item.label))
    ).toEqual([
      'Close',
      'Close others',
      'Close saved tabs',
      'Close all tabs',
      'separator',
      'Open This Folder',
      'separator',
      'Rename',
      'Copy path',
      'Show in folder',
      'separator',
      'Move to new window',
      'Open in new window',
      'Split Right'
    ])

    await page.locator('.workspace-pane').nth(0).click()
    await expect(page.locator('.opened-file').first()).toHaveAttribute('title', topFile)
    const topMenu = await captureMenu(app, page.locator('.opened-file').first())
    expect(topMenu.find((item) => item.label === 'Close This Folder')).toMatchObject({
      enabled: true
    })

    await page.locator('.workspace-pane').nth(1).click()
    const capturedRightOpenedFile = page.locator('.opened-file').first()
    await expect(capturedRightOpenedFile).toHaveAttribute('title', nestedFile)
    await page.evaluate(() => {
      window.electron.ipcRenderer.send('mt::set-user-preference', { openFolderInNewWindow: true })
    })
    const capturedMenu = await captureMenu(app, capturedRightOpenedFile)
    expect(capturedMenu.find((item) => item.label === 'Open This Folder')).toMatchObject({
      enabled: true
    })

    await page.locator('.workspace-pane').nth(0).click()
    await expect(page.locator('.opened-file').first()).toHaveAttribute('title', topFile)
    await clickCapturedMenuItem(app, 'Open This Folder')
    await waitForFolderRoot(page, 'nested')
    await expect
      .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
      .toBe(1)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const driver = window as unknown as {
            __mtWorkspaceSnapshot?: () => { projection: { focusedPaneId: string } }
          }
          return driver.__mtWorkspaceSnapshot?.().projection.focusedPaneId
        })
      )
      .toBe('right')
    await expect(page.locator('.opened-file').first()).toHaveAttribute('title', nestedFile)

    const closeMenu = await captureMenu(app, page.locator('.opened-file').first())
    expect(closeMenu.find((item) => item.label === 'Close This Folder')).toMatchObject({
      enabled: true
    })
    await clickCapturedMenuItem(app, 'Close This Folder')
    await expect(page.locator('.project-tree')).toHaveCount(0)
    await expect(page.locator('.tree-view .open-project')).toBeVisible()
    await expect(page.locator('.workspace-pane')).toHaveCount(2)

    await page.locator('.workspace-pane').nth(1).locator('.new-file').click()
    const untitledTab = page
      .locator('.workspace-pane')
      .nth(1)
      .locator('.tabs-container > li')
      .last()
    const untitledOpenedFile = page.locator('.opened-file').last()
    const untitledTabMenu = await captureMenu(app, untitledTab)
    const untitledOpenedMenu = await captureMenu(app, untitledOpenedFile)
    expect(untitledOpenedMenu).toEqual(untitledTabMenu)
    expect(untitledOpenedMenu.find((item) => item.label === 'Open This Folder')).toMatchObject({
      enabled: false
    })
    await expectNoRendererErrors(app)
  } finally {
    await restoreMenuDriver(app)
    await app.close().catch(() => undefined)
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})
