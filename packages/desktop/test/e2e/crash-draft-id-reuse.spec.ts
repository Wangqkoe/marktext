import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import type { ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { launchElectron, typeIntoEditor } from './helpers'

const terminate = async(child: ChildProcess | undefined): Promise<void> => {
  if (!child || child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  try {
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
}

const hasDraftSince = (directory: string, since: number): boolean => {
  try {
    return fs.readdirSync(directory).some(name =>
      name.endsWith('.draft.json') && fs.statSync(path.join(directory, name)).mtimeMs >= since
    )
  } catch { return false }
}

const closeWithoutSaving = async(app: ElectronApplication, page: Page): Promise<void> => {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
  })
  const closed = page.waitForEvent('close', { timeout: 15_000 })
  await page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
  await closed
}

// The crash-draft directory outlives every launch. The second launch's first
// document must not inherit the first launch's drafts and tombstone: with a
// shorter edit history its checkpoint revision stays below the old tombstone,
// which used to make Don't Save fail and leave the window open.
test('closes a dirty document with Don\'t Save after an earlier launch did the same', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-id-reuse-'))
  const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
  let first: ChildProcess | undefined
  let second: ChildProcess | undefined
  try {
    const firstLaunch = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    first = firstLaunch.app.process()
    await typeIntoEditor(firstLaunch.page, 'first launch draft with a longer edit history')
    await expect.poll(() => hasDraftSince(crashDraftDirectory, 0)).toBe(true)
    await closeWithoutSaving(firstLaunch.app, firstLaunch.page)
    await terminate(first)

    const secondLaunch = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    second = secondLaunch.app.process()
    const typedAt = Date.now()
    await typeIntoEditor(secondLaunch.page, 'x')
    await expect.poll(() => hasDraftSince(crashDraftDirectory, typedAt)).toBe(true)
    await closeWithoutSaving(secondLaunch.app, secondLaunch.page)
  } finally {
    await terminate(first)
    await terminate(second)
    // A lingering Chromium helper can hold the profile briefly; a leftover
    // temp directory must not hide the assertion that failed above.
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) } catch {}
  }
})
