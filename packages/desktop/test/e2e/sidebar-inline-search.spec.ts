import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithMarkdown } from './helpers'

const MARKDOWN = '# Guide\n\n## Details\n\n## DETAILS\n\n# Other\n'

const ensureSidebarVisible = async(app: ElectronApplication, page: Page): Promise<void> => {
  if (!(await page.locator('.side-bar').isVisible())) await clickMenuById(app, 'sideBarMenuItem')
  await expect(page.locator('.side-bar')).toBeVisible()
}

const installFixtureTree = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const app = document.querySelector('#app') as
      | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
      | null
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, Record<string, unknown>> }
      | undefined
    const store = pinia?._s?.get('project') as
      | {
        OPEN_PROJECT?: (pathname: string) => void
        projectTree?: { folders: unknown[]; files: unknown[] }
      }
      | undefined
    if (!store?.OPEN_PROJECT) return false
    store.OPEN_PROJECT('C:\\t05-sidebar-fixture')
    if (!store.projectTree) return false
    store.projectTree.folders = [
      {
        id: 'guide-folder',
        pathname: 'C:\\t05-sidebar-fixture\\guide',
        name: 'guide',
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: [
          {
            id: 'guide-file',
            pathname: 'C:\\t05-sidebar-fixture\\guide\\guide-notes.md',
            name: 'guide-notes.md',
            isDirectory: false,
            isFile: true,
            isMarkdown: true
          },
          {
            id: 'other-file',
            pathname: 'C:\\t05-sidebar-fixture\\guide\\other.md',
            name: 'other.md',
            isDirectory: false,
            isFile: true,
            isMarkdown: true
          }
        ]
      },
      {
        id: 'archive-folder',
        pathname: 'C:\\t05-sidebar-fixture\\archive',
        name: 'archive',
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: [
          {
            id: 'archive-file',
            pathname: 'C:\\t05-sidebar-fixture\\archive\\Guide.md',
            name: 'Guide.md',
            isDirectory: false,
            isFile: true,
            isMarkdown: true
          }
        ]
      },
      {
        id: 'empty-folder',
        pathname: 'C:\\t05-sidebar-fixture\\empty',
        name: 'empty',
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
    ]
    store.projectTree.files = []
    return true
  })

const visibleFileNames = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.project-tree .side-bar-file'))
      .filter((node) => (node as HTMLElement).offsetParent !== null)
      .map((node) => {
        const spans = Array.from(node.children).filter((child) => child.tagName === 'SPAN')
        return (spans.at(-1)?.textContent ?? '').trim()
      })
      .filter(Boolean)
  )

const visibleFolderNames = (page: Page): Promise<string[]> =>
  page.locator('.project-tree .folder-name:visible > span').allTextContents()

