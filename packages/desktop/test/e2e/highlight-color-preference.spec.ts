import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import { launchElectron } from './helpers'

const markdown = '<mark>HTML highlight</mark>\n'

const openEditorPreferences = async(app: ElectronApplication, editorPage: Page): Promise<Page> => {
  await editorPage.evaluate(() => window.electron.ipcRenderer.send('mt::open-setting-window'))
  await expect.poll(() => app.windows().length).toBe(2)
  const settingsPage = app.windows().find((page) => page !== editorPage)
  if (!settingsPage) throw new Error('Settings window did not open')
  await settingsPage.getByText('Editor', { exact: true }).click()
  await expect(settingsPage.locator('.pref-color-picker-item')).toBeVisible()
  return settingsPage
}

test('highlight color applies immediately, persists, and leaves markdown unchanged', async() => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-highlight-color-'))
  const userDataDir = path.join(fixtureRoot, 'profile')
  const documentPath = path.join(fixtureRoot, 'highlight.md')
  const settingsScreenshot = path.join(fixtureRoot, 'highlight-color-settings.png')
  const editorScreenshot = path.join(fixtureRoot, 'highlight-color-editor.png')
  fs.writeFileSync(documentPath, markdown, 'utf8')

  let launched = await launchElectron([documentPath], {
    userDataDir,
    userDataDirOwnership: 'caller'
  })

  try {
    const settingsPage = await openEditorPreferences(launched.app, launched.page)
    const control = settingsPage.locator('.pref-color-picker-item')
    const textInput = control.locator('input[type="text"]')
    const marks = launched.page.locator('.editor-component mark')

    await expect(marks).toHaveCount(1)
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(255, 255, 0)')
    await expect(control.locator('input[type="color"]')).toHaveAttribute(
      'aria-label',
      'Default highlight color'
    )

    await textInput.click()
    await textInput.press('Control+A')
    await textInput.pressSequentially('#123')
    await expect(textInput).toHaveValue('#123')
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(255, 255, 0)')
    await textInput.pressSequentially('456')
    await expect(textInput).toHaveValue('#123456')
    await textInput.press('Enter')
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(18, 52, 86)')

    await textInput.fill('rgb(200, 100, 50)')
    await textInput.press('Enter')
    await expect(textInput).toHaveValue('#c86432')
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(200, 100, 50)')

    await control.getByRole('button', { name: 'Restore default yellow' }).click()
    await expect(textInput).toHaveValue('#ffff00')
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(255, 255, 0)')

    await textInput.fill('#663399')
    await textInput.press('Enter')
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(102, 51, 153)')

    await expect(settingsPage.locator('.pref-setting h4')).toHaveCSS('font-weight', '600')
    await expect(settingsPage.locator('.pref-compound-head h6.title').first()).toHaveCSS(
      'font-weight',
      '600'
    )
    await expect(control.locator('.description')).toHaveCSS('font-weight', '400')
    await settingsPage.screenshot({ path: settingsScreenshot })

    await launched.app.close()
    expect(JSON.parse(fs.readFileSync(path.join(userDataDir, 'preferences.json'), 'utf8')))
      .toMatchObject({ highlightColor: '#663399' })
    expect(fs.readFileSync(documentPath, 'utf8')).toBe(markdown)

    launched = await launchElectron([documentPath], {
      userDataDir,
      userDataDirOwnership: 'caller'
    })
    await expect(launched.page.locator('.editor-component mark').first()).toHaveCSS(
      'background-color',
      'rgb(102, 51, 153)'
    )
    await launched.page.screenshot({ path: editorScreenshot })
    expect(fs.readFileSync(documentPath, 'utf8')).toBe(markdown)

    console.log(`Settings screenshot: ${settingsScreenshot}`)
    console.log(`Editor screenshot: ${editorScreenshot}`)
  } finally {
    await launched.app.close().catch(() => {})
  }
})
