import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithMarkdown } from './helpers'

const ensureSidebarVisible = async(app: ElectronApplication, page: Page): Promise<void> => {
  if (!(await page.locator('.side-bar').isVisible())) {
    await clickMenuById(app, 'sideBarMenuItem')
  }
  await expect(page.locator('.side-bar')).toBeVisible()
}

const installFixtureTree = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const root = document.querySelector('#app') as
      | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
      | null
    const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, Record<string, unknown>> }
      | undefined
    const store = pinia?._s?.get('project') as
      | {
        OPEN_PROJECT?: (pathname: string) => void
        projectTree?: {
          folders: unknown[]
          files: unknown[]
        }
      }
      | undefined
    if (!store?.OPEN_PROJECT) return false

    store.OPEN_PROJECT('C:\\t04-sidebar-fixture')
    if (!store.projectTree) return false
    store.projectTree.folders = [
      {
        id: 'fixture-folder',
        pathname: 'C:\\t04-sidebar-fixture\\nested',
        name: 'nested',
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
    ]
    store.projectTree.files = [
      {
        id: 'fixture-file',
        pathname: 'C:\\t04-sidebar-fixture\\fixture.md',
        name: 'fixture.md',
        isDirectory: false,
        isFile: true,
        isMarkdown: true
      }
    ]
    return true
  })

test.describe('Files sidebar visual hierarchy', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Sidebar fixture\n')
    app = launched.app
    page = launched.page
    await ensureSidebarVisible(app, page)
    await page.getByRole('tab', { name: 'Files' }).click()
    expect(await installFixtureTree(page)).toBe(true)
    await page.waitForSelector('.project-tree .side-bar-file', { state: 'visible' })
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('applies the 12px inset to every Files row and the confirmed divider spacing', async() => {
    const styles = await page.evaluate(() => {
      const tree = document.querySelector('.tree-view') as HTMLElement
      const opened = document.querySelector('.opened-files') as HTMLElement
      const read = (selector: string) =>
        getComputedStyle(document.querySelector(selector) as HTMLElement)
      return {
        inset: getComputedStyle(tree).getPropertyValue('--files-content-inset').trim(),
        openedTitlePadding: read('.opened-files > .title').paddingLeft,
        rootTitlePadding: read('.project-tree > .title').paddingLeft,
        openedRowPadding: read('.opened-files .opened-file').paddingLeft,
        folderRowPadding: read('.project-tree .folder-name').paddingLeft,
        fileRowPadding: read('.project-tree .side-bar-file').paddingLeft,
        dividerWidth: getComputedStyle(opened).borderBottomWidth,
        dividerStyle: getComputedStyle(opened).borderBottomStyle,
        dividerColor: getComputedStyle(opened).borderBottomColor,
        paddingBottom: getComputedStyle(opened).paddingBottom,
        marginBottom: getComputedStyle(opened).marginBottom
      }
    })

    expect(styles).toEqual({
      inset: '12px',
      openedTitlePadding: '12px',
      rootTitlePadding: '12px',
      openedRowPadding: '47px',
      folderRowPadding: '22px',
      fileRowPadding: '22px',
      dividerWidth: '1px',
      dividerStyle: 'solid',
      dividerColor: expect.not.stringMatching(/^rgba\([^)]*, 0\)$/),
      paddingBottom: '9px',
      marginBottom: '7px'
    })
  })

  test('keeps the full row width as the click and context-menu hit target', async() => {
    const widths = await page.evaluate(() => {
      const treeRight = (
        document.querySelector('.tree-view') as HTMLElement
      ).getBoundingClientRect().right
      return ['.opened-file', '.folder-name', '.side-bar-file'].map((selector) => {
        const rect = (document.querySelector(selector) as HTMLElement).getBoundingClientRect()
        return { width: rect.width, rightGap: Math.round(treeRight - rect.right) }
      })
    })

    for (const row of widths) {
      expect(row.width).toBeGreaterThan(180)
      expect(row.rightGap).toBe(0)
    }
  })

  test('does not apply the Files inset to Outline', async() => {
    await page.getByRole('tab', { name: 'Outline' }).click()
    await page.waitForSelector('.side-bar-toc .el-tree-node__content', { state: 'visible' })

    const outline = await page.evaluate(() => {
      const toc = document.querySelector('.side-bar-toc') as HTMLElement
      const content = document.querySelector('.side-bar-toc .el-tree-node__content') as HTMLElement
      return {
        filesInset: getComputedStyle(toc).getPropertyValue('--files-content-inset').trim(),
        leftOffset: Math.round(
          content.getBoundingClientRect().left - toc.getBoundingClientRect().left
        )
      }
    })

    expect(outline.filesInset).toBe('')
    expect(outline.leftOffset).toBe(0)
  })
})
