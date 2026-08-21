import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithMarkdown } from './helpers'

// #2421 — completely hiding the sidebar must not lose its expanded width or
// child-view state. These assertions drive the real built app.

const sideBarWidth = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('.side-bar') as HTMLElement | null
    return el ? Math.round(el.getBoundingClientRect().width) : 0
  })

test.describe('#2421 sidebar state survives complete hide/show', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Doc\n\n## A\n\n## B\n')
    app = launched.app
    page = launched.page
    // The files panel is the default right column; make sure it is open + wide.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.side-bar') as HTMLElement | null
        return !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 220)
      },
      null,
      { timeout: 5000 }
    )
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('hiding then restoring preserves a widened sidebar width', async() => {
    // Widen the sidebar past the 220px minimum by dragging the drag-bar, so a
    // width loss on collapse is observable (the default already sits at 220).
    const dragBar = page.locator('.side-bar .drag-bar')
    const box = await dragBar.boundingBox()
    if (!box) throw new Error('Sidebar resize handle is not visible')
    await page.mouse.move(box.x + box.width / 2, box.y + 80)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + 80, { steps: 8 })
    await page.mouse.up()
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.side-bar') as HTMLElement | null
        return !!el && el.getBoundingClientRect().width >= 300
      },
      null,
      { timeout: 5000 }
    )

    const widened = await sideBarWidth(page)
    expect(widened).toBeGreaterThanOrEqual(300)

    await clickMenuById(app, 'sideBarMenuItem')
    await expect(page.locator('.side-bar')).toBeHidden()
    expect(await sideBarWidth(page)).toBe(0)

    await clickMenuById(app, 'sideBarMenuItem')
    await expect(page.locator('.side-bar')).toBeVisible()

    const reExpanded = await sideBarWidth(page)
    // The widened width must survive the collapse round-trip (it was reset to
    // the clamped 220px before the fix).
    expect(Math.abs(reExpanded - widened)).toBeLessThanOrEqual(3)
  })

  test('a collapsed tree section stays collapsed after toggling the sidebar', async() => {
    const arrow = page.locator('.side-bar .opened-files > .title .icon-arrow').first()
    await expect(arrow).toBeVisible()

    // Collapse the "Opened files" section.
    await arrow.click()
    await page.waitForFunction(
      () => {
        const a = document.querySelector('.side-bar .opened-files .icon-arrow')
        return !!(a && a.classList.contains('fold'))
      },
      null,
      { timeout: 5000 }
    )

    // Toggle the complete sidebar off and back on through the public command.
    await clickMenuById(app, 'sideBarMenuItem')
    await expect(page.locator('.side-bar')).toBeHidden()
    await clickMenuById(app, 'sideBarMenuItem')
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.side-bar .opened-files') as HTMLElement | null
        return !!(el && el.offsetParent !== null)
      },
      null,
      { timeout: 5000 }
    )

    const stillCollapsed = await page.evaluate(() => {
      const a = document.querySelector('.side-bar .opened-files .icon-arrow')
      return !!(a && a.classList.contains('fold'))
    })
    expect(stillCollapsed).toBe(true)
  })

  test('a collapsed Outline branch survives complete hide/show', async() => {
    await page.getByRole('tab', { name: 'Outline' }).click()
    const rootNode = page.locator('.side-bar-toc .el-tree-node').first()
    const expandIcon = rootNode.locator(
      ':scope > .el-tree-node__content .el-tree-node__expand-icon'
    )
    await expect(rootNode).toHaveClass(/is-expanded/)
    await expandIcon.click()
    await expect(rootNode).not.toHaveClass(/is-expanded/)

    await clickMenuById(app, 'sideBarMenuItem')
    await expect(page.locator('.side-bar')).toBeHidden()
    await clickMenuById(app, 'sideBarMenuItem')

    await expect(page.getByRole('tab', { name: 'Outline' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(rootNode).not.toHaveClass(/is-expanded/)
  })

  test('project search input survives complete hide/show', async() => {
    await page.getByRole('button', { name: 'Search' }).click()
    const searchInput = page.getByPlaceholder('Search in folder...')
    await searchInput.fill('persistent query')

    await clickMenuById(app, 'sideBarMenuItem')
    await expect(page.locator('.side-bar')).toBeHidden()
    await clickMenuById(app, 'sideBarMenuItem')

    await expect(page.getByRole('button', { name: 'Search' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(searchInput).toHaveValue('persistent query')
  })
})
