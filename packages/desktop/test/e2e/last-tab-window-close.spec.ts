import { test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { execFileSync } from 'node:child_process'
import { launchElectron } from './helpers'

type CloseTrigger = (app: ElectronApplication, page: Page) => Promise<void>

const terminate = async(app: ElectronApplication): Promise<void> => {
  const child = app.process()
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  try {
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
  } catch {}
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
}

const lastTabCloseTriggers: ReadonlyArray<readonly [string, CloseTrigger]> = [
  ['tab close button', async(_app, page) => {
    await page.locator('.tabs-container .close-icon').evaluate(button => (button as HTMLElement).click())
  }],
  ['tab close command', async(app) => {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getFocusedWindow()?.webContents.send('mt::editor-close-tab')
    })
  }],
  ['title-bar close control', async(_app, page) => {
    await page.evaluate(() => window.electron.windowControl.close())
  }],
  // Playwright cannot inject an OS-level Alt+F4. BrowserWindow.close() is the
  // closest agent-runnable equivalent: both enter the native BrowserWindow
  // `close` event before renderer confirmation is requested.
  ['native BrowserWindow close (Alt+F4 seam)', async(app) => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.close())
  }]
]

for (const [entry, trigger] of lastTabCloseTriggers) {
  test(`closes the only clean tab's window through ${entry}`, async() => {
    const { app, page } = await launchElectron()
    try {
      const closed = page.waitForEvent('close', { timeout: 5_000 })
      await trigger(app, page)
      await closed
    } finally {
      await terminate(app)
    }
  })
}
