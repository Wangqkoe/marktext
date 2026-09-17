import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createAuditRun } from './audit-fixtures'
import {
  clickMenuById,
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  getMarkdownContent,
  launchElectron,
  placeCaretInEditor,
  sendIpcToRenderer,
  waitForEditor,
  waitForMenuReady,
  closeDiscardingChanges
} from './helpers'

type Measurement = { inputMs: number; sourceRoundTripMs: number; saveMs: number }

const configureWindow = async(
  app: ElectronApplication,
  page: Page,
  width: number,
  height: number,
  zoom = 1
): Promise<void> => {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setSize(size.width, size.height)
      win.webContents.setZoomFactor(size.zoom)
    },
    { width, height, zoom }
  )
  await page.setViewportSize({ width, height })
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor()
      )
    )
    .toBe(zoom)
}

const activeDirty = (page: Page): Promise<boolean> =>
  page.evaluate(() => !!document.querySelector('.tabs-container > li.active.unsaved'))

const editSource = async(app: ElectronApplication, page: Page, marker: string): Promise<void> => {
  const existing = await getMarkdownContent(page, app)
  await enterSourceMode(page, app)
  await page.evaluate((value) => {
    const cm = document.querySelector('.source-code .CodeMirror') as Element & {
      CodeMirror: { setValue(value: string): void }
    }
    cm.CodeMirror.setValue(value)
  }, `${existing}\n${marker}\n`)
  await exitSourceMode(page, app)
}

const measureSavedEdit = async(
  app: ElectronApplication,
  page: Page,
  documentPath: string,
  marker: string
): Promise<Measurement> => {
  await placeCaretInEditor(page)
  const inputStart = performance.now()
  await page.keyboard.type(` ${marker}`)
  await expect.poll(() => page.locator('.editor-component').innerText()).toContain(marker)
  const inputMs = performance.now() - inputStart

  const sourceStart = performance.now()
  await enterSourceMode(page, app)
  await exitSourceMode(page, app)
  await expect.poll(() => page.locator('.editor-component').innerText()).toContain(marker)
  const sourceRoundTripMs = performance.now() - sourceStart

  const saveStart = performance.now()
  await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
  await expect.poll(() => activeDirty(page), { timeout: 8000 }).toBe(false)
  await expect.poll(() => fs.readFileSync(documentPath, 'utf8')).toContain(marker)
  const saveMs = performance.now() - saveStart
  return { inputMs, sourceRoundTripMs, saveMs }
}

const expectStableMeasurement = (measurement: Measurement): void => {
  // Bounded response limits are deliberately generous. The recorded F2 control
  // makes host-load noise visible; a product candidate requires a repeatable
  // breach from fresh profiles, rather than one slow CI sample.
  expect(measurement.inputMs).toBeLessThan(5000)
  expect(measurement.sourceRoundTripMs).toBeLessThan(10000)
  expect(measurement.saveMs).toBeLessThan(8000)
}

