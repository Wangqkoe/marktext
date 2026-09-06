import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clickMenuById, launchElectron, launchWithMarkdown, waitForMenuReady } from './helpers'

const STORAGE_KEY = 'side-bar-files-divider-ratio'

const ensureFilesVisible = async(app: ElectronApplication, page: Page): Promise<void> => {
  if (!(await page.locator('.side-bar').isVisible())) await clickMenuById(app, 'sideBarMenuItem')
  await page.getByRole('tab', { name: 'Files' }).click()
  await expect(page.locator('.sidebar-divider')).toBeVisible()
}

const geometry = (page: Page) =>
  page.evaluate(() => {
    const tree = document.querySelector('.tree-view') as HTMLElement
    const opened = document.querySelector('.opened-files') as HTMLElement
    const divider = document.querySelector('.sidebar-divider') as HTMLElement
    const folder = document.querySelector('.project-tree, .open-project') as HTMLElement
    const treeRect = tree.getBoundingClientRect()
    const dividerRect = divider.getBoundingClientRect()
    return {
      treeHeight: treeRect.height,
      openedHeight: opened.getBoundingClientRect().height,
      dividerTop: dividerRect.top - treeRect.top,
      dividerHeight: dividerRect.height,
      folderHeight: folder.getBoundingClientRect().height
    }
  })

const setOpenedFilesPreference = (page: Page, value: boolean): Promise<void> =>
  page.evaluate((enabled) => {
    const app = document.querySelector('#app') as
      | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
      | null
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, Record<string, unknown>> }
      | undefined
    const store = pinia?._s?.get('preferences')
    if (store) store.openedFilesInSidebar = enabled
  }, value)

