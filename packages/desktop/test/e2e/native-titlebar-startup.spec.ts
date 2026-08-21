import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron } from './helpers'

const scenarios = [
  { name: 'light at 100%', theme: 'light', zoom: 1 },
  { name: 'dark at 125%', theme: 'material-dark', zoom: 1.25 }
] as const

for (const scenario of scenarios) {
  test(`loads and paints the editor with a native title bar (${scenario.name})`, async() => {
    test.skip(process.platform !== 'win32', 'Windows native title-bar regression')

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-native-titlebar-'))
    const defaultsPath = path.resolve(__dirname, '../../static/preference.json')
    const preferences = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as Record<
      string,
      unknown
    >
    preferences.titleBarStyle = 'native'
    preferences.followSystemTheme = false
    preferences.theme = scenario.theme
    preferences.zoom = scenario.zoom
    fs.writeFileSync(
      path.join(userDataDir, 'preferences.json'),
      JSON.stringify(preferences),
      'utf8'
    )

    const { app, page } = await launchElectron(['test/e2e/data/all-blocks.md'], {
      userDataDir
    })

    try {
      await expect(page.locator('.application-shell')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('.title-bar')).toHaveCount(0)
      await expect(page.locator('.editor-component')).toContainText('ATX heading level one')

      const paintedPixelRatio = await app.evaluate(async({ BrowserWindow }) => {
        const image = await BrowserWindow.getAllWindows()[0].capturePage()
        const bitmap = image.toBitmap()
        let paintedPixels = 0
        for (let index = 0; index < bitmap.length; index += 4) {
          const blue = bitmap[index] ?? 0
          const green = bitmap[index + 1] ?? 0
          const red = bitmap[index + 2] ?? 0
          if (blue > 8 || green > 8 || red > 8) {
            paintedPixels++
          }
        }
        return paintedPixels / (bitmap.length / 4)
      })
      expect(paintedPixelRatio).toBeGreaterThan(0.01)
    } finally {
      await app.close().catch(() => {})
    }
  })
}
