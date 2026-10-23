import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  clickMenuById,
  closeDiscardingChanges,
  getMarkdownContent,
  launchWithMarkdown
} from './helpers'

// #2552: `==text==` is non-standard, so it renders only while the
// highlightSyntax preference is on and the markdown is never rewritten.
const DOC = ['# Notes', '', '## A ==marked== heading', '', 'Body with ==hi== inside.', ''].join('\n')

const editorMarks = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.editor-component mark')).map((el) =>
      (el.textContent || '').trim()
    )
  )

const outlineMarks = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.side-bar-toc .el-tree-node__label mark')).map((el) =>
      (el.textContent || '').trim()
    )
  )

const showOutline = async(app: ElectronApplication, page: Page): Promise<void> => {
  const sidebarVisible = await page.evaluate(() => {
    const el = document.querySelector('.side-bar') as HTMLElement | null
    return !!(el && el.offsetParent !== null)
  })
  if (!sidebarVisible) await clickMenuById(app, 'sideBarMenuItem')
  await clickMenuById(app, 'tocMenuItem')
  await page.waitForSelector('.side-bar-toc .el-tree', { state: 'visible', timeout: 15000 })
}

test.describe('==highlight== syntax (#2552)', () => {
  test('stays literal text while the preference is off', async() => {
    const { app, page } = await launchWithMarkdown(DOC)
    await showOutline(app, page)
    await expect(page.locator('.editor-component')).toContainText('==hi==')
    expect(await editorMarks(page)).toEqual([])
    expect(await outlineMarks(page)).toEqual([])
    expect(await getMarkdownContent(page, app)).toBe(DOC)
    await closeDiscardingChanges(app)
  })

  test('renders <mark> in the editor and outline when on, keeping the markdown', async() => {
    const { app, page } = await launchWithMarkdown(DOC, { preferences: { highlightSyntax: true } })
    await showOutline(app, page)
    await expect.poll(() => editorMarks(page)).toEqual(['marked', 'hi'])
    await expect.poll(() => outlineMarks(page)).toEqual(['marked'])
    expect(await getMarkdownContent(page, app)).toBe(DOC)
    await closeDiscardingChanges(app)
  })

  test('switching the preference on re-renders an open document and its outline', async() => {
    const { app, page } = await launchWithMarkdown(DOC)
    await showOutline(app, page)
    expect(await editorMarks(page)).toEqual([])
    await page.evaluate(() => {
      window.electron.ipcRenderer.send('mt::set-user-preference', { highlightSyntax: true })
    })
    await expect.poll(() => editorMarks(page)).toEqual(['marked', 'hi'])
    await expect.poll(() => outlineMarks(page)).toEqual(['marked'])
    await closeDiscardingChanges(app)
  })
})
