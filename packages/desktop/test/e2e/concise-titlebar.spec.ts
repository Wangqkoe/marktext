import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron } from './helpers'

const writePreferences = (userDataDir: string, titleBarStyle: 'custom' | 'concise'): void => {
  const defaultsPath = path.resolve(__dirname, '../../static/preference.json')
  const preferences = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as Record<
    string,
    unknown
  >
  preferences.titleBarStyle = titleBarStyle
  fs.writeFileSync(path.join(userDataDir, 'preferences.json'), JSON.stringify(preferences), 'utf8')
}

test('renders a 30px concise editor titlebar backed by the live window submenu', async() => {
  test.skip(process.platform === 'darwin', 'Concise is only available on Windows and Linux')

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-concise-titlebar-'))
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-concise-title-'))
  const filename = 'a-very-long-document-name-that-keeps-its-extension.md'
  const documentPath = path.join(fixtureDir, filename)
  fs.writeFileSync(documentPath, '# Concise titlebar', 'utf8')
  writePreferences(userDataDir, 'concise')

  const { app, page } = await launchElectron([documentPath], { userDataDir })
  try {
    const titlebar = page.locator('.title-bar.concise')
    await expect(titlebar).toBeVisible()
    await expect(titlebar).toHaveCSS('height', '30px')
    await expect(page.locator('.concise-menu-button')).toHaveCount(8)
    await expect(page.locator('.concise-menu-button')).toHaveText([
      'File',
      'Edit',
      'Paragraph',
      'Format',
      'Window',
      'Theme',
      'View',
      'Help'
    ])
    await expect(page.locator('.right-toolbar .frameless-titlebar-button')).toHaveCount(3)

    const title = page.locator('.title-bar > .title .filename')
    await expect(page.locator('.title-bar > .title')).toHaveAttribute('title', filename)
    const geometry = await page.locator('.title-bar > .title').evaluate((element) => {
      const titleBounds = element.getBoundingClientRect()
      return {
        titleCenter: titleBounds.left + titleBounds.width / 2,
        windowCenter: window.innerWidth / 2
      }
    })
    expect(Math.abs(geometry.titleCenter - geometry.windowCenter)).toBeLessThan(0.5)

    await app.evaluate(({ Menu }) => {
      const applicationMenu = Menu.getApplicationMenu()
      const expected = applicationMenu?.items[0]?.submenu
      const autoSave = expected?.getMenuItemById('autoSaveMenuItem')
      if (autoSave) {
        autoSave.checked = true
        autoSave.enabled = false
      }
      const globalState = global as unknown as {
        __conciseExpectedSubmenu?: unknown
        __conciseTargetId?: string
        __concisePopup?: {
          sameMenu: boolean
          targetChecked: boolean
          targetEnabled: boolean
          targetType?: string
          accelerator: string | null
        }
      }
      globalState.__conciseExpectedSubmenu = expected
      globalState.__conciseTargetId = 'autoSaveMenuItem'
      Menu.prototype.popup = function() {
        const item = globalState.__conciseTargetId
          ? this.getMenuItemById(globalState.__conciseTargetId)
          : null
        const accelerated = this.items.find((candidate) => !!candidate.accelerator)
        globalState.__concisePopup = {
          sameMenu: this === globalState.__conciseExpectedSubmenu,
          targetChecked: !!item?.checked,
          targetEnabled: !!item?.enabled,
          targetType: item?.type,
          accelerator: accelerated?.accelerator ?? null
        }
      }
    })
    await page.locator('[data-menu-section="file"]').click()
    await expect
      .poll(() =>
        app.evaluate(() => {
          const state = global as unknown as {
            __concisePopup?: {
              sameMenu: boolean
              targetChecked: boolean
              targetEnabled: boolean
              accelerator: string | null
            }
          }
          return state.__concisePopup
        })
      )
      .toMatchObject({
        sameMenu: true,
        targetChecked: true,
        targetEnabled: false,
        accelerator: expect.any(String)
      })

    await app.evaluate(({ Menu }) => {
      const submenu = Menu.getApplicationMenu()?.items[5]?.submenu
      const pendingItems = [...(submenu?.items ?? [])]
      let radio = pendingItems.shift()
      while (radio && radio.type !== 'radio') {
        if (radio.submenu) pendingItems.push(...radio.submenu.items)
        radio = pendingItems.shift()
      }
      if (radio) radio.checked = true
      const state = global as unknown as {
        __conciseExpectedSubmenu?: unknown
        __conciseTargetId?: string
        __concisePopup?: unknown
      }
      state.__conciseExpectedSubmenu = submenu
      state.__conciseTargetId = radio?.id
      state.__concisePopup = undefined
    })
    await page.locator('[data-menu-section="theme"]').click()
    await expect
      .poll(() =>
        app.evaluate(() => {
          const state = global as unknown as {
            __concisePopup?: {
              sameMenu: boolean
              targetChecked: boolean
              targetType?: string
            }
          }
          return state.__concisePopup
        })
      )
      .toMatchObject({ sameMenu: true, targetChecked: true, targetType: 'radio' })

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(550, 500)
    })
    await expect(page.locator('.concise-menu-button')).toHaveCount(8)
    await expect(page.locator('.right-toolbar .frameless-titlebar-button')).toHaveCount(3)
    await expect(page.locator('.title-bar > .title')).toHaveAttribute('title', filename)
    const narrowRegions = await page.evaluate(() => {
      const menu = document.querySelector('.concise-menu')?.getBoundingClientRect()
      const controls = document.querySelector('.right-toolbar')?.getBoundingClientRect()
      const titleBounds = document.querySelector('.title-bar > .title')?.getBoundingClientRect()
      if (!menu || !controls || !titleBounds) {
        throw new Error('Expected concise titlebar regions to be mounted')
      }
      return {
        menuRight: menu.right,
        controlsLeft: controls.left,
        titleLeft: titleBounds.left,
        titleRight: titleBounds.right
      }
    })
    expect(narrowRegions.menuRight).toBeLessThanOrEqual(narrowRegions.controlsLeft)
    const visibleText = (await title.textContent())?.trim() ?? ''
    if (narrowRegions.titleRight > narrowRegions.titleLeft) {
      expect(narrowRegions.titleLeft).toBeGreaterThanOrEqual(narrowRegions.menuRight)
      expect(narrowRegions.titleRight).toBeLessThanOrEqual(narrowRegions.controlsLeft)
    } else {
      expect(visibleText).toBe('')
    }
    expect(visibleText === '' || visibleText.endsWith('.md')).toBe(true)

    const preferencePagePromise = app.waitForEvent('window')
    await page.evaluate(() => window.electron.ipcRenderer.send('mt::open-setting-window'))
    const preferencePage = await preferencePagePromise
    await preferencePage.waitForLoadState('domcontentloaded')
    await expect(preferencePage.locator('.pref-container')).toBeVisible()
    await expect(preferencePage.locator('.pref-container > .title-bar')).toBeVisible()
    await expect(preferencePage.locator('.concise-menu')).toHaveCount(0)
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  }
})

