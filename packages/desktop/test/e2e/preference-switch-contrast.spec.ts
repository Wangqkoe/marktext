import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchElectron } from './helpers'

interface SwitchColors {
  trackBackground: string
  thumbBackground: string
  backdropBackground: string
}

const parseColor = (color: string): [number, number, number, number] => {
  const channels = color.match(/[\d.]+/g)?.map(Number)
  if (!channels || channels.length < 3) throw new Error(`Unsupported color: ${color}`)
  const [red = 0, green = 0, blue = 0, alpha = 1] = channels
  return [red, green, blue, alpha]
}

const compositeColor = (foreground: string, background: string): string => {
  const [red, green, blue, alpha] = parseColor(foreground)
  const [backdropRed, backdropGreen, backdropBlue] = parseColor(background)
  return `rgb(${Math.round(red * alpha + backdropRed * (1 - alpha))}, ${Math.round(
    green * alpha + backdropGreen * (1 - alpha)
  )}, ${Math.round(blue * alpha + backdropBlue * (1 - alpha))})`
}

const relativeLuminance = (color: string): number => {
  const channels = parseColor(color).slice(0, 3)

  const linear = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [red = 0, green = 0, blue = 0] = linear
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const contrastRatio = (first: string, second: string): number => {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

const getSwitchColors = async(switchControl: ReturnType<Page['locator']>): Promise<SwitchColors> => {
  return await switchControl.evaluate((element) => {
    const track = element.querySelector('.el-switch__core')
    const thumb = element.querySelector('.el-switch__action')
    if (!track || !thumb) throw new Error('Switch track or thumb is missing')

    let backdrop = element.parentElement
    let backdropBackground = 'rgb(255, 255, 255)'
    while (backdrop) {
      const candidate = getComputedStyle(backdrop).backgroundColor
      const alpha = Number(candidate.match(/[\d.]+/g)?.[3] ?? 1)
      if (alpha > 0) {
        backdropBackground = candidate
        break
      }
      backdrop = backdrop.parentElement
    }

    return {
      trackBackground: getComputedStyle(track).backgroundColor,
      thumbBackground: getComputedStyle(thumb).backgroundColor,
      backdropBackground
    }
  })
}

test.describe('Preference switch contrast', () => {
  let app: ElectronApplication
  let editorPage: Page
  let settingsPage: Page

  test.beforeAll(async() => {
    const launched = await launchElectron()
    app = launched.app
    editorPage = launched.page

    await editorPage.evaluate(() => {
      window.electron.ipcRenderer.send('mt::open-setting-window')
    })
    await expect.poll(() => app.windows().length, { timeout: 5000 }).toBe(2)
    const openedSettingsPage = app.windows().find((page) => page !== editorPage)
    if (!openedSettingsPage) throw new Error('Settings window did not open')
    settingsPage = openedSettingsPage
    await settingsPage.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('an off switch keeps its white thumb visible against the track', async() => {
    const switchControl = settingsPage.locator('.pref-switch-item .el-switch').first()
    await expect(switchControl).toBeVisible({ timeout: 5000 })

    if (await switchControl.evaluate((element) => element.classList.contains('is-checked'))) {
      await switchControl.click()
    }
    await expect(switchControl).not.toHaveClass(/is-checked/)

    const colors = await getSwitchColors(switchControl)
    const effectiveTrackBackground = compositeColor(
      colors.trackBackground,
      colors.backdropBackground
    )
    expect(
      contrastRatio(effectiveTrackBackground, colors.thumbBackground),
      `off switch colors: track=${colors.trackBackground}, backdrop=${colors.backdropBackground}, thumb=${colors.thumbBackground}`
    ).toBeGreaterThanOrEqual(3)
  })
})
