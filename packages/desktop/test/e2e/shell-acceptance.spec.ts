import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithMarkdown, sendIpcToRenderer, closeDiscardingChanges } from './helpers'

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
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map((channel) => channel.repeat(2)).join('') : hex
    return [
      Number.parseInt(expanded.slice(0, 2), 16),
      Number.parseInt(expanded.slice(2, 4), 16),
      Number.parseInt(expanded.slice(4, 6), 16),
      1
    ]
  }
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
  await page.keyboard.press('Escape')
  let reachedThroughTabOrder = false
  for (let regionAttempt = 0; regionAttempt < 8 && !reachedThroughTabOrder; regionAttempt++) {
    await page.keyboard.press('F6')
    reachedThroughTabOrder = await locator.evaluate((element) => element === document.activeElement)
    const targetRegionIsActive = await locator.evaluate((element) => {
      const region = element.closest(
        '.side-bar, .editor-tabs, .app-status-bar, .editor-with-tabs > .container'
      )
      return !!region?.contains(document.activeElement)
    })
    if (!targetRegionIsActive) continue
    for (let tabAttempt = 0; tabAttempt < 40 && !reachedThroughTabOrder; tabAttempt++) {
      await page.keyboard.press('Tab')
      reachedThroughTabOrder = await locator.evaluate((element) => element === document.activeElement)
    }
  }
  expect(reachedThroughTabOrder).toBe(true)
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
    if (app) await closeDiscardingChanges(app)
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
    const selectedEditorTab = page.locator('.editor-tabs [role="tab"][aria-selected="true"]')
    await expectVisibleKeyboardFocus(page, selectedEditorTab)
    await page.keyboard.press('ArrowLeft')
    await expect(firstEditorTab).toBeFocused()
    await expect(firstEditorTab).toHaveAttribute('aria-selected', 'true')

    const newTab = page.getByRole('button', { name: 'New Tab' })
    await expectVisibleKeyboardFocus(page, newTab)
    await expect
      .poll(() => newTab.evaluate((element) => Number(getComputedStyle(element).opacity)))
      .toBe(1)
    await page.keyboard.press('Enter')
    await expect(editorTabs).toHaveCount(3)

    await expectVisibleKeyboardFocus(page, selectedEditorTab)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(firstEditorTab).toBeFocused()
    await expect(firstEditorTab).toHaveAttribute('aria-selected', 'true')

    const closeTab = page.locator('.editor-tabs li.active').getByRole('button', {
      name: /Close/
    })
    await expectVisibleKeyboardFocus(page, closeTab)
    await page.keyboard.press('Enter')
    await expect(editorTabs).toHaveCount(2)
  })

  test('editor tab states consume shell semantic theme values', async() => {
    const editorTabs = page.locator('.tabs-container > li')
    if ((await editorTabs.count()) < 2) {
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'semantic tab\n')
      await expect(editorTabs).toHaveCount(2)
    }

    const activeTabBeforeEdit = page.locator('.tabs-container > li.active')
    const dirtyTabId = await activeTabBeforeEdit.getAttribute('data-id')
    if (!dirtyTabId) throw new Error('Active tab has no stable id')
    const dirtyTab = page.locator(`.tabs-container > li[data-id="${dirtyTabId}"]`)
    await page.locator('.editor-component').click()
    await page.keyboard.type('x')
    await expect(dirtyTab).toHaveClass(/unsaved/)
    await page.locator('.tabs-container > li:not(.active) .tab-select').first().click()
    await expect(dirtyTab).not.toHaveClass(/active/)

    const semanticColors = {
      hover: 'rgb(11, 22, 33)',
      active: 'rgb(44, 55, 66)',
      accent: 'rgb(77, 88, 99)',
      focus: 'rgb(101, 112, 123)'
    }
    await page.evaluate((colors) => {
      const root = document.documentElement.style
      root.setProperty('--appShellHoverBg', colors.hover)
      root.setProperty('--appShellDivider', colors.active)
      root.setProperty('--appShellAccent', colors.accent)
      root.setProperty('--appShellFocus', colors.focus)
    }, semanticColors)

    try {
      const unsavedDot = page.locator('.tabs-container > li.unsaved:not(.active) .unsaved-dot')
      await expect(unsavedDot).toBeVisible()
      expect(await unsavedDot.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
        semanticColors.accent
      )

      const inactiveTab = page.locator('.tabs-container > li:not(.active)').first()
      await inactiveTab.hover()
      await expect
        .poll(() => inactiveTab.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe(semanticColors.hover)

      const activeTab = page.locator('.tabs-container > li.active')
      await expect
        .poll(() => activeTab.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe(semanticColors.active)
      expect(
        await activeTab.evaluate((element) => getComputedStyle(element, '::after').backgroundColor)
      ).toBe(semanticColors.accent)

      const newTab = page.getByRole('button', { name: 'New Tab' })
      await newTab.hover()
      await expect
        .poll(() => newTab.evaluate((element) => getComputedStyle(element).color))
        .toBe(semanticColors.focus)

      const closeTab = activeTab.getByRole('button', { name: /Close/ })
      await closeTab.hover()
      await expect
        .poll(() => closeTab.evaluate((element) => getComputedStyle(element).color))
        .toBe(semanticColors.focus)
    } finally {
      await page.evaluate(() => {
        const root = document.documentElement.style
        root.removeProperty('--appShellHoverBg')
        root.removeProperty('--appShellDivider')
        root.removeProperty('--appShellAccent')
        root.removeProperty('--appShellFocus')
      })
    }
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
        const root = getComputedStyle(document.documentElement)
        return {
          statusBackground: status.backgroundColor,
          sidebarBackground: sidebar.backgroundColor,
          normalText: style('.status-context').color,
          icon: style('.sidebar-toggle').color,
          strongText: style('.side-bar-view-tab[aria-selected="true"]').color,
          divider: status.borderTopColor,
          focus: style('.side-bar-view-tab:focus').outlineColor,
          hover: root.getPropertyValue('--appShellHoverBg'),
          active: root.getPropertyValue('--appShellAccent'),
          disabledOpacity: Number(root.getPropertyValue('--appShellDisabledOpacity')),
          destructiveBackground: root.getPropertyValue('--appShellDestructiveHoverBg'),
          destructiveForeground: root.getPropertyValue('--appShellDestructiveHoverFg')
        }
      })

      const [strongRed, strongGreen, strongBlue] = parseColor(colors.strongText)
      const disabledText = `rgba(${strongRed}, ${strongGreen}, ${strongBlue}, ${colors.disabledOpacity})`
      const ratios = {
        normalText: contrastRatio(colors.normalText, colors.statusBackground),
        icon: contrastRatio(colors.icon, colors.statusBackground),
        strongText: contrastRatio(colors.strongText, colors.sidebarBackground),
        focus: contrastRatio(colors.focus, colors.sidebarBackground),
        divider: contrastRatio(colors.divider, colors.statusBackground),
        hover: contrastRatio(colors.hover, colors.sidebarBackground),
        active: contrastRatio(colors.active, colors.sidebarBackground),
        pressed: contrastRatio(colors.hover, colors.statusBackground),
        disabled: contrastRatio(disabledText, colors.statusBackground),
        destructive: contrastRatio(colors.destructiveForeground, colors.destructiveBackground)
      }
      for (const [state, ratio] of Object.entries(ratios)) {
        const minimum = ['divider', 'hover', 'active', 'pressed', 'disabled'].includes(state) ? 1 : 3
        if (ratio <= minimum) {
          failures.push(`${theme} ${state} ${ratio.toFixed(2)} <= ${minimum}`)
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
    await expect(sidebarToggle).toHaveAttribute('aria-pressed', String(sidebarWasVisible))
    await expectVisibleKeyboardFocus(page, sidebarToggle)
    await page.keyboard.press('Enter')
    if (sidebarWasVisible) await expect(page.locator('.side-bar')).toBeHidden()
    else await expect(page.locator('.side-bar')).toBeVisible()
    await expect(sidebarToggle).toHaveAttribute('aria-pressed', String(!sidebarWasVisible))
    await page.keyboard.press('Enter')
    if (sidebarWasVisible) await expect(page.locator('.side-bar')).toBeVisible()
    else await expect(page.locator('.side-bar')).toBeHidden()
    await expect(sidebarToggle).toHaveAttribute('aria-pressed', String(sidebarWasVisible))

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
