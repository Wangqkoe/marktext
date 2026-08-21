import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithMarkdown, sendIpcToRenderer } from './helpers'

const BUNDLED_THEMES = [
  'ayu-light',
  'light',
  'catppuccin-latte',
  'everforest-light',
  'graphite',
  'gruvbox-light',
  'rose-pine-dawn',
  'solarized-light',
  'tokyo-night-light',
  'ulysses',
  'ayu-dark',
  'ayu-mirage',
  'dark',
  'catppuccin-mocha',
  'cyberdream',
  'dracula',
  'everforest-dark',
  'gruvbox-dark',
  'horizon-dark',
  'kanagawa',
  'material-dark',
  'monokai-pro',
  'nightfox',
  'nord',
  'one-dark',
  'oxocarbon-dark',
  'palenight',
  'rose-pine',
  'rose-pine-moon',
  'solarized-dark',
  'synthwave-84',
  'tokyo-night',
  'tokyo-night-storm'
] as const

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

const contrastRatio = (foreground: string, background: string): number => {
  const effectiveForeground = compositeColor(foreground, background)
  const lighter = Math.max(relativeLuminance(effectiveForeground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(effectiveForeground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const expectVisibleKeyboardFocus = async(
  page: Page,
  locator: ReturnType<Page['locator']>
): Promise<void> => {
  await page.keyboard.press('Tab')
  await locator.focus()
  await expect(locator).toBeFocused()
  const focusStyle = await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth
    }
  })
  expect(focusStyle.outlineStyle).not.toBe('none')
  expect(focusStyle.outlineWidth).not.toBe('0px')
  expect(focusStyle.outlineColor).not.toBe('rgba(0, 0, 0, 0)')
}

test.describe('Application shell acceptance', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Keyboard shell\n')
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

  test('keyboard users can operate sidebar navigation with visible focus', async() => {
    const outlineTab = page.locator('.side-bar-navigation').getByRole('tab', {
      name: 'Outline'
    })
    await expectVisibleKeyboardFocus(page, outlineTab)
    await page.keyboard.press('Enter')
    await expect(outlineTab).toHaveAttribute('aria-selected', 'true')
  })

  test('keyboard users can operate the status count control with visible focus', async() => {
    const counter = page.locator('.app-status-bar .word-count')
    await expect(counter).toHaveRole('button')
    await expectVisibleKeyboardFocus(page, counter)
    await expect(counter).toContainText('W ')
    await page.keyboard.press('Enter')
    await expect(counter).toContainText('P ')
  })

  test('keyboard users can select, create and close editor tabs with visible focus', async() => {
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'second tab\n')
    const editorTabs = page.locator('.editor-tabs [role="tab"]')
    await expect(editorTabs).toHaveCount(2)
    const firstEditorTab = editorTabs.first()
    await expectVisibleKeyboardFocus(page, firstEditorTab)
    await page.keyboard.press('Enter')
    await expect(firstEditorTab).toHaveAttribute('aria-selected', 'true')

    const newTab = page.getByRole('button', { name: 'New Tab' })
    await expectVisibleKeyboardFocus(page, newTab)
    await page.keyboard.press('Enter')
    await expect(editorTabs).toHaveCount(3)

    await firstEditorTab.focus()
    await page.keyboard.press('Enter')
    await expect(firstEditorTab).toHaveAttribute('aria-selected', 'true')

    const closeTab = page.locator('.editor-tabs li.active').getByRole('button', {
      name: /Close/
    })
    await expectVisibleKeyboardFocus(page, closeTab)
    await page.keyboard.press('Enter')
    await expect(editorTabs).toHaveCount(2)
  })

  test('every bundled theme resolves distinguishable semantic shell states', async() => {
    const outlineTab = page.locator('.side-bar-navigation').getByRole('tab', {
      name: 'Outline'
    })
    await page.keyboard.press('Tab')
    await outlineTab.focus()
    const failures: string[] = []

    for (const theme of BUNDLED_THEMES) {
      const previousThemeStyle = await page.locator('#ag-theme').textContent()
      await clickMenuById(app, theme)
      await page.waitForFunction(
        (previous) => document.querySelector('#ag-theme')?.textContent !== previous,
        previousThemeStyle
      )
      await outlineTab.focus()

      const colors = await page.evaluate(() => {
        const style = (selector: string) => {
          const element = document.querySelector(selector)
          if (!element) throw new Error(`Shell element not found: ${selector}`)
          return getComputedStyle(element)
        }
        const status = style('.app-status-bar')
        const sidebar = style('.side-bar')
        return {
          statusBackground: status.backgroundColor,
          sidebarBackground: sidebar.backgroundColor,
          normalText: style('.status-context').color,
          icon: style('.sidebar-toggle').color,
          strongText: style('.side-bar-view-tab[aria-selected="true"]').color,
          divider: status.borderTopColor,
          focus: style('.side-bar-view-tab:focus').outlineColor
        }
      })

      const ratios = {
        normalText: contrastRatio(colors.normalText, colors.statusBackground),
        icon: contrastRatio(colors.icon, colors.statusBackground),
        strongText: contrastRatio(colors.strongText, colors.sidebarBackground),
        focus: contrastRatio(colors.focus, colors.sidebarBackground),
        divider: contrastRatio(colors.divider, colors.statusBackground)
      }
      for (const [state, ratio] of Object.entries(ratios)) {
        const minimum = state === 'divider' ? 1 : 3
        if (ratio < minimum || (state === 'divider' && ratio === minimum)) {
          failures.push(`${theme} ${state} ${ratio.toFixed(2)} < ${minimum}`)
        }
      }
    }

    expect(failures).toEqual([])
  })

  test('non-default zoom keeps shell controls aligned and operable', async() => {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.25)
    })
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          return BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor()
        })
      )
      .toBe(1.25)

    const geometry = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar-toggle')?.getBoundingClientRect()
      const source = document.querySelector('.source-mode-toggle')?.getBoundingClientRect()
      const status = document.querySelector('.app-status-bar')?.getBoundingClientRect()
      if (!sidebar || !source || !status) throw new Error('Status controls are not rendered')
      return {
        controlCenterDelta: Math.abs(
          sidebar.top + sidebar.height / 2 - (source.top + source.height / 2)
        ),
        statusInsideViewport: status.left >= 0 && status.right <= innerWidth,
        controlsInsideStatus:
          sidebar.top >= status.top &&
          sidebar.bottom <= status.bottom &&
          source.top >= status.top &&
          source.bottom <= status.bottom
      }
    })
    expect(geometry.controlCenterDelta).toBeLessThanOrEqual(0.5)
    expect(geometry.statusInsideViewport).toBe(true)
    expect(geometry.controlsInsideStatus).toBe(true)

    const sidebarToggle = page.getByRole('button', { name: 'Toggle Sidebar' })
    const sidebarWasVisible = await page.locator('.side-bar').isVisible()
    await sidebarToggle.focus()
    await page.keyboard.press('Enter')
    if (sidebarWasVisible) await expect(page.locator('.side-bar')).toBeHidden()
    else await expect(page.locator('.side-bar')).toBeVisible()
    await page.keyboard.press('Enter')
    if (sidebarWasVisible) await expect(page.locator('.side-bar')).toBeVisible()
    else await expect(page.locator('.side-bar')).toBeHidden()

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1)
    })
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          return BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor()
        })
      )
      .toBe(1)
  })
})
