import { expect, test } from '@playwright/test'
import { _electron, type ElectronApplication, type Page } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchElectron } from './helpers'
import { CrashDraftStore } from '../../src/main/crashDraftRecovery'

const launchMoveApp = async(file: string, profile: string): Promise<{ app: ElectronApplication; page: Page }> => {
  const installedExe = process.env.MARKTEXT_INSTALLED_EXE
  if (!installedExe) return launchElectron([file], { userDataDir: profile, userDataDirOwnership: 'caller' })

  const app = await _electron.launch({
    executablePath: installedExe,
    args: ['--user-data-dir', profile, file],
    cwd: path.dirname(installedExe),
    env: { ...process.env, PERF_TESTING: 'true' },
    timeout: 30_000
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

const forceTerminate = async(app: ElectronApplication | undefined): Promise<void> => {
  if (!app) return
  const child = app.process()
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', resolve))
  const mainPid = await app.evaluate(() => process.pid)
  execFileSync('taskkill', ['/PID', String(mainPid), '/T', '/F'])
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
}

const tabMenuAction = async(
  app: ElectronApplication,
  tab: ReturnType<Page['locator']>,
  label: string
): Promise<void> => {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function() {
      ;(global as unknown as { __transferTargetCloseMenu: unknown }).__transferTargetCloseMenu = this
    }
  })
  await tab.dispatchEvent('contextmenu', { clientX: 20, clientY: 20 })
  await expect.poll(() => app.evaluate(() => !!(global as unknown as {
    __transferTargetCloseMenu?: unknown
  }).__transferTargetCloseMenu)).toBe(true)
  await app.evaluate(({ BrowserWindow }, itemLabel) => {
    const state = global as unknown as {
      __transferTargetCloseMenu?: {
        items: Array<{ label: string; enabled: boolean; click(...args: unknown[]): void }>
      }
    }
    const item = state.__transferTargetCloseMenu?.items.find(item => item.label === itemLabel)
    if (!item?.enabled) {
      const inventory = state.__transferTargetCloseMenu?.items.map(item => `${item.label}:${item.enabled}`)
      throw new Error(`Menu action unavailable: ${itemLabel}; items=${JSON.stringify(inventory)}`)
    }
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    item.click(undefined, win, win?.webContents)
    delete state.__transferTargetCloseMenu
  }, label)
}

test('closes a Move to New Window target through its title-bar close control', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-transfer-target-close-'))
  const file = path.join(profile, 'move.md')
  const fileName = path.basename(file)
  fs.writeFileSync(file, '# Move target window close\n')
  const checkpoint = await new CrashDraftStore(path.join(profile, 'crash-drafts')).checkpoint({
    documentId: 'unresolved-recovery-document',
    documentRevision: 1,
    markdown: '# Unresolved recovery draft\n',
    view: {
      cursor: { anchor: { offset: 0 }, focus: { offset: 0 }, anchorPath: [0, 'text'], focusPath: [0, 'text'] },
      selection: null
    }
  })
  expect(checkpoint).toEqual({ durable: true })
  const { app } = await launchMoveApp(file, profile)

  try {
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    let source: Page | undefined
    await expect.poll(async() => {
      for (const candidate of await app.windows()) {
        if (await candidate.locator('.tabs-container > li').filter({ hasText: fileName }).count()) {
          source = candidate
          return true
        }
      }
      return false
    }).toBe(true)
    if (!source) throw new Error('explicit startup document window is unavailable')
    await expect(source.locator('.editor-with-tabs')).toBeVisible()
    const sourceTab = source.locator('.tabs-container > li').filter({ hasText: fileName })
    await sourceTab.locator('.tab-select').click()
    const targetPromise = app.waitForEvent('window')
    await tabMenuAction(app, sourceTab, 'Move to new window')
    const target = await targetPromise

    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2)
    await expect(target.locator('.editor-with-tabs')).toBeVisible()
    await expect(target.locator('.tabs-container li')).toHaveCount(1)
    await expect(target.locator('.tabs-container li')).toContainText(fileName)
    await expect(target.evaluate(() => window.electron.ipcRenderer.invoke(
      'mt::workspace::crash-draft',
      { kind: 'mark-clean' }
    ))).resolves.toEqual({ durable: false, reason: 'unresolved crash drafts remain' })

    await target.locator('.frameless-titlebar-close').click()
    await expect.poll(async() => {
      const windowCount = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
      if (target.isClosed()) return { windowCount, targetClosed: true, targetTabs: [] }
      try {
        return {
          windowCount,
          targetClosed: false,
          targetTabs: await target.locator('.tabs-container > li').allInnerTexts()
        }
      } catch (error) {
        if (target.isClosed()) return { windowCount, targetClosed: true, targetTabs: [] }
        throw error
      }
    }, {
      timeout: 5_000
    }).toEqual({
      windowCount: 1,
      targetClosed: true,
      targetTabs: []
    })
  } finally {
    await forceTerminate(app)
    fs.rmSync(profile, { recursive: true, force: true })
  }
})