test.describe('Files and Outline inline search', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(MARKDOWN)
    app = launched.app
    page = launched.page
    await ensureSidebarVisible(app, page)
    await page.getByRole('tab', { name: 'Files' }).click()
    expect(await installFixtureTree(page)).toBe(true)
    await expect(page.locator('.project-tree')).toBeVisible()
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('toggles a content-pushing Files input and supports prefix/file-priority filtering', async() => {
    const contentTop = await page
      .locator('.side-bar-content')
      .evaluate((node) => node.getBoundingClientRect().top)
    await page.getByRole('button', { name: 'Show inline search' }).click()
    const input = page.getByRole('textbox', { name: 'Filter files and folders' })
    await expect(input).toBeFocused()
    await expect(input).toHaveAttribute('placeholder', /file:.*folder:/)
    expect(
      await page.locator('.side-bar-content').evaluate((node) => node.getBoundingClientRect().top)
    ).toBeGreaterThan(contentTop)

    await input.fill('GuIdE')
    await expect.poll(() => visibleFolderNames(page)).toEqual(['guide', 'archive'])
    await expect.poll(() => visibleFileNames(page)).toEqual(['guide-notes.md', 'Guide.md'])

    await input.fill('FILE:  guide ')
    await expect.poll(() => visibleFileNames(page)).toEqual(['guide-notes.md', 'Guide.md'])

    await input.fill('folder:')
    await expect.poll(() => visibleFolderNames(page)).toEqual(['guide', 'archive', 'empty'])
    await expect(page.locator('.project-tree .side-bar-file:visible')).toHaveCount(0)

    await input.fill('kind:guide')
    await expect(page.locator('.filter-no-results')).toBeVisible()
  })

  test('shows full original directory contents on manual expansion and restores prior collapse', async() => {
    await page.getByRole('button', { name: 'Show inline search' }).click()
    const input = page.getByRole('textbox', { name: 'Filter files and folders' })
    await input.fill('archive')
    await expect(page.locator('.folder-name', { hasText: 'archive' })).toBeVisible()
    await expect(page.locator('.side-bar-file', { hasText: 'Guide.md' })).toHaveCount(0)
    await page.locator('.folder-name', { hasText: 'archive' }).click()
    await expect(page.locator('.side-bar-file', { hasText: 'Guide.md' })).toBeVisible()

    await input.fill('')
    const guide = page.locator('.folder-name', { hasText: 'guide' })
    await guide.click()
    await expect(page.locator('.side-bar-file', { hasText: 'guide-notes.md' })).toHaveCount(0)
    await input.fill('guide-notes')
    await expect(page.locator('.side-bar-file', { hasText: 'guide-notes.md' })).toBeVisible()
    await input.press('Escape')
    await expect(input).toHaveCount(0)
    await expect(page.locator('.side-bar-file', { hasText: 'guide-notes.md' })).toHaveCount(0)
  })

  test('keeps Folder root and Opened Files section toggles inside the search overlay', async() => {
    const rootTitle = page.locator('.project-tree > .title > span')
    const openedTitle = page.locator('.opened-files > .title > span')
    const rootContents = page.locator('.project-tree > .tree-wrapper')
    const openedContents = page.locator('.opened-files > .opened-files-list')

    await rootTitle.click()
    await openedTitle.click()
    await expect(rootContents).toBeHidden()
    await expect(openedContents).toBeHidden()
    await expect.poll(() => page.evaluate(() => ({
      directories: localStorage.getItem('side-bar-show-directories'),
      opened: localStorage.getItem('side-bar-show-opened-files')
    }))).toEqual({ directories: 'false', opened: 'false' })

    await page.getByRole('button', { name: 'Show inline search' }).click()
    const input = page.getByRole('textbox', { name: 'Filter files and folders' })
    await input.fill('note')
    await expect(rootContents).toBeVisible()
    await expect(openedContents).toBeVisible()

    await rootTitle.click()
    await openedTitle.click()
    await expect(rootContents).toBeHidden()
    await expect(openedContents).toBeHidden()
    await expect.poll(() => page.evaluate(() => ({
      directories: localStorage.getItem('side-bar-show-directories'),
      opened: localStorage.getItem('side-bar-show-opened-files')
    }))).toEqual({ directories: 'false', opened: 'false' })

    await input.fill('')
    await expect(rootContents).toBeHidden()
    await expect(openedContents).toBeHidden()
    await expect.poll(() => page.evaluate(() => ({
      directories: localStorage.getItem('side-bar-show-directories'),
      opened: localStorage.getItem('side-bar-show-opened-files')
    }))).toEqual({ directories: 'false', opened: 'false' })

    await input.fill('note')
    await expect(rootContents).toBeVisible()
    await expect(openedContents).toBeVisible()
    await page.getByRole('button', { name: 'Hide inline search' }).click()
    await expect(rootContents).toBeHidden()
    await expect(openedContents).toBeHidden()
    await expect.poll(() => page.evaluate(() => ({
      directories: localStorage.getItem('side-bar-show-directories'),
      opened: localStorage.getItem('side-bar-show-opened-files')
    }))).toEqual({ directories: 'false', opened: 'false' })
  })

  test('recomputes the projection for watcher-like updates, Folder replacement, and no root', async() => {
    await page.getByRole('button', { name: 'Show inline search' }).click()
    const input = page.getByRole('textbox', { name: 'Filter files and folders' })
    const rootTitle = page.locator('.project-tree > .title > span')
    const openedTitle = page.locator('.opened-files > .title > span')
    const rootContents = page.locator('.project-tree > .tree-wrapper')
    const openedContents = page.locator('.opened-files > .opened-files-list')
    await input.fill('watcher')
    await page.evaluate(() => {
      const app = document.querySelector('#app') as
        | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
        | null
      const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, unknown>> }
        | undefined
      const store = pinia?._s?.get('project') as
        | { projectTree?: { files: unknown[] } | null }
        | undefined
      store?.projectTree?.files.push({
        id: 'watcher-file',
        pathname: 'C:\\t05-sidebar-fixture\\watcher.md',
        name: 'watcher.md',
        isDirectory: false,
        isFile: true,
        isMarkdown: true
      })
    })
    await expect(page.locator('.side-bar-file', { hasText: 'watcher.md' })).toBeVisible()

    // A same-root watcher mutation must not clear the current search or its
    // section state. Hide both sections before replacing the root so the new
    // identity must explicitly discard these overlays.
    await input.fill('note')
    await expect(rootContents).toBeVisible()
    await expect(openedContents).toBeVisible()
    await rootTitle.click()
    await openedTitle.click()
    await expect(rootContents).toBeHidden()
    await expect(openedContents).toBeHidden()

    await page.evaluate(() => {
      const app = document.querySelector('#app') as
        | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
        | null
      const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, unknown>> }
        | undefined
      const store = pinia?._s?.get('project') as
        | {
          OPEN_PROJECT?: (pathname: string) => void
          projectTree?: { files: unknown[] } | null
        }
        | undefined
      store?.OPEN_PROJECT?.('C:\\t05-replacement')
      store?.projectTree?.files.push({
        id: 'replacement-file',
        pathname: 'C:\\t05-replacement\\note-replacement.md',
        name: 'note-replacement.md',
        isDirectory: false,
        isFile: true,
        isMarkdown: true
      })
    })
    await expect(page.locator('.side-bar-file', { hasText: 'note-replacement.md' })).toBeVisible()
    await expect(page.locator('.side-bar-file', { hasText: 'watcher.md' })).toHaveCount(0)
    await expect(rootContents).toBeVisible()
    await expect(openedContents).toBeVisible()
    await expect.poll(() => page.evaluate(() => ({
      directories: localStorage.getItem('side-bar-show-directories'),
      opened: localStorage.getItem('side-bar-show-opened-files')
    }))).toEqual({ directories: null, opened: null })

    await rootTitle.click()
    await openedTitle.click()
    await expect(rootContents).toBeHidden()
    await expect(openedContents).toBeHidden()
    await page.evaluate(() => {
      const app = document.querySelector('#app') as
        | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
        | null
      const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, unknown>> }
        | undefined
      const store = pinia?._s?.get('project') as
        | {
          CLOSE_FOLDER?: (identity: { pathname: string; generation: number }) => void
          folderRootIdentity?: { pathname: string; generation: number } | null
        }
        | undefined
      if (store?.folderRootIdentity) store.CLOSE_FOLDER?.({ ...store.folderRootIdentity })
    })
    await input.fill('file:note')
    await expect(page.locator('.opened-file', { hasText: 'note.md' })).toBeVisible()
    await expect(page.locator('.project-tree')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Open Folder' })).toBeVisible()
    await input.fill('folder:')
    await expect(page.locator('.opened-file:visible')).toHaveCount(0)

    await input.fill('note')
    await page.evaluate(() => {
      const app = document.querySelector('#app') as
        | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
        | null
      const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, unknown>> }
        | undefined
      const store = pinia?._s?.get('project') as
        | {
          OPEN_PROJECT?: (pathname: string) => void
          projectTree?: { files: unknown[] } | null
        }
        | undefined
      store?.OPEN_PROJECT?.('C:\\t05-reopened')
      store?.projectTree?.files.push({
        id: 'reopened-file',
        pathname: 'C:\\t05-reopened\\note-reopened.md',
        name: 'note-reopened.md',
        isDirectory: false,
        isFile: true,
        isMarkdown: true
      })
    })
    await expect(page.locator('.side-bar-file', { hasText: 'note-reopened.md' })).toBeVisible()
    await expect(rootContents).toBeVisible()
    await expect(openedContents).toBeVisible()
    await expect.poll(() => page.evaluate(() => ({
      directories: localStorage.getItem('side-bar-show-directories'),
      opened: localStorage.getItem('side-bar-show-opened-files')
    }))).toEqual({ directories: null, opened: null })
  })

  test('keeps the input open across Files/Outline, clears it, and preserves duplicate heading keys', async() => {
    await page.getByRole('button', { name: 'Show inline search' }).click()
    const filesInput = page.getByRole('textbox', { name: 'Filter files and folders' })
    await filesInput.fill('guide')
    await page.getByRole('tab', { name: 'Outline' }).click()

    const outlineInput = page.getByRole('textbox', { name: 'Filter outline' })
    await expect(outlineInput).toBeVisible()
    await expect(outlineInput).toHaveValue('')
    await expect(outlineInput).toHaveAttribute('placeholder', 'Filter outline')
    await outlineInput.fill('details')
    await expect(page.locator('.side-bar-toc .el-tree-node__label:visible')).toHaveText([
      'Guide',
      'Details',
      'DETAILS'
    ])

    await outlineInput.fill('')
    await page.evaluate(() => {
      const labels = Array.from(
        document.querySelectorAll('.side-bar-toc .el-tree-node__label')
      ) as HTMLElement[]
      const guide = labels.find((label) => label.textContent?.trim() === 'Guide')
      const icon = guide?.parentElement?.querySelector(
        '.el-tree-node__expand-icon'
      ) as HTMLElement | null
      if (!icon) throw new Error('Guide outline expand icon unavailable')
      icon.click()
    })
    await expect(page.locator('.side-bar-toc .el-tree-node__label:visible')).toHaveText([
      'Guide',
      'Other'
    ])
    await outlineInput.fill('details')
    await expect(page.locator('.side-bar-toc .el-tree-node__label:visible')).toHaveText([
      'Guide',
      'Details',
      'DETAILS'
    ])
    await outlineInput.fill('')
    await expect(page.locator('.side-bar-toc .el-tree-node__label:visible')).toHaveText([
      'Guide',
      'Other'
    ])
  })

  test('second toggle closes and Edit Find in Folder still opens the independent Search view', async() => {
    await page.getByRole('button', { name: 'Show inline search' }).click()
    await page.getByRole('button', { name: 'Hide inline search' }).click()
    await expect(page.getByRole('textbox', { name: 'Filter outline' })).toHaveCount(0)

    await app.evaluate(({ Menu, BrowserWindow }) => {
      const menu = Menu.getApplicationMenu()
      const item = menu?.items
        .flatMap((top) => top.submenu?.items ?? [])
        .find((candidate) => candidate.label === 'Find in Folder')
      const win = BrowserWindow.getAllWindows()[0]
      if (!item || !win) throw new Error('Find in Folder menu item unavailable')
      item.click(undefined, win, win.webContents)
    })
    await expect(page.locator('.side-bar-search')).toBeVisible()
    await expect(page.locator('.side-bar-inline-search')).toHaveCount(0)
  })
})