test.describe('Ticket 04 W4/W5 — large document and Windows boundary audit', () => {
  test('W4: F4/E1 performs bounded edits, scrolling, source round trips, tab switch and saves without errors', async({ browserName: _browserName }, testInfo) => {
    test.setTimeout(180_000)
    const measurements: Measurement[] = []
    for (const fixtureId of ['F4', 'F4', 'F2'] as const) {
      const run = createAuditRun()
      const documentPath = run.fixtures[fixtureId].documentPath as string
      let app: ElectronApplication | undefined
      try {
        const launched = await launchElectron([documentPath], {
          ...run.launchOptionsForUserDataDir(run.createIsolatedUserDataDir(`w4-${fixtureId}`)),
          suppressErrorDialog: true
        })
        app = launched.app
        const { page } = launched
        await waitForEditor(page)
        await waitForMenuReady(app)
        await configureWindow(app, page, 1280, 720)
        await expect(page.locator('body')).not.toHaveClass(/dark/)
        await expect(page.locator('.title-bar')).toBeVisible()

        const scrollTop = await page.evaluate(() => {
          const editor = document.querySelector('.editor-component') as HTMLElement
          editor.scrollTop = editor.scrollHeight
          editor.dispatchEvent(new Event('scroll'))
          return editor.scrollTop
        })
        expect(scrollTop).toBeGreaterThan(0)

        const marker = `W4-${fixtureId}-${measurements.length}`
        const measured = await measureSavedEdit(app, page, documentPath, marker)
        expectStableMeasurement(measured)
        measurements.push(measured)

        await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'W4 tab control\n')
        await expect.poll(() => page.locator('.tabs-container > li').count()).toBe(2)
        await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
        await expect.poll(() => page.locator('.editor-component').innerText()).toContain(marker)
        await expectNoRendererErrors(app)
      } finally {
        if (app) await closeDiscardingChanges(app).catch(() => {})
        run.cleanup()
      }
    }
    await testInfo.attach('w4-bounded-measurements.json', {
      body: JSON.stringify(measurements),
      contentType: 'application/json'
    })
    console.log(`W4 bounded measurements (F4, F4, F2 control): ${JSON.stringify(measurements)}`)
  })

  test('E2: dark theme representative input and source workflow remains operable with computed state evidence', async() => {
    const run = createAuditRun()
    const documentPath = run.fixtures.F2.documentPath as string
    let app: ElectronApplication | undefined
    try {
      const launched = await launchElectron(
        [documentPath],
        run.launchOptionsForUserDataDir(run.createIsolatedUserDataDir('e2-dark'))
      )
      app = launched.app
      const { page } = launched
      await waitForEditor(page)
      await waitForMenuReady(app)
      await clickMenuById(app, 'dark')
      await expect(page.locator('body')).toHaveClass(/dark/)
      await editSource(app, page, 'E2-DARK-OPERABLE')
      await expect
        .poll(() => page.locator('.editor-component').innerText())
        .toContain('E2-DARK-OPERABLE')
      const state = await page.evaluate(() => {
        const editor = document.querySelector('.editor-component') as HTMLElement
        const box = editor.getBoundingClientRect()
        return {
          width: box.width,
          height: box.height,
          editable: editor.contentEditable
        }
      })
      expect(state.width).toBeGreaterThan(0)
      expect(state.height).toBeGreaterThan(0)
      expect(state.editable).toBe('true')
      await expectNoRendererErrors(app)
    } finally {
      if (app) await closeDiscardingChanges(app).catch(() => {})
      run.cleanup()
    }
  })

  test('E3: 640x480 navigation and save smoke keeps editor geometry and disk output usable', async() => {
    const run = createAuditRun()
    const documentPath = run.fixtures.F2.documentPath as string
    let app: ElectronApplication | undefined
    try {
      const launched = await launchElectron(
        [documentPath],
        run.launchOptionsForUserDataDir(run.createIsolatedUserDataDir('e3-small-window'))
      )
      app = launched.app
      const { page } = launched
      await waitForEditor(page)
      await waitForMenuReady(app)
      await configureWindow(app, page, 640, 480)
      await page.locator('.editor-component').press('Control+End')
      const geometry = await page.evaluate(() => {
        const editor = document.querySelector('.editor-component') as HTMLElement
        const box = editor.getBoundingClientRect()
        return {
          scrollTop: editor.scrollTop,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight
        }
      })
      expect(geometry.scrollTop).toBeGreaterThanOrEqual(0)
      expect(geometry.left).toBeGreaterThanOrEqual(0)
      expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth)
      expect(geometry.top).toBeGreaterThanOrEqual(0)
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight)
      await editSource(app, page, 'E3-SMALL-WINDOW-SAVED')
      await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
      await expect
        .poll(() => fs.readFileSync(documentPath, 'utf8'))
        .toContain('E3-SMALL-WINDOW-SAVED')
      await expectNoRendererErrors(app)
    } finally {
      if (app) await closeDiscardingChanges(app).catch(() => {})
      run.cleanup()
    }
  })

  test('E4: 125% application zoom supports input, source mode and menu operation', async() => {
    const run = createAuditRun()
    let app: ElectronApplication | undefined
    try {
      const launched = await launchElectron(
        [],
        run.launchOptionsForUserDataDir(run.createIsolatedUserDataDir('e4-zoom'))
      )
      app = launched.app
      const { page } = launched
      await waitForEditor(page)
      await waitForMenuReady(app)
      await configureWindow(app, page, 1280, 720, 1.25)
      await editSource(app, page, 'E4-ZOOM-INPUT')
      await expect
        .poll(() => page.locator('.editor-component').innerText())
        .toContain('E4-ZOOM-INPUT')
      await clickMenuById(app, 'sideBarMenuItem')
      const geometry = await page.evaluate(() => {
        const source = document.querySelector('.source-mode-toggle')?.getBoundingClientRect()
        const status = document.querySelector('.app-status-bar')?.getBoundingClientRect()
        if (!source || !status) throw new Error('Expected zoom controls are absent')
        return {
          sourceInsideStatus: source.top >= status.top && source.bottom <= status.bottom,
          statusInsideViewport: status.left >= 0 && status.right <= innerWidth
        }
      })
      expect(geometry.sourceInsideStatus).toBe(true)
      expect(geometry.statusInsideViewport).toBe(true)
      await expectNoRendererErrors(app)
    } finally {
      if (app) await closeDiscardingChanges(app).catch(() => {})
      run.cleanup()
    }
  })

  test('E5: native title bar launches, edits, saves and restarts with the same controlled profile', async() => {
    const run = createAuditRun()
    const documentPath = run.fixtures.F2.documentPath as string
    const profile = run.createIsolatedUserDataDir('e5-native-titlebar')
    const preferencesPath = path.join(profile, 'preferences.json')
    const defaultsPath = path.resolve(__dirname, '../../static/preference.json')
    const preferences = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as Record<string, unknown>
    preferences.titleBarStyle = 'native'
    preferences.followSystemTheme = false
    preferences.theme = 'light'
    fs.writeFileSync(preferencesPath, JSON.stringify(preferences), 'utf8')
    let app: ElectronApplication | undefined
    try {
      let launched = await launchElectron([documentPath], {
        ...run.launchOptionsForUserDataDir(profile),
        suppressErrorDialog: true
      })
      app = launched.app
      await waitForEditor(launched.page)
      await waitForMenuReady(app)
      await expect(launched.page.locator('.title-bar')).toHaveCount(0)
      await editSource(app, launched.page, 'E5-NATIVE-SAVED')
      await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
      await expect.poll(() => fs.readFileSync(documentPath, 'utf8')).toContain('E5-NATIVE-SAVED')
      await expectNoRendererErrors(app)
      await closeDiscardingChanges(app)
      app = undefined

      launched = await launchElectron([documentPath], {
        ...run.launchOptionsForUserDataDir(profile),
        suppressErrorDialog: true
      })
      app = launched.app
      await waitForEditor(launched.page)
      await waitForMenuReady(app)
      await expect(launched.page.locator('.title-bar')).toHaveCount(0)
      await expect
        .poll(() => launched.page.locator('.editor-component').innerText())
        .toContain('E5-NATIVE-SAVED')
      await expectNoRendererErrors(app)
    } finally {
      if (app) await closeDiscardingChanges(app).catch(() => {})
      run.cleanup()
    }
  })
})
