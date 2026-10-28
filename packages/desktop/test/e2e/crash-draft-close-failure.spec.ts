import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { launchElectron, typeIntoEditor } from './helpers'

// Both cases refuse a close, so the app never exits on its own.
const terminate = async(app: ElectronApplication): Promise<void> => {
  const child = app.process()
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGKILL')
  } catch {}
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
}

/**
 * Replaces the main-process crash-draft handler so that `failing` reports a
 * non-durable write; the store's own disk faults are covered by unit tests.
 */
const failCrashDraftRequest = async(app: ElectronApplication, failing: 'discard' | 'mark-clean'): Promise<void> => {
  await app.evaluate(({ dialog, ipcMain }, failing) => {
    const state = global as unknown as { __mt_crash_close_requests__?: string[] }
    state.__mt_crash_close_requests__ = []
    // Don't Save
    dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
    ipcMain.removeHandler('mt::workspace::crash-draft')
    ipcMain.handle('mt::workspace::crash-draft', async(_event, request: { readonly kind: string }) => {
      state.__mt_crash_close_requests__?.push(request.kind)
      if (request.kind === failing) return { durable: false, reason: `synthetic ${failing} failure` }
      if (request.kind === 'checkpoint') return { durable: true, receipt: 'synthetic-close-failure-receipt' }
      return { durable: true }
    })
  }, failing)
}

const crashDraftRequests = (app: ElectronApplication): Promise<string[]> => app.evaluate(() => {
  const state = global as unknown as { __mt_crash_close_requests__?: string[] }
  return state.__mt_crash_close_requests__ ?? []
})

test('a document whose discard is not durable stays open and shows why', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-close-failure-document-'))
  const { app, page } = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await failCrashDraftRequest(app, 'discard')
    await typeIntoEditor(page, 'kept after a failed close')
    await expect.poll(() => crashDraftRequests(app)).toContain('checkpoint')

    await page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
    const notice = page.locator('.mt-notification')
    await expect(notice).toContainText('Could not close')
    await expect(notice).toContainText('stays open because its crash-recovery record could not be written')
    expect(await crashDraftRequests(app)).toContain('discard')

    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    await expect(page.locator('.editor-component')).toContainText('kept after a failed close')
  } finally {
    await terminate(app)
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) } catch {}
  }
})

test('a window whose clean-exit marker is not durable stays open and shows why', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-close-failure-window-'))
  const { app, page } = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await failCrashDraftRequest(app, 'mark-clean')

    await page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
    const notice = page.locator('.mt-notification')
    await expect(notice).toContainText('Could not close')
    await expect(notice).toContainText('The window stays open because its crash-recovery record could not be written')
    expect(await crashDraftRequests(app)).toContain('mark-clean')

    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  } finally {
    await terminate(app)
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) } catch {}
  }
})
