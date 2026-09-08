import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import { clickMenuById, launchWithMarkdown } from './helpers'

const ensureFilesVisible = async(app: ElectronApplication, page: Page): Promise<void> => {
  if (!(await page.locator('.side-bar').isVisible())) await clickMenuById(app, 'sideBarMenuItem')
  await page.getByRole('tab', { name: 'Files' }).click()
}

const visibleFileNames = (page: Page): Promise<string[]> =>
  page
    .locator('.project-tree > .tree-wrapper > .side-bar-file')
    .evaluateAll((rows) => rows.map((row) => row.lastElementChild?.textContent ?? ''))

test('folder title menu controls all file sort modes and persists the selected preference', async(
  { browserName: _browserName },
  testInfo
) => {
  const launched = await launchWithMarkdown('# Folder sort fixture\n')
  const { app, page, userDataDir } = launched

  try {
    await ensureFilesVisible(app, page)
    await page.evaluate(() => {
      const vueApp = (document.querySelector('#app') as Element & {
        __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } }
      }).__vue_app__
      const pinia = vueApp?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, unknown>> }
        | undefined
      const project = pinia?._s?.get('project')
      if (!project) throw new Error('Project store unavailable')
      project.projectTree = {
        pathname: 'C:\\folder-sort',
        name: 'A very long folder name that must leave room for the sort button',
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [
          {
            id: 'folder-zebra',
            pathname: 'C:\\folder-sort\\zebra',
            name: 'zebra',
            isDirectory: true,
            isFile: false,
            isMarkdown: false,
            folders: [],
            files: []
          },
          {
            id: 'folder-alpha',
            pathname: 'C:\\folder-sort\\alpha',
            name: 'alpha',
            isDirectory: true,
            isFile: false,
            isMarkdown: false,
            folders: [],
            files: []
          }
        ],
        files: [
          {
            id: 'file-zeta',
            pathname: 'C:\\folder-sort\\zeta.md',
            name: 'zeta.md',
            birthTime: 200,
            mtimeMs: 200,
            isDirectory: false,
            isFile: true,
            isMarkdown: true
          },
          {
            id: 'file-alpha',
            pathname: 'C:\\folder-sort\\alpha.md',
            name: 'alpha.md',
            birthTime: 300,
            mtimeMs: 100,
            isDirectory: false,
            isFile: true,
            isMarkdown: true
          },
          {
            id: 'file-beta',
            pathname: 'C:\\folder-sort\\beta.md',
            name: 'beta.md',
            birthTime: 100,
            mtimeMs: 300,
            isDirectory: false,
            isFile: true,
            isMarkdown: true
          }
        ]
      }
    })

    const sortButton = page.getByRole('button', { name: 'File Sort By' })
    await expect(sortButton).toBeVisible()
    await sortButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()

    const cases = [
      ['File Name · A → Z', ['alpha.md', 'beta.md', 'zeta.md'], 'title', 'asc'],
      ['File Name · Z → A', ['zeta.md', 'beta.md', 'alpha.md'], 'title', 'desc'],
      ['Modification Time · Newest First', ['beta.md', 'zeta.md', 'alpha.md'], 'modified', 'desc'],
      ['Modification Time · Oldest First', ['alpha.md', 'zeta.md', 'beta.md'], 'modified', 'asc'],
      ['Creation Time · Newest First', ['alpha.md', 'zeta.md', 'beta.md'], 'created', 'desc'],
      ['Creation Time · Oldest First', ['beta.md', 'zeta.md', 'alpha.md'], 'created', 'asc']
    ] as const

    for (const [label, expected, sortBy, sortOrder] of cases) {
      await page.getByRole('menuitem', { name: label }).click()
      await expect.poll(() => visibleFileNames(page)).toEqual(expected)
      const state = await page.evaluate(() => {
        const vueApp = (document.querySelector('#app') as Element & {
          __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } }
        }).__vue_app__
        const pinia = vueApp?.config?.globalProperties?.$pinia as
          | { _s?: Map<string, Record<string, unknown>> }
          | undefined
        const preferences = pinia?._s?.get('preferences')
        return [preferences?.fileSortBy, preferences?.fileSortOrder]
      })
      expect(state).toEqual([sortBy, sortOrder])
      expect(
        await page.locator('.project-tree > .tree-wrapper > .side-bar-folder > .folder-name > span')
          .allTextContents()
      ).toEqual(['alpha', 'zebra'])

      await sortButton.click()
      const selected = page.getByRole('menuitem', { name: label })
      await expect(selected.locator('.sort-check .el-icon')).toHaveCount(1)
    }

    await page.screenshot({ path: testInfo.outputPath('folder-tree-sort.png') })
    await expect.poll(() => {
      const preferencePath = `${userDataDir}\\preferences.json`
      if (!fs.existsSync(preferencePath)) return null
      const preference = JSON.parse(fs.readFileSync(preferencePath, 'utf8'))
      return [preference.fileSortBy, preference.fileSortOrder]
    }).toEqual(['created', 'asc'])
  } finally {
    await app.close()
  }
})