for (const titleBarStyle of ['custom', 'concise'] as const) {
  test(`preserves numeric and bidi filename order in the ${titleBarStyle} titlebar`, async() => {
    test.skip(
      titleBarStyle === 'concise' && process.platform === 'darwin',
      'Concise is only available on Windows and Linux'
    )
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `marktext-${titleBarStyle}-bidi-`))
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-bidi-title-'))
    const filename = '2026-08-30-LTR-ملف.md'
    const documentPath = path.join(fixtureDir, filename)
    fs.writeFileSync(documentPath, '# Bidi title', 'utf8')
    writePreferences(userDataDir, titleBarStyle)

    const { app, page } = await launchElectron([documentPath], { userDataDir })
    try {
      await expect(page.locator('.title-bar > .title')).toHaveAttribute('title', filename)
      await expect(page.locator('.title-bar > .title .filename')).toContainText(filename)
      await expect(page.locator('.title-bar > .title .filename')).toHaveAttribute('dir', 'ltr')
      await expect(page.locator('.title-bar > .title .filename')).toHaveCSS('direction', 'ltr')
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(550, 500)
      })
      await expect(page.locator('.title-bar > .title')).toHaveAttribute('title', filename)
      await expect
        .poll(async() => {
          const value =
            (await page.locator('.title-bar > .title .filename').textContent())?.trim() ?? ''
          return value === '' || value.endsWith('.md')
        })
        .toBe(true)
    } finally {
      await app.close().catch(() => {})
      fs.rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
}