test.describe('Files sidebar divider', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown('# Divider fixture\n')
    app = launched.app
    page = launched.page
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await ensureFilesVisible(app, page)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('defaults to half the available Files height with independent scrolling regions', async() => {
    const initial = await geometry(page)
    expect(initial.dividerTop).toBeCloseTo(initial.treeHeight / 2, 0)
    expect(initial.openedHeight).toBeCloseTo(initial.dividerTop, 0)
    expect(initial.dividerHeight).toBe(5)
    expect(initial.folderHeight).toBeCloseTo(
      initial.treeHeight - initial.dividerTop - initial.dividerHeight,
      0
    )
    const fixedGeometry = {
      treeHeight: initial.treeHeight,
      openedHeight: initial.openedHeight,
      dividerTop: initial.dividerTop
    }

    await page.evaluate(() => {
      const app = document.querySelector('#app') as
        | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
        | null
      const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, unknown>> }
        | undefined
      const store = pinia?._s?.get('project') as
        | { OPEN_PROJECT?: (pathname: string) => void; projectTree?: { files: unknown[] } }
        | undefined
      store?.OPEN_PROJECT?.('C:\\divider-overflow')
      if (!store?.projectTree) return
      store.projectTree.files = Array.from({ length: 30 }, (_, index) => ({
        id: `divider-file-${index}`,
        pathname: `C:\\divider-overflow\\file-${index}.md`,
        name: `file-${index}.md`,
        isDirectory: false,
        isFile: true,
        isMarkdown: true
      }))
    })
    await expect(page.locator('.project-tree .side-bar-file')).toHaveCount(30)
    await expect.poll(async() => {
      const current = await geometry(page)
      return {
        treeHeight: current.treeHeight,
        openedHeight: current.openedHeight,
        dividerTop: current.dividerTop
      }
    }).toEqual(fixedGeometry)
    const overflow = await page.evaluate(() => {
      const opened = document.querySelector('.opened-files-list') as HTMLElement
      const openedRow = opened.querySelector('.opened-file') as HTMLElement
      for (let index = 0; index < 30; index++) opened.append(openedRow.cloneNode(true))
      const folder = document.querySelector('.project-tree > .tree-wrapper') as HTMLElement
      const openedTitle = document.querySelector('.opened-files > .title') as HTMLElement
      const folderTitle = document.querySelector('.project-tree > .title') as HTMLElement
      const titleTopsBefore = {
        opened: openedTitle.getBoundingClientRect().top,
        folder: folderTitle.getBoundingClientRect().top
      }
      opened.scrollTop = 80
      folder.scrollTop = 80
      return {
        openedOverflow: getComputedStyle(opened).overflowY,
        folderOverflow: getComputedStyle(folder).overflowY,
        openedScrolls: opened.scrollHeight > opened.clientHeight,
        folderScrolls: folder.scrollHeight > folder.clientHeight,
        openedScrollTop: opened.scrollTop,
        folderScrollTop: folder.scrollTop,
        titleTopsBefore,
        titleTopsAfter: {
          opened: openedTitle.getBoundingClientRect().top,
          folder: folderTitle.getBoundingClientRect().top
        },
        openedTitleParent: document.querySelector('.opened-files > .title')?.parentElement
          ?.className,
        folderTitleParent: document.querySelector('.project-tree > .title')?.parentElement
          ?.className
      }
    })
    expect(overflow).toEqual({
      openedOverflow: 'auto',
      folderOverflow: 'auto',
      openedScrolls: true,
      folderScrolls: true,
      openedScrollTop: 80,
      folderScrollTop: 80,
      titleTopsBefore: expect.any(Object),
      titleTopsAfter: expect.any(Object),
      openedTitleParent: 'opened-files',
      folderTitleParent: 'project-tree'
    })
    expect(overflow.titleTopsAfter).toEqual(overflow.titleTopsBefore)
    const afterOverflow = await geometry(page)
    expect({
      treeHeight: afterOverflow.treeHeight,
      openedHeight: afterOverflow.openedHeight,
      dividerTop: afterOverflow.dividerTop
    }).toEqual(fixedGeometry)
  })

  test('drags live, persists on release, restores on reload, and resets on double-click', async() => {
    const divider = page.locator('.sidebar-divider')
    const tree = page.locator('.tree-view')
    const treeBox = await tree.boundingBox()
    const dividerBox = await divider.boundingBox()
    if (!treeBox || !dividerBox) throw new Error('Files divider geometry unavailable')

    await page.mouse.move(dividerBox.x + 2, dividerBox.y + 2)
    await page.mouse.down()
    await page.mouse.move(dividerBox.x + 2, treeBox.y + treeBox.height * 0.65)
    expect((await geometry(page)).dividerTop).toBeCloseTo(treeBox.height * 0.65, 0)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
    await page.mouse.up()

    const saved = Number(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    expect(saved).toBeCloseTo(0.65, 1)
    await page.reload()
    await ensureFilesVisible(app, page)
    expect((await geometry(page)).dividerTop).toBeCloseTo(
      (await geometry(page)).treeHeight * saved,
      0
    )

    await page.locator('.sidebar-divider').dblclick()
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('0.5')
    const reset = await geometry(page)
    expect(reset.dividerTop).toBeCloseTo(reset.treeHeight / 2, 0)
  })

  test('restores the drag-start ratio on pointer cancellation without persisting', async() => {
    const before = await geometry(page)
    const divider = page.locator('.sidebar-divider')
    const box = await divider.boundingBox()
    if (!box) throw new Error('Files divider geometry unavailable')
    await divider.dispatchEvent('pointerdown', {
      pointerId: 17,
      button: 0,
      clientX: box.x + 2,
      clientY: box.y + 2
    })
    await page.evaluate((clientY) => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { pointerId: 17, clientY, bubbles: true })
      )
    }, box.y + 80)
    expect((await geometry(page)).dividerTop).not.toBeCloseTo(before.dividerTop, 0)
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 17, bubbles: true }))
    })
    expect((await geometry(page)).dividerTop).toBeCloseTo(before.dividerTop, 0)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull()
  })

  test('temporarily clamps small heights without overwriting the saved ratio', async() => {
    await page.evaluate((key) => localStorage.setItem(key, '0.75'), STORAGE_KEY)
    await page.reload()
    await ensureFilesVisible(app, page)
    const full = await geometry(page)
    expect(full.dividerTop).toBeCloseTo(full.treeHeight * 0.75, 0)

    await page.locator('.side-bar-content').evaluate((node: HTMLElement) => {
      node.style.flex = '0 0 150px'
      node.style.height = '150px'
    })
    await expect.poll(async() => (await geometry(page)).treeHeight).toBe(150)
    await expect.poll(async() => (await geometry(page)).dividerTop).toBe(85)
    const clamped = await geometry(page)
    expect(clamped.openedHeight).toBeGreaterThanOrEqual(58)
    expect(clamped.folderHeight).toBeGreaterThanOrEqual(60)
    const openFolderFits = await page.getByRole('button', { name: 'Open Folder' }).evaluate((button) => {
      const control = button.getBoundingClientRect()
      const region = (button.closest('.open-project') as HTMLElement).getBoundingClientRect()
      return control.top >= region.top && control.bottom <= region.bottom
    })
    expect(openFolderFits).toBe(true)
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('0.75')

    await page.locator('.side-bar-content').evaluate((node: HTMLElement) => {
      node.removeAttribute('style')
    })
    await expect.poll(async() => (await geometry(page)).treeHeight).toBeGreaterThan(150)
    await expect
      .poll(async() => {
        const current = await geometry(page)
        return current.dividerTop / current.treeHeight
      })
      .toBeCloseTo(0.75, 2)
  })

  test('uses reduced search height while preserving ratio and ignores content changes', async() => {
    const before = await geometry(page)
    await page.getByRole('button', { name: 'Show inline search' }).click()
    await expect
      .poll(async() => {
        const current = await geometry(page)
        return current.dividerTop / current.treeHeight
      })
      .toBeCloseTo(0.5, 2)
    const searched = await geometry(page)
    expect(searched.treeHeight).toBeLessThan(before.treeHeight)
    await page.getByRole('textbox', { name: 'Filter files and folders' }).fill('missing')
    expect((await geometry(page)).dividerTop).toBeCloseTo(searched.dividerTop, 0)
    await page.getByRole('button', { name: 'Hide inline search' }).click()
    await expect.poll(async() => (await geometry(page)).dividerTop).toBeCloseTo(before.dividerTop, 0)
  })

  test('keeps no-root and collapsed layouts, follows the setting, and stays out of Outline', async() => {
    await expect(page.getByRole('button', { name: 'Open Folder' })).toBeVisible()
    const allocated = await geometry(page)
    await page.locator('.opened-files > .title > span').click()
    await expect(page.locator('.opened-files-list')).toBeHidden()
    expect((await geometry(page)).openedHeight).toBeCloseTo(allocated.openedHeight, 0)
    await expect(page.locator('.sidebar-divider')).toBeVisible()

    await setOpenedFilesPreference(page, false)
    await expect(page.locator('.opened-files')).toHaveCount(0)
    await expect(page.locator('.sidebar-divider')).toHaveCount(0)
    await expect(page.locator('.open-project')).toHaveCSS('flex-grow', '1')
    await setOpenedFilesPreference(page, true)
    await expect(page.locator('.sidebar-divider')).toBeVisible()
    expect((await geometry(page)).openedHeight).toBeCloseTo(allocated.openedHeight, 0)

    await page.getByRole('tab', { name: 'Outline' }).click()
    await expect(page.locator('.sidebar-divider')).toBeHidden()
    await page.getByRole('tab', { name: 'Files' }).click()
    await expect(page.locator('.sidebar-divider')).toBeVisible()
    await expect.poll(async() => (await geometry(page)).openedHeight).toBeCloseTo(
      allocated.openedHeight,
      0
    )
  })
})

