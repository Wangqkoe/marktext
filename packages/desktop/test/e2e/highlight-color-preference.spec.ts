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
  test.setTimeout(60_000)
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-highlight-color-'))
  const userDataDir = path.join(fixtureRoot, 'profile')
  const documentPath = path.join(fixtureRoot, 'highlight.md')
  const settingsScreenshot = path.join(fixtureRoot, 'highlight-color-settings.png')
  const pickerScreenshot = path.join(fixtureRoot, 'highlight-color-picker.png')
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
    const swatch = control.locator('.color-swatch')
    await expect(swatch).toHaveAttribute('aria-label', 'Default highlight color')

    await textInput.click()
    await textInput.press('Control+A')
    await textInput.pressSequentially('#123')
    await expect(textInput).toHaveValue('#123')
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(255, 255, 0)')
    await textInput.pressSequentially('456')
    await expect(textInput).toHaveValue('#123456')
    await textInput.press('Enter')
    await expect(textInput).toHaveValue('#123456'.toUpperCase())
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(18, 52, 86)')

    await textInput.fill('rgb(200, 100, 50)')
    await textInput.press('Enter')
    await expect(textInput).toHaveValue('#C86432')
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(200, 100, 50)')

    await control.getByRole('button', { name: 'Restore default yellow' }).click()
    await expect(textInput).toHaveValue('#FFFF00')
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(255, 255, 0)')

    await textInput.fill('#663399')
    await textInput.press('Enter')
    await expect(marks.first()).toHaveCSS('background-color', 'rgb(102, 51, 153)')

    await swatch.click()
    const popover = control.locator('.color-popover')
    await expect(popover).toBeVisible()
    await expect(popover).toHaveCSS('width', '358px')
    await expect(control.locator('.swatch-row')).toHaveCSS('width', '328px')
    await expect(control.locator('.current-swatch')).toHaveCSS('width', '24px')
    await expect(control.locator('.history-swatch').first()).toHaveCSS('width', '24px')

    const historyBeforeRandom = await control.locator('.history-swatch:not(.empty)').count()
    await control.getByRole('button', { name: 'Choose random color' }).click()
    const randomColor = await textInput.inputValue()
    expect(randomColor).toMatch(/^#[0-9A-F]{6}$/)
    expect(randomColor).not.toBe('#663399')
    await expect(control.locator('.history-swatch:not(.empty)')).toHaveCount(Math.min(historyBeforeRandom + 1, 8))

    await control.getByRole('button', { name: 'Restore default yellow' }).click()
    await expect(textInput).toHaveValue('#FFFF00')
    await expect(control.locator('.history-swatch').first()).toHaveCSS(
      'background-color',
      `rgb(${Number.parseInt(randomColor.slice(1, 3), 16)}, ${Number.parseInt(randomColor.slice(3, 5), 16)}, ${Number.parseInt(randomColor.slice(5, 7), 16)})`
    )
    await control.locator('.history-swatch').first().click()
    await expect(textInput).toHaveValue(randomColor)

    await control.getByRole('tab', { name: 'HEX' }).click()
    const popupHex = control.getByLabel('HEX color value')
    await popupHex.fill('#FFFFFF')
    await expect(textInput).toHaveValue('#FFFFFF')
    await control.getByRole('tab', { name: 'RGB' }).click()
    const channels = control.locator('.rgb-values input')
    await channels.nth(0).fill('0')
    await channels.nth(0).press('Enter')
    await expect(textInput).toHaveValue('#00FFFF')

    const sv = control.locator('.sv-field')
    const svBox = await sv.boundingBox()
    if (!svBox) throw new Error('Saturation/value field is not visible')
    await settingsPage.mouse.move(svBox.x + svBox.width / 2, svBox.y + svBox.height / 2)
    await settingsPage.mouse.down()
    await settingsPage.mouse.move(svBox.x - 10, svBox.y - 10)
    await settingsPage.mouse.up()
    await expect(textInput).toHaveValue('#FFFFFF')
    await settingsPage.mouse.move(svBox.x + svBox.width / 2, svBox.y + svBox.height / 2)
    await settingsPage.mouse.down()
    await settingsPage.mouse.move(svBox.x + svBox.width + 10, svBox.y + svBox.height + 10)
    await settingsPage.mouse.up()
    await expect(textInput).toHaveValue('#000000')

    await settingsPage.mouse.move(svBox.x + svBox.width / 2, svBox.y + svBox.height / 2)
    await settingsPage.mouse.down()
    await settingsPage.mouse.move(svBox.x + svBox.width + 10, svBox.y - 10)
    await settingsPage.mouse.up()
    const colorBeforeDrag = await textInput.inputValue()
    const hue = control.locator('.hue-field')
    const hueBox = await hue.boundingBox()
    if (!hueBox) throw new Error('Hue field is not visible')
    await settingsPage.mouse.move(hueBox.x + 1, hueBox.y + hueBox.height / 2)
    await settingsPage.mouse.down()
    await settingsPage.mouse.move(hueBox.x + hueBox.width * 0.75, hueBox.y + hueBox.height / 2, { steps: 6 })
    await settingsPage.mouse.up()
    await expect(control.locator('.history-swatch').first()).toHaveAttribute('aria-label', new RegExp(`${colorBeforeDrag}$`))
    await settingsPage.screenshot({ path: pickerScreenshot })

    await settingsPage.locator('.pref-editor h4').click()
    await expect(popover).toBeHidden()

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
    console.log(`Picker screenshot: ${pickerScreenshot}`)
    console.log(`Editor screenshot: ${editorScreenshot}`)
  } finally {
    await launched.app.close().catch(() => {})
  }
})
