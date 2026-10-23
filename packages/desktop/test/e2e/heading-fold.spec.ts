import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  clickMenuById,
  closeDiscardingChanges,
  getMarkdownContent,
  launchWithMarkdown
} from './helpers'

// #1869: folding hides a heading's section in the editor only. Outline and
// anchor jumps must still reach a heading inside a folded section.
const filler = Array.from({ length: 40 }, (_, i) => `Filler paragraph ${i + 1}.`).join('\n\n')
const DOC = [
  '# Top',
  '',
  '[to inner](#inner-heading)',
  '',
  '# Folded',
  '',
  'Hidden paragraph.',
  '',
  filler,
  '',
  '## Inner Heading',
  '',
  'Inner body.',
  '',
  '# After',
  '',
  'Visible paragraph.',
  ''
].join('\n')

const foldedContentCount = (page: Page): Promise<number> =>
  page.evaluate(() => document.querySelectorAll('.editor-component .mu-folded-content').length)

const headingVisible = (page: Page, text: string): Promise<boolean> =>
  page.evaluate((label) => {
    const heading = [...document.querySelectorAll('.editor-component h2')].find((el) =>
      (el.textContent || '').includes(label)
    ) as HTMLElement | undefined
    if (!heading || heading.offsetParent === null) return false
    const rect = heading.getBoundingClientRect()
    return rect.top >= 0 && rect.bottom <= window.innerHeight
  }, text)

const foldSecondHeading = async(page: Page): Promise<void> => {
  const heading = page.locator('.editor-component h1').nth(1)
  await heading.hover()
  await heading.locator('.mu-fold-toggle').click()
  await expect.poll(() => foldedContentCount(page)).toBeGreaterThan(0)
  await expect(page.locator('.editor-component').getByText('Hidden paragraph.')).toBeHidden()
}

const showOutline = async(app: ElectronApplication, page: Page): Promise<void> => {
  const sidebarVisible = await page.evaluate(() => {
    const el = document.querySelector('.side-bar') as HTMLElement | null
    return !!(el && el.offsetParent !== null)
  })
  if (!sidebarVisible) await clickMenuById(app, 'sideBarMenuItem')
  await clickMenuById(app, 'tocMenuItem')
  await page.waitForSelector('.side-bar-toc .el-tree', { state: 'visible', timeout: 15000 })
}

test.describe('Heading fold (#1869)', () => {
  test('folding hides the section without changing the markdown', async() => {
    const { app, page } = await launchWithMarkdown(DOC)
    await foldSecondHeading(page)
    await expect(page.locator('.editor-component').getByText('Visible paragraph.')).toBeVisible()
    expect(await getMarkdownContent(page, app)).toBe(DOC)
    await closeDiscardingChanges(app)
  })

  test('an outline jump into a folded section unfolds it and reveals the heading', async() => {
    const { app, page } = await launchWithMarkdown(DOC)
    await showOutline(app, page)
    await foldSecondHeading(page)

    await page.locator('.side-bar-toc .el-tree-node__label').filter({ hasText: 'Inner Heading' }).click()

    await expect.poll(() => headingVisible(page, 'Inner Heading'), { timeout: 8000 }).toBe(true)
    await expect(page.locator('.editor-component').getByText('Hidden paragraph.')).toBeAttached()
    await closeDiscardingChanges(app)
  })

  test('an anchor link into a folded section unfolds it and reveals the heading', async() => {
    const { app, page } = await launchWithMarkdown(DOC)
    await foldSecondHeading(page)

    await page.evaluate(() => {
      const link = [...document.querySelectorAll<HTMLElement>('span.mu-link')].find((el) =>
        (el.dataset.raw || '').includes('#inner-heading')
      )
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, metaKey: true }))
    })

    await expect.poll(() => headingVisible(page, 'Inner Heading'), { timeout: 8000 }).toBe(true)
    await closeDiscardingChanges(app)
  })
})