test('persists across an application restart without moving an already-open window', async() => {
  test.setTimeout(60_000)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-sidebar-divider-restart-'))
  let firstApp: ElectronApplication | undefined
  let restartedApp: ElectronApplication | undefined
  try {
    const first = await launchElectron([], {
      userDataDir: profile,
      userDataDirOwnership: 'caller'
    })
    firstApp = first.app
    await waitForMenuReady(first.app)
    await ensureFilesVisible(first.app, first.page)

    const secondWindow = first.app.waitForEvent('window')
    await first.app.evaluate(({ BrowserWindow, Menu }) => {
      const source = BrowserWindow.getAllWindows()[0]
      const fileMenu = Menu.getApplicationMenu()?.items.find((item) =>
        item.submenu?.items.some((entry) => entry.label === 'New Window')
      )
      const newWindow = fileMenu?.submenu?.items.find((item) => item.label === 'New Window')
      if (!source || !newWindow) throw new Error('File > New Window is unavailable')
      newWindow.click(undefined, source, source.webContents)
    })
    const secondPage = await secondWindow
    await secondPage.waitForLoadState('domcontentloaded')
    await ensureFilesVisible(first.app, secondPage)

    const firstInitial = await geometry(first.page)
    const secondInitial = await geometry(secondPage)
    expect(firstInitial.dividerTop / firstInitial.treeHeight).toBeCloseTo(0.5, 2)
    expect(secondInitial.dividerTop / secondInitial.treeHeight).toBeCloseTo(0.5, 2)

    const dividerBox = await first.page.locator('.sidebar-divider').boundingBox()
    const treeBox = await first.page.locator('.tree-view').boundingBox()
    if (!dividerBox || !treeBox) throw new Error('Files divider geometry unavailable')
    await first.page.mouse.move(dividerBox.x + 2, dividerBox.y + 2)
    await first.page.mouse.down()
    await first.page.mouse.move(dividerBox.x + 2, treeBox.y + treeBox.height * 0.7)
    await first.page.mouse.up()

    await expect.poll(async() => {
      const current = await geometry(first.page)
      return current.dividerTop / current.treeHeight
    }).toBeCloseTo(0.7, 2)
    const secondAfterCommit = await geometry(secondPage)
    expect(secondAfterCommit.dividerTop / secondAfterCommit.treeHeight).toBeCloseTo(0.5, 2)

    await first.app.close()
    firstApp = undefined
    const restarted = await launchElectron([], {
      userDataDir: profile,
      userDataDirOwnership: 'caller'
    })
    restartedApp = restarted.app
    await waitForMenuReady(restarted.app)
    await ensureFilesVisible(restarted.app, restarted.page)
    await expect.poll(async() => {
      const current = await geometry(restarted.page)
      return current.dividerTop / current.treeHeight
    }).toBeCloseTo(0.7, 2)
  } finally {
    await firstApp?.close().catch(() => undefined)
    await restartedApp?.close().catch(() => undefined)
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})
