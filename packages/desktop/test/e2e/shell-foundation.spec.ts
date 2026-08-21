import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  clickMenuById,
  enterSourceMode,
  exitSourceMode,
  launchWithMarkdown,
  sendIpcToRenderer
} from './helpers'

interface ShellGeometry {
  titleHeight: number
  sidebarNavigationHeight: number
  tabBarHeight: number
  statusBarHeight: number
  sidebarWidth: number
  sidebarControlWidth: number
  sidebarIcon: { width: number; height: number }
  titleSpansWindow: boolean
  statusSpansWindow: boolean
  sidebarNavigationTop: number
  tabBarTop: number
  customTitleMenuVisible: boolean
  customWindowControlCount: number
  titleDragRegion: string
}

interface PaperGeometry {
  width: number
  paddingTop: number
  paddingLeft: number
  paddingRight: number
}

const measureShell = (page: Page): Promise<ShellGeometry> =>
  page.evaluate(() => {
    const height = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().height ?? 0
    const width = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().width ?? 0

    const title = document.querySelector('.title-bar')
    const navigation = document.querySelector('.side-bar-navigation')
    const tabs = document.querySelector('.editor-tabs')
    const status = document.querySelector('.app-status-bar')
    const titleRect = title?.getBoundingClientRect()
    const statusRect = status?.getBoundingClientRect()
    return {
      titleHeight: height('.title-bar'),
      sidebarNavigationHeight: height('.side-bar-navigation'),
      tabBarHeight: height('.editor-tabs'),
      statusBarHeight: height('.app-status-bar'),
      sidebarWidth: width('.side-bar'),
      sidebarControlWidth: width('.app-status-bar .sidebar-toggle'),
      sidebarIcon: {
        width: width('.app-status-bar .sidebar-toggle svg'),
        height: height('.app-status-bar .sidebar-toggle svg')
      },
      titleSpansWindow: titleRect?.left === 0 && titleRect?.right === innerWidth,
      statusSpansWindow: statusRect?.left === 0 && statusRect?.right === innerWidth,
      sidebarNavigationTop: navigation?.getBoundingClientRect().top ?? 0,
      tabBarTop: tabs?.getBoundingClientRect().top ?? 0,
      customTitleMenuVisible: !!document
        .querySelector('.frameless-titlebar-menu')
        ?.getBoundingClientRect().width,
      customWindowControlCount: document.querySelectorAll('.frameless-titlebar-button').length,
      titleDragRegion: title
        ? getComputedStyle(title).getPropertyValue('-webkit-app-region')
        : ''
    }
  })

const measurePaper = (page: Page): Promise<PaperGeometry> =>
  page.locator('.editor-component .mu-container').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      width: element.getBoundingClientRect().width,
      paddingTop: Number.parseFloat(style.paddingTop),
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight)
    }
  })

