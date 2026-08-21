import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, clickMenuById, sendIpcToRenderer } from './helpers'

// Wait until a `v-show`-toggled element's visibility differs from `wasVisible`.
// A missing element counts as "not visible", so the change-detection logic
// stays consistent whether v-show clears the inline style or unmounts the node.
const waitForVisibilityFlip = (page: Page, selector: string, wasVisible: boolean) =>
  page.waitForFunction(
    ({ sel, prior }) => {
      const el = document.querySelector(sel) as HTMLElement | null
      const visible = !!(el && el.style.display !== 'none' && el.offsetParent !== null)
      return visible !== prior
    },
    { sel: selector, prior: wasVisible },
    { timeout: 5000 }
  )

const ensureSidebarVisible = async(page: Page, app: ElectronApplication): Promise<void> => {
  if (!(await page.locator('.side-bar').isVisible())) {
    await clickMenuById(app, 'sideBarMenuItem')
  }
}

test.describe('Layout panel toggles', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Layout\n\n## Section A\n\n## Section B\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('Sidebar toggle changes .side-bar visibility', async() => {
    const sideBar = page.locator('.side-bar')
    const initial = await sideBar.isVisible()
    await clickMenuById(app, 'sideBarMenuItem')
    await waitForVisibilityFlip(page, '.side-bar', initial)
    const afterToggle = await sideBar.isVisible()
    expect(afterToggle).not.toBe(initial)
    await clickMenuById(app, 'sideBarMenuItem')
  })

  test('Tab bar toggle flips .editor-tabs visibility', async() => {
    const tabBar = page.locator('.editor-tabs')
    const initial = await tabBar.isVisible()
    await clickMenuById(app, 'tabBarMenuItem')
    await waitForVisibilityFlip(page, '.editor-tabs', initial)
    const afterToggle = await tabBar.isVisible()
    expect(afterToggle).not.toBe(initial)
    await clickMenuById(app, 'tabBarMenuItem')
  })

  test('Sidebar uses full-pane navigation and active view selection is a no-op', async() => {
    const sideBar = page.locator('.side-bar')
    await ensureSidebarVisible(page, app)

    await expect(page.locator('.side-bar .left-column')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Files' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Outline' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()

    const filesTab = page.getByRole('tab', { name: 'Files' })
    await filesTab.click()
    const width = await sideBar.evaluate((element) => element.getBoundingClientRect().width)
    await filesTab.click()

    await expect(sideBar).toBeVisible()
    await expect(filesTab).toHaveAttribute('aria-selected', 'true')
    expect(await sideBar.evaluate((element) => element.getBoundingClientRect().width)).toBe(width)
  })

  test('Sidebar view commands open the complete pane and preserve its width', async() => {
    const sideBar = page.locator('.side-bar')
    await ensureSidebarVisible(page, app)

    await page.getByRole('tab', { name: 'Outline' }).click()
    await expect(page.locator('.side-bar-toc')).toBeVisible()
    const expandedWidth = await sideBar.evaluate((element) =>
      Math.round(element.getBoundingClientRect().width)
    )

    await clickMenuById(app, 'sideBarMenuItem')
    await expect(sideBar).toBeHidden()
    expect(
      await sideBar.evaluate((element) => Math.round(element.getBoundingClientRect().width))
    ).toBe(0)

    await sendIpcToRenderer(app, 'mt::set-view-layout', { rightColumn: 'search' })
    await expect(sideBar).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(page.locator('.side-bar-search')).toBeVisible()
    expect(
      await sideBar.evaluate((element) => Math.round(element.getBoundingClientRect().width))
    ).toBe(expandedWidth)

    await page.getByRole('tab', { name: 'Files' }).click()
    await expect(page.locator('.tree-view')).toBeVisible()
    await clickMenuById(app, 'tocMenuItem')
    await expect(page.getByRole('tab', { name: 'Outline' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(page.locator('.side-bar-toc')).toBeVisible()
    await clickMenuById(app, 'tocMenuItem')
    await expect(sideBar).toBeVisible()
    await expect(page.locator('.side-bar-toc')).toBeVisible()
  })

  test('Sidebar resize clamps at 220px and persists once when dragging ends', async() => {
    const sideBar = page.locator('.side-bar')
    await ensureSidebarVisible(page, app)

    await page.evaluate(() => {
      const storage = localStorage
      const original = storage.setItem.bind(storage)
      Object.defineProperty(storage, 'setItem', {
        configurable: true,
        value(key: string, value: string) {
          const state = window as typeof window & { __sidebarWidthWrites?: number }
          if (key === 'side-bar-width') {
            state.__sidebarWidthWrites = (state.__sidebarWidthWrites ?? 0) + 1
          }
          original(key, value)
        }
      })
      ;(window as typeof window & { __sidebarWidthWrites?: number }).__sidebarWidthWrites = 0
    })

    const dragBar = page.locator('.side-bar .drag-bar')
    const box = await dragBar.boundingBox()
    if (!box) throw new Error('Sidebar resize handle is not visible')
    await page.mouse.move(box.x + 1, box.y + 80)
    await page.mouse.down()
    await page.mouse.move(50, box.y + 80, { steps: 8 })
    await page.mouse.up()

    expect(
      await sideBar.evaluate((element) => Math.round(element.getBoundingClientRect().width))
    ).toBe(220)
    expect(await page.evaluate(() => localStorage.getItem('side-bar-width'))).toBe('220')
    expect(
      await page.evaluate(
        () => (window as typeof window & { __sidebarWidthWrites?: number }).__sidebarWidthWrites
      )
    ).toBe(1)
  })

  test('Settings stays pinned to the sidebar bottom and opens Preferences', async() => {
    const sideBar = page.locator('.side-bar')
    await ensureSidebarVisible(page, app)

    const settings = page.getByRole('button', { name: 'Settings' })
    const sideBarBox = await sideBar.boundingBox()
    const settingsBox = await settings.boundingBox()
    if (!sideBarBox || !settingsBox) throw new Error('Sidebar settings control is not visible')
    expect(
      Math.abs(sideBarBox.y + sideBarBox.height - (settingsBox.y + settingsBox.height))
    ).toBeLessThanOrEqual(1)

    const preferenceWindowPromise = app.waitForEvent('window')
    await settings.click()
    const preferencePage = await preferenceWindowPromise
    await preferencePage.waitForLoadState('domcontentloaded')
    await expect(preferencePage.locator('.pref-sidebar')).toBeVisible()
    await preferencePage.close()
  })
})
