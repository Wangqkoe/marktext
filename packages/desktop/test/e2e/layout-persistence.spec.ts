import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  clickMenuById,
  launchElectron,
  launchWithMarkdown,
  typeIntoEditor,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const waitForBufferedLayout = (page: Page): Promise<void> => page.waitForTimeout(1200)

const launchRestored = async(
  userDataDir: string
): Promise<{ app: ElectronApplication; page: Page }> => {
  const relaunched = await launchElectron([], { userDataDir })
  try {
    await waitForEditor(relaunched.page)
  } catch (error) {
    const processInfo = await relaunched.app.evaluate(({ app }) => ({
      appPath: app.getAppPath(),
      argv: process.argv,
      defaultApp: process.defaultApp
    }))
    const body = await relaunched.page.locator('body').innerText()
    throw new Error(`${String(error)}\n${JSON.stringify(processInfo)}\n${body}`)
  }
  await waitForMenuReady(relaunched.app)
  return relaunched
}

const restart = async(
  app: ElectronApplication,
  page: Page,
  userDataDir: string
): Promise<{ app: ElectronApplication; page: Page }> => {
  await waitForBufferedLayout(page)
  await app.close()
  const editorStateDirectory = path.join(userDataDir, 'editorStates')
  const stateFiles = fs.existsSync(editorStateDirectory)
    ? fs
      .readdirSync(editorStateDirectory)
      .filter((name) => name.endsWith('_editor_buffer_store.json'))
    : []
  if (stateFiles.length === 0) throw new Error('Editor buffer was not retained after close')
  return launchRestored(userDataDir)
}

const sidebarWidth = (page: Page): Promise<number> =>
  page.locator('.side-bar').evaluate((element) => Math.round(element.getBoundingClientRect().width))

test('canonical and legacy sidebar layouts survive application restart', async() => {
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

    await page.getByRole('button', { name: 'Search' }).click()
    ;({ app, page } = await restart(app, page, userDataDir))
    await expect(page.getByRole('button', { name: 'Search' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await page.getByRole('tab', { name: 'Outline' }).click()
    ;({ app, page } = await restart(app, page, userDataDir))
    await expect(page.getByRole('tab', { name: 'Outline' })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    await clickMenuById(app, 'sideBarMenuItem')
    await expect(page.locator('.side-bar')).toBeHidden()
    ;({ app, page } = await restart(app, page, userDataDir))
    await expect(page.locator('.side-bar')).toBeHidden()

    await app.close()
    const bufferPath = fs
      .readdirSync(path.join(userDataDir, 'editorStates'))
      .map((name) => path.join(userDataDir, 'editorStates', name))
      .find((filename) => filename.endsWith('_editor_buffer_store.json'))
    if (!bufferPath) throw new Error('Editor buffer was not written')
    const buffer = JSON.parse(fs.readFileSync(bufferPath, 'utf8')) as Record<string, unknown>
    buffer.layout = {
      rightColumn: '',
      showSideBar: true,
      showTabBar: true,
      sideBarWidth: 45
    }
    fs.writeFileSync(bufferPath, JSON.stringify(buffer), 'utf8')
    ;({ app, page } = await launchRestored(userDataDir))
    await expect(page.locator('.side-bar')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true')
    expect(await sidebarWidth(page)).toBe(220)
    await expect(page.locator('.editor-tabs')).toBeVisible()

    await app.close()
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
    await app.close().catch(() => {})
  }
})
