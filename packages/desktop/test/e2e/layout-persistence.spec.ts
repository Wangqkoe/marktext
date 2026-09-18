import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  clickMenuById,
  closeDiscardingChanges,
  launchElectron,
  launchWithMarkdown,
  typeIntoEditor,
  waitForEditor,
  waitForMenuReady
} from './helpers'

// Layout preferences are written with a debounce; wait past it before closing.
const waitForPersistedLayout = (page: Page): Promise<void> => page.waitForTimeout(1200)

const launchRestored = async(
  userDataDir: string
): Promise<{ app: ElectronApplication; page: Page }> => {
  const relaunched = await launchElectron([], { userDataDir })
  await waitForEditor(relaunched.page)
  await waitForMenuReady(relaunched.app)
  return relaunched
}

const restart = async(
  app: ElectronApplication,
  page: Page,
  userDataDir: string
): Promise<{ app: ElectronApplication; page: Page }> => {
  await waitForPersistedLayout(page)
  await closeDiscardingChanges(app)
  return launchRestored(userDataDir)
}

const sidebarWidth = (page: Page): Promise<number> =>
  page.locator('.side-bar').evaluate((element) => Math.round(element.getBoundingClientRect().width))

const menuChecked = (app: ElectronApplication, id: string): Promise<boolean> =>
  app.evaluate(({ Menu }, menuId) => {
    return !!Menu.getApplicationMenu()?.getMenuItemById(menuId)?.checked
  }, id)

// Startup never restores a previous session's documents, so the layout comes
// from preferences: sidebar visibility and width, tab bar visibility and Source
// mode persist, while the active sidebar view and the inline filter start fresh.
test('sidebar and editor layout preferences survive application restart', async() => {
  test.setTimeout(120_000)
  const launched = await launchWithMarkdown('# Persisted layout\n')
  let { app, page } = launched
  const { userDataDir } = launched

  try {
    await typeIntoEditor(page, ' unsaved')
    if (!(await page.locator('.side-bar').isVisible())) {
      await clickMenuById(app, 'sideBarMenuItem')
      await expect(page.locator('.side-bar')).toBeVisible()
    }
    const dragBar = page.locator('.side-bar .drag-bar')
    const dragBox = await dragBar.boundingBox()
    if (!dragBox) throw new Error('Sidebar resize handle is not visible')
    await page.mouse.move(dragBox.x + 1, dragBox.y + 80)
    await page.mouse.down()
    await page.mouse.move(dragBox.x + 101, dragBox.y + 80, { steps: 8 })
    await page.mouse.up()
    const widenedWidth = await sidebarWidth(page)
    expect(widenedWidth).toBeGreaterThan(300)
    ;({ app, page } = await restart(app, page, userDataDir))
    await expect(page.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true')
    expect(await sidebarWidth(page)).toBe(widenedWidth)

    await page.getByRole('button', { name: 'Show inline search' }).click()
    await page.getByRole('tab', { name: 'Outline' }).click()
    ;({ app, page } = await restart(app, page, userDataDir))
    await expect(page.getByRole('button', { name: 'Show inline search' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    await expect(page.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true')

    const tabsWereVisible = await page.locator('.editor-tabs').isVisible()
    expect(await menuChecked(app, 'tabBarMenuItem')).toBe(tabsWereVisible)
    if (tabsWereVisible) await clickMenuById(app, 'tabBarMenuItem')
    await expect(page.locator('.editor-tabs')).toBeHidden()
    const sourceWasVisible = await page.locator('.source-code .CodeMirror').isVisible()
    expect(await menuChecked(app, 'sourceCodeModeMenuItem')).toBe(sourceWasVisible)
    if (!sourceWasVisible) await clickMenuById(app, 'sourceCodeModeMenuItem')
    await expect(page.locator('.source-code .CodeMirror')).toBeVisible()
    ;({ app, page } = await restart(app, page, userDataDir))
    await expect(page.locator('.editor-tabs')).toBeHidden()
    await expect(page.locator('.source-code .CodeMirror')).toBeVisible()
    expect(await menuChecked(app, 'tabBarMenuItem')).toBe(false)
    expect(await menuChecked(app, 'sourceCodeModeMenuItem')).toBe(true)
    expect(await menuChecked(app, 'sideBarMenuItem')).toBe(true)

    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await expect(page.locator('.source-code .CodeMirror')).toHaveCount(0)
    ;({ app, page } = await restart(app, page, userDataDir))
    await expect(page.locator('.source-code .CodeMirror')).toHaveCount(0)
    expect(await menuChecked(app, 'sourceCodeModeMenuItem')).toBe(false)

    await clickMenuById(app, 'sideBarMenuItem')
    await expect(page.locator('.side-bar')).toBeHidden()
    ;({ app, page } = await restart(app, page, userDataDir))
    await expect(page.locator('.side-bar')).toBeHidden()

    await clickMenuById(app, 'sideBarMenuItem')
    await expect(page.locator('.side-bar')).toBeVisible()
    await waitForPersistedLayout(page)
    await closeDiscardingChanges(app)
    const preferencesPath = path.join(userDataDir, 'preferences.json')
    const preferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8')) as Record<
      string,
      unknown
    >
    preferences.restoreLayoutState = false
    fs.writeFileSync(preferencesPath, JSON.stringify(preferences), 'utf8')
    ;({ app, page } = await launchRestored(userDataDir))
    await expect(page.locator('.side-bar')).toBeHidden()
  } finally {
    await closeDiscardingChanges(app).catch(() => {})
  }
})