test.describe('Application shell foundation', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Shell geometry\n')
    app = launched.app
    page = launched.page
    if (!(await page.locator('.side-bar').isVisible())) {
      await clickMenuById(app, 'sideBarMenuItem')
      await expect(page.locator('.side-bar')).toBeVisible()
    }
    if (!(await page.locator('.editor-tabs').isVisible())) {
      await clickMenuById(app, 'tabBarMenuItem')
      await expect(page.locator('.editor-tabs')).toBeVisible()
    }
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('uses the approved exact shell dimensions', async() => {
    expect(await measureShell(page)).toEqual({
      titleHeight: 30,
      sidebarNavigationHeight: 26,
      tabBarHeight: 26,
      statusBarHeight: 24,
      sidebarWidth: 255,
      sidebarControlWidth: 34,
      sidebarIcon: { width: 16, height: 16 },
      titleSpansWindow: true,
      statusSpansWindow: true,
      sidebarNavigationTop: 30,
      tabBarTop: 30,
      customTitleMenuVisible: true,
      customWindowControlCount: 3,
      titleDragRegion: 'drag'
    })
  })

  test('uses the approved reference paper width and spacing', async() => {
    expect(await measurePaper(page)).toEqual({
      width: 736,
      paddingTop: 38,
      paddingLeft: 14,
      paddingRight: 14
    })
  })

  test('keeps the editor line-width preference authoritative', async() => {
    await sendIpcToRenderer(app, 'mt::user-preference', { editorLineWidth: '512px' })
    await expect
      .poll(async() => {
        const paper = await measurePaper(page)
        return paper.width - paper.paddingLeft - paper.paddingRight
      })
      .toBe(512)

    await sendIpcToRenderer(app, 'mt::user-preference', { editorLineWidth: '' })
  })

  test('sizes source mode from the shell workspace container', async() => {
    await enterSourceMode(page, app)
    const geometry = await page.evaluate(() => {
      const container = document.querySelector('.editor-with-tabs > .container')
      const source = document.querySelector('.source-code')
      const containerRect = container?.getBoundingClientRect()
      const sourceRect = source?.getBoundingClientRect()
      return {
        containerTop: containerRect?.top,
        containerBottom: containerRect?.bottom,
        sourceTop: sourceRect?.top,
        sourceBottom: sourceRect?.bottom
      }
    })
    expect(geometry).toEqual({
      containerTop: geometry.sourceTop,
      containerBottom: geometry.sourceBottom,
      sourceTop: geometry.sourceTop,
      sourceBottom: geometry.sourceBottom
    })
    await exitSourceMode(page, app)
  })

  test('reports the current context while toggling the complete sidebar', async() => {
    await page.getByRole('tab', { name: 'Outline' }).click()
    await expect(page.locator('.status-context')).toHaveText('Outline')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page.locator('.status-context')).toHaveText('Search')

    const sidebar = page.locator('.side-bar')
    const width = await sidebar.evaluate((element) => element.getBoundingClientRect().width)
    const toggle = page.getByRole('button', { name: 'Toggle Sidebar' })
    await expect(toggle.locator('path')).toHaveAttribute('d', 'm10 3-5 5 5 5')
    await toggle.click()

    await expect(sidebar).toBeHidden()
    expect(await sidebar.evaluate((element) => element.getBoundingClientRect().width)).toBe(0)
    await expect(page.locator('.status-context')).toHaveText('Editor')
    await expect(toggle.locator('path')).toHaveAttribute('d', 'm6 3 5 5-5 5')

    await toggle.click()
    await expect(sidebar).toBeVisible()
    expect(await sidebar.evaluate((element) => element.getBoundingClientRect().width)).toBe(width)
    await expect(page.locator('.status-context')).toHaveText('Search')
    await page.getByRole('tab', { name: 'Files' }).click()
  })

  test('lets the workspace consume a hidden tab row without moving sidebar navigation', async() => {
    const before = await page.evaluate(() => ({
      navigationTop: document.querySelector('.side-bar-navigation')?.getBoundingClientRect().top,
      editorTop: document.querySelector('.editor-component')?.getBoundingClientRect().top
    }))
    expect(before.editorTop).toBe((before.navigationTop ?? 0) + 26)

    await clickMenuById(app, 'tabBarMenuItem')
    await expect(page.locator('.editor-tabs')).toBeHidden()
    const after = await page.evaluate(() => ({
      navigationTop: document.querySelector('.side-bar-navigation')?.getBoundingClientRect().top,
      navigationHeight: document.querySelector('.side-bar-navigation')?.getBoundingClientRect()
        .height,
      editorTop: document.querySelector('.editor-component')?.getBoundingClientRect().top
    }))
    expect(after).toEqual({
      navigationTop: before.navigationTop,
      navigationHeight: 26,
      editorTop: before.navigationTop
    })

    await clickMenuById(app, 'tabBarMenuItem')
    await expect(page.locator('.editor-tabs')).toBeVisible()
  })

  test('removes the in-app title row for native-title configurations', async() => {
    await sendIpcToRenderer(app, 'mt::user-preference', { titleBarStyle: 'native' })
    await expect(page.locator('.title-bar')).toHaveCount(0)
    expect(
      await page
        .locator('.side-bar-navigation')
        .evaluate((element) => element.getBoundingClientRect().top)
    ).toBe(0)

    await sendIpcToRenderer(app, 'mt::user-preference', { titleBarStyle: 'custom' })
    await expect(page.locator('.title-bar')).toBeVisible()
  })

  test('leaves the separate Preferences title geometry unchanged', async() => {
    const preferenceWindowPromise = app.waitForEvent('window')
    await page.getByRole('button', { name: 'Settings' }).click()
    const preferencePage = await preferenceWindowPromise
    await preferencePage.waitForLoadState('domcontentloaded')
    await expect(preferencePage.locator('.pref-container')).toBeVisible()
    expect(
      await preferencePage
        .locator('.pref-container > .title-bar')
        .evaluate((element) => element.getBoundingClientRect().height)
    ).toBe(32)
    await preferencePage.close()
  })

  test('stays fluid at 640×480 after explicitly hiding the docked sidebar', async() => {
    const originalViewport = page.viewportSize()
    await page.setViewportSize({ width: 640, height: 480 })
    await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([640, 480])

    const dockedGeometry = await page.evaluate(() => {
      const sidebar = document.querySelector('.side-bar')?.getBoundingClientRect()
      const workspace = document
        .querySelector('.application-shell-workspace')
        ?.getBoundingClientRect()
      return {
        sidebarWidth: sidebar?.width,
        workspaceWidth: workspace?.width,
        sidebarMeetsWorkspace: sidebar?.right === workspace?.left,
        activityRailCount: document.querySelectorAll('.left-column').length
      }
    })
    expect(dockedGeometry).toEqual({
      sidebarWidth: 255,
      workspaceWidth: 385,
      sidebarMeetsWorkspace: true,
      activityRailCount: 0
    })

    await page.getByRole('button', { name: 'Toggle Sidebar' }).click()
    await expect(page.locator('.side-bar')).toBeHidden()
    const geometry = await page.evaluate(() => {
      const workspace = document.querySelector('.application-shell-workspace')
      const paper = document.querySelector('.editor-component .mu-container')
      const status = document.querySelector('.app-status-bar')
      return {
        workspaceWidth: workspace?.getBoundingClientRect().width,
        paperFitsWorkspace:
          (paper?.getBoundingClientRect().width ?? 0) > 0 &&
          (paper?.getBoundingClientRect().width ?? 0) <=
            (workspace?.getBoundingClientRect().width ?? 0),
        statusFits: (status?.scrollWidth ?? 1) <= (status?.clientWidth ?? 0),
        activityRailCount: document.querySelectorAll('.left-column').length
      }
    })
    expect(geometry).toEqual({
      workspaceWidth: 640,
      paperFitsWorkspace: true,
      statusFits: true,
      activityRailCount: 0
    })

    await page.getByRole('button', { name: 'Toggle Sidebar' }).click()
    await expect(page.locator('.side-bar')).toBeVisible()
    if (originalViewport) await page.setViewportSize(originalViewport)
  })

  test('keeps status visible with no document context after the last tab closes', async() => {
    await page.locator('.tabs-container > li.active .close-icon').click()
    await expect(page.locator('.editor-component')).toHaveCount(0)
    await expect(page.locator('.app-status-bar')).toBeVisible()
    await expect(page.locator('.status-context')).toHaveText('No document')
    await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toBeEnabled()
  })
})
