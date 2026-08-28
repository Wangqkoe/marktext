import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { execFileSync, type ChildProcess } from 'node:child_process'
import { launchElectron } from './helpers'

type CloseTrigger = (app: ElectronApplication, page: Page) => Promise<void>

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const terminate = async(child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  try {
    // `app` is the child launched by this spec. `/T` is deliberately limited
    // to its process tree; no ambient Electron/Node processes are touched.
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
}

const assertMainProcessExitedWithoutReplacement = async(
  app: ElectronApplication,
  child: ChildProcess,
  replacementWindows: Page[]
): Promise<void> => {
  const deadline = Date.now() + 5_000
  const waitForExitOrReplacement = async(): Promise<void> => {
    if (child.exitCode !== null) return
    if (replacementWindows.length > 0) {
      const titles = await Promise.all(replacementWindows.map(window => window.title().catch(() => '<closed>')))
      throw new Error(`Replacement BrowserWindow appeared before main-process exit: ${titles.join(', ')}`)
    }
    if (Date.now() >= deadline) return
    await delay(50)
    await waitForExitOrReplacement()
  }
  await waitForExitOrReplacement()

  if (child.exitCode === null) {
    const remaining = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map(window => ({ id: window.id, title: window.getTitle() }))
    )
    throw new Error(`Electron main process did not exit within 5000ms after the final window closed; remaining BrowserWindows: ${JSON.stringify(remaining)}`)
  }
  expect(replacementWindows).toEqual([])
}

const armWindowsActivationReplay = async(app: ElectronApplication): Promise<void> => {
  // The native close below is the entry point. Playwright's unpackaged
  // Windows runner does not reliably emit this OS activation event after
  // closing its final BrowserWindow, so replay the documented event exactly
  // at `window-all-closed`, when the packaged Windows trial recreates a tab.
  await app.evaluate(({ app }) => {
    app.once('window-all-closed', () => app.emit('activate'))
  })
}

const nativeBrowserWindowCloseTrigger: CloseTrigger = async(app) => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.close())
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
  ['native BrowserWindow close (Alt+F4 seam)', nativeBrowserWindowCloseTrigger]
]

for (const [entry, trigger] of lastTabCloseTriggers) {
  test(`exits after closing the only clean tab's window through ${entry}`, async() => {
    const { app, page } = await launchElectron()
    const child = app.process()
    const replacementWindows: Page[] = []
    app.on('window', window => replacementWindows.push(window))
    try {
      const closed = page.waitForEvent('close', { timeout: 5_000 })
      await trigger(app, page)
      await closed
      await assertMainProcessExitedWithoutReplacement(app, child, replacementWindows)
    } finally {
      await terminate(child)
    }
  })
}

test('exits rather than recreating a New Tab when Windows activates after native BrowserWindow close', async() => {
  const { app, page } = await launchElectron()
  const child = app.process()
  const replacementWindows: Page[] = []
  app.on('window', window => replacementWindows.push(window))
  try {
    await armWindowsActivationReplay(app)
    const closed = page.waitForEvent('close', { timeout: 5_000 })
    await nativeBrowserWindowCloseTrigger(app, page)
    await closed
    await assertMainProcessExitedWithoutReplacement(app, child, replacementWindows)
  } finally {
    await terminate(child)
  }
})

test('exits after closing two clean one-tab windows across native and title-bar close', async() => {
  const { app, page } = await launchElectron()
  const child = app.process()
  const replacementWindows: Page[] = []
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    await expect(page.locator('.tabs-container li')).toHaveCount(1)

    // Packaged startup races the authenticated endpoint refresh against the
    // renderer's hash route. Replaying that public same-document navigation
    // after readiness makes the close handoff deterministic in source E2E.
    await page.evaluate(() => { window.location.hash = '#/editor?close-handoff=1' })
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/editor?close-handoff=1')

    const secondWindow = app.waitForEvent('window')
    await page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-new-editor-window'))
    const second = await secondWindow
    await expect(second.locator('.editor-with-tabs')).toBeVisible()
    await expect(second.locator('.tabs-container li')).toHaveCount(1)
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2)

    const secondWindowId = Number(new URL(second.url()).searchParams.get('wid'))
    if (!secondWindowId) throw new Error('second BrowserWindow id is missing')
    const secondClosed = second.waitForEvent('close', { timeout: 5_000 })
    await app.evaluate(({ BrowserWindow }, windowId) => BrowserWindow.fromId(windowId)?.close(), secondWindowId)
    await secondClosed
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)

    app.on('window', window => replacementWindows.push(window))
    await page.locator('.frameless-titlebar-close').click()
    await assertMainProcessExitedWithoutReplacement(app, child, replacementWindows)
  } finally {
    await terminate(child)
  }
})
