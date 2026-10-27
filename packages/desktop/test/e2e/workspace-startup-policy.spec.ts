import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, type ChildProcess } from 'node:child_process'
import { launchElectron, typeIntoEditor } from './helpers'

const waitForChildExit = async(child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', resolve))
  if (child.exitCode !== null) return
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
  if (child.exitCode === null) throw new Error('Electron process did not exit after termination')
}

const forceTerminate = async(app: ElectronApplication | undefined, retainedChild?: ChildProcess): Promise<void> => {
  if (!app) return
  const child = retainedChild ?? app.process()
  if (child.exitCode !== null) return
  let mainPid: number
  try {
    mainPid = await app.evaluate(() => process.pid)
  } catch {
    await waitForChildExit(child)
    return
  }
  if (child.exitCode !== null) return
  try {
    execFileSync('taskkill', ['/PID', String(mainPid), '/T', '/F'])
  } catch (error) {
    if ((error as { status?: number }).status !== 128) throw new Error('could not terminate the Electron process tree')
  }
  await waitForChildExit(child)
}

const windowText = async(app: ElectronApplication): Promise<string> => {
  const windows = await app.windows()
  return (await Promise.all(windows.map(window => window.locator('body').innerText()))).join('\n')
}

const waitForRecovery = async(app: ElectronApplication, marker: string): Promise<void> => {
  await expect.poll(() => windowText(app), { timeout: 15_000 }).toContain(marker)
}

const recoveryWindow = async(app: ElectronApplication, marker: string) => {
  for (const window of await app.windows()) {
    if ((await window.locator('body').innerText()).includes(marker)) return window
  }
  throw new Error('recovery window was not found')
}

const waitForRecoveredCheckpoint = async(directory: string): Promise<void> => {
  await expect.poll(() => {
    try {
      return fs.readdirSync(directory)
        .filter(name => name.endsWith('.draft.json'))
        .some(name => (JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as { documentRevision?: number }).documentRevision! >= 2)
    } catch {
      return false
    }
  }, { timeout: 15_000 }).toBe(true)
}

const closeWithDecision = async(app: ElectronApplication, page: Awaited<ReturnType<ElectronApplication['firstWindow']>>, response: number): Promise<void> => {
  await app.evaluate(({ dialog }, choice) => {
    dialog.showMessageBox = async() => ({ response: choice, checkboxChecked: false })
  }, response)
  const closed = page.waitForEvent('close')
  await page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
  await closed
}

const seedSyntheticWhitespaceCrashDraft = async(page: Page): Promise<void> => {
  const seeded = await page.evaluate((markdown) => window.electron.ipcRenderer.invoke(
    'mt::workspace::crash-draft',
    {
      kind: 'checkpoint',
      checkpoint: {
        documentId: 'synthetic-whitespace-draft',
        documentRevision: 1,
        markdown,
        view: { cursor: { line: 0, column: 4 }, selection: null }
      }
    }
  ), '    \n')
  expect(seeded).toMatchObject({ durable: true })
}

test('does not load or overwrite legacy normal workspace data at no-target startup', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-no-restore-'))
  const legacyDir = path.join(userDataDir, 'editorStates')
  fs.mkdirSync(legacyDir, { recursive: true })
  const legacyPath = path.join(legacyDir, 'legacy_editor_buffer_store.json')
  const legacyBytes = Buffer.from(JSON.stringify({ tabs: [{ pathname: '/not-opened.md', markdown: 'LEGACY_WORKSPACE_CONTENT', isSaved: false }] }))
  fs.writeFileSync(legacyPath, legacyBytes)

  const { app, page } = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect(page.locator('body')).not.toContainText('LEGACY_WORKSPACE_CONTENT')
    expect(fs.readFileSync(legacyPath)).toEqual(legacyBytes)
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('opens only explicit targets rather than a normal workspace snapshot', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-explicit-startup-'))
  const target = path.join(userDataDir, 'requested.md')
  fs.writeFileSync(target, '# Explicit startup target\n')
  const { app, page } = await launchElectron([target], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await expect(page.locator('.editor-component')).toContainText('Explicit startup target')
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('does not expose the unimplemented workspace restore startup option', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-no-restore-preference-'))
  const { app, page } = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await page.evaluate(() => window.electron.ipcRenderer.send('mt::open-setting-window'))
    await expect.poll(() => app.windows().length).toBe(2)
    const settings = (await app.windows()).find(candidate => candidate !== page)
    if (!settings) throw new Error('settings window was not opened')
    await settings.waitForLoadState('domcontentloaded')
    await expect(settings.locator('.pref-general')).not.toContainText('Restore previous editor state')
    await expect(settings.locator('.pref-general')).not.toContainText('Restore all opened files and folders')
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('recovers a dirty saved document after a forced Electron termination without overwriting disk', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-saved-'))
  const saved = path.join(userDataDir, 'saved.md')
  const diskBytes = Buffer.from('# Saved on disk\n')
  fs.writeFileSync(saved, diskBytes)
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  let killed = false
  let restarted: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await expect(first.page.locator('.editor-component')).toContainText('Saved on disk')
    await typeIntoEditor(first.page, ' edited before crash')
    await expect(first.page.locator('body')).toContainText('edited before crash')
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try {
        return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json'))
      } catch {
        return false
      }
    }).toBe(true)
    await forceTerminate(first.app)
    killed = true

    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    await expect.poll(async() => {
      const windows = await second.app.windows()
      return (await Promise.all(windows.map(window => window.locator('body').innerText()))).join('\n')
    }, { timeout: 15_000 }).toContain('edited before crash')
    expect(fs.readFileSync(saved)).toEqual(diskBytes)
  } finally {
    if (!killed) await first.app.close().catch(() => {})
    await forceTerminate(restarted)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('recovers a dirty untitled document with a stable recovery identity after a forced termination', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-untitled-'))
  const first = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  let killed = false
  let restarted: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, '# Untitled before crash')
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try {
        return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json'))
      } catch {
        return false
      }
    }).toBe(true)
    await forceTerminate(first.app)
    killed = true

    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    await expect.poll(async() => {
      const windows = await second.app.windows()
      return (await Promise.all(windows.map(window => window.locator('body').innerText()))).join('\n')
    }, { timeout: 15_000 }).toContain('Untitled before crash')
    await expect.poll(() => second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    let recoveryWindow: Awaited<ReturnType<typeof second.app.windows>>[number] | undefined
    for (const window of await second.app.windows()) {
      if ((await window.locator('body').innerText()).includes('Untitled before crash')) recoveryWindow = window
    }
    expect(recoveryWindow).toBeTruthy()
    await expect(recoveryWindow!.locator('.tabs-container li.active')).toHaveAttribute('data-id', /^crash-recovery:mt-[0-9a-f-]{36}$/)
  } finally {
    if (!killed) await forceTerminate(first.app)
    await forceTerminate(restarted)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('discards a recovered untitled draft and exits after closing its last tab', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-close-last-recovered-'))
  const marker = 'untitled close last recovered'
  const first = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  let killed = false
  let restarted: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  let restartedChild: ChildProcess | undefined
  try {
    await typeIntoEditor(first.page, marker)
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await forceTerminate(first.app)
    killed = true

    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    const child = second.app.process()
    restartedChild = child
    await waitForRecovery(second.app, marker)
    const page = await recoveryWindow(second.app, marker)
    const recoveredTab = page.locator('.tabs-container li[data-id^="crash-recovery:"]')
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    await second.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
    })

    const closed = page.waitForEvent('close')
    await recoveredTab.locator('.close-icon').evaluate(button => (button as HTMLElement).click())
    await closed
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.tombstone.json')) } catch { return false }
    }).toBe(true)

    await expect.poll(() => child.exitCode, { timeout: 5_000 }).not.toBeNull()
  } finally {
    if (!killed) await forceTerminate(first.app)
    await forceTerminate(restarted, restartedChild)
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})

test('requests an owned native decision before closing a dirty recovered draft', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-native-decision-'))
  const marker = 'untitled native decision'
  const first = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  let killed = false
  let restarted: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, marker)
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await forceTerminate(first.app)
    killed = true

    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    await waitForRecovery(second.app, marker)
    const page = await recoveryWindow(second.app, marker)
    const recoveredTab = page.locator('.tabs-container li[data-id^="crash-recovery:"]')
    await expect(recoveredTab).toHaveClass(/unsaved/)
    await second.app.evaluate(({ dialog }) => {
      const dialogWithSpy = dialog as unknown as {
        showMessageBox: (...args: unknown[]) => Promise<unknown>
      }
      const state = global as unknown as {
        __mt_native_close_dialogs__?: Array<{ ownerId?: number; message?: string; buttons?: string[] }>
      }
      const calls: Array<{ ownerId?: number; message?: string; buttons?: string[] }> = []
      state.__mt_native_close_dialogs__ = calls
      dialogWithSpy.showMessageBox = async(...args) => {
        const [firstArg, secondArg] = args as [unknown, { message?: string; buttons?: string[] }?]
        const owner = firstArg as { id?: number }
        const options = secondArg ?? firstArg as { message?: string; buttons?: string[] }
        calls.push({ ownerId: secondArg ? owner.id : undefined, message: options.message, buttons: options.buttons })
        return { response: 2, checkboxChecked: false }
      }
    })

    await recoveredTab.locator('.close-icon').evaluate(button => (button as HTMLElement).click())
    await expect.poll(() => second.app.evaluate(() => {
      const state = global as unknown as {
        __mt_native_close_dialogs__?: Array<{ ownerId?: number; message?: string; buttons?: string[] }>
      }
      return state.__mt_native_close_dialogs__ ?? []
    })).toEqual([{ ownerId: expect.any(Number), message: 'Save changes to Recovered Draft?', buttons: ['Save', "Don't Save", 'Cancel'] }])
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    expect(fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.tombstone.json'))).toBe(false)
  } finally {
    if (!killed) await forceTerminate(first.app)
    await forceTerminate(restarted)
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})

test('Cancel preserves a whitespace-only recovered draft before close serialization normalizes it', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-whitespace-cancel-'))
  const first = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  let firstKilled = false
  let second: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await seedSyntheticWhitespaceCrashDraft(first.page)
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await forceTerminate(first.app)
    firstKilled = true

    const recovered = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    second = recovered.app
    const recoveredTab = recovered.page.locator('.tabs-container li[data-id^="crash-recovery:"]')
    await expect(recoveredTab).toHaveCount(1, { timeout: 15_000 })
    await expect(recoveredTab).toHaveClass(/unsaved/)
    const tabCount = await recovered.page.locator('.tabs-container li').count()
    await recovered.app.evaluate(({ dialog }) => {
      const dialogWithSpy = dialog as unknown as {
        showMessageBox: (...args: unknown[]) => Promise<unknown>
      }
      const state = global as unknown as {
        __mt_native_close_dialogs__?: Array<{ message?: string; buttons?: string[] }>
      }
      state.__mt_native_close_dialogs__ = []
      dialogWithSpy.showMessageBox = async(...args) => {
        const options = (args.at(-1) ?? {}) as { message?: string; buttons?: string[] }
        const calls = state.__mt_native_close_dialogs__ ?? []
        calls.push({ message: options.message, buttons: options.buttons })
        state.__mt_native_close_dialogs__ = calls
        return { response: 2, checkboxChecked: false }
      }
    })

    await recoveredTab.locator('.close-icon').evaluate(button => (button as HTMLElement).click())
    await expect.poll(() => recovered.app.evaluate(() => {
      const state = global as unknown as {
        __mt_native_close_dialogs__?: Array<{ message?: string; buttons?: string[] }>
      }
      return state.__mt_native_close_dialogs__ ?? []
    })).toEqual([{ message: 'Save changes to Recovered Draft?', buttons: ['Save', "Don't Save", 'Cancel'] }])
    await expect(recovered.page.locator('.tabs-container li')).toHaveCount(tabCount)
    await expect(recoveredTab).toHaveClass(/unsaved/)
    expect(fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json'))).toBe(true)
    expect(fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.tombstone.json'))).toBe(false)
  } finally {
    if (!firstKilled) await forceTerminate(first.app)
    await forceTerminate(second)
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})

test("Don't Save disposes a whitespace-only recovered draft and lets the last window exit", async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-whitespace-discard-'))
  const first = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  let firstKilled = false
  let second: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  let third: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await seedSyntheticWhitespaceCrashDraft(first.page)
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await forceTerminate(first.app)
    firstKilled = true

    const recovered = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    second = recovered.app
    await expect(recovered.page.locator('.tabs-container li[data-id^="crash-recovery:"]')).toHaveCount(1, { timeout: 15_000 })
    await recovered.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
    })
    const child = recovered.app.process()
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    await recovered.page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
    await Promise.race([
      exited,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('last recovered-draft window did not exit')), 10_000))
    ])
    second = undefined
    expect(fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.tombstone.json'))).toBe(true)

    const restarted = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    third = restarted.app
    await expect(restarted.page.locator('.tabs-container li[data-id^="crash-recovery:"]')).toHaveCount(0)
    await expect(restarted.page.locator('.tabs-container li')).toHaveCount(1)
  } finally {
    if (!firstKilled) await forceTerminate(first.app)
    await forceTerminate(second)
    await forceTerminate(third)
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})

test('a failed recovered-draft exit validation leaves the document intact and can be retried', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-disposition-failure-'))
  const first = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  let firstKilled = false
  let second: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await seedSyntheticWhitespaceCrashDraft(first.page)
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await forceTerminate(first.app)
    firstKilled = true

    const recovered = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    second = recovered.app
    const recoveredTab = recovered.page.locator('.tabs-container li[data-id^="crash-recovery:"]')
    await expect(recoveredTab).toHaveCount(1, { timeout: 15_000 })
    await waitForRecoveredCheckpoint(crashDraftDirectory)
    await recovered.app.evaluate(({ dialog, ipcMain }) => {
      const state = global as unknown as {
        __mt_crash_fault_requests__?: string[]
        __mt_crash_clean_attempts__?: number
        __mt_crash_discard_attempts__?: number
      }
      state.__mt_crash_fault_requests__ = []
      state.__mt_crash_clean_attempts__ = 0
      state.__mt_crash_discard_attempts__ = 0
      dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
      ipcMain.removeHandler('mt::workspace::crash-draft')
      ipcMain.handle('mt::workspace::crash-draft', async(_event, request: { readonly kind: string }) => {
        const requests = state.__mt_crash_fault_requests__ ?? []
        requests.push(request.kind)
        state.__mt_crash_fault_requests__ = requests
        if (request.kind === 'checkpoint') return { durable: true, receipt: 'synthetic-fault-receipt' }
        if (request.kind === 'discard') {
          state.__mt_crash_discard_attempts__ = (state.__mt_crash_discard_attempts__ ?? 0) + 1
          return state.__mt_crash_discard_attempts__ === 1
            ? { durable: true }
            : { durable: false, reason: 'disposition must not be repeated after its durable acknowledgement' }
        }
        if (request.kind === 'mark-clean') {
          state.__mt_crash_clean_attempts__ = (state.__mt_crash_clean_attempts__ ?? 0) + 1
          if (state.__mt_crash_clean_attempts__ === 1) {
            return { durable: false, reason: 'synthetic clean-marker failure' }
          }
        }
        return { durable: true }
      })
    })

    await recovered.page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
    await expect.poll(() => recovered.app.evaluate(() => {
      const state = global as unknown as { __mt_crash_fault_requests__?: string[] }
      return state.__mt_crash_fault_requests__ ?? []
    })).toContain('mark-clean')
    await expect(recoveredTab).toHaveCount(1)
    await expect(recovered.page.locator('.tabs-container li')).toHaveCount(1)
    await expect(recoveredTab).toContainText('Recovered Draft')
    expect(fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.tombstone.json'))).toBe(false)
    const firstRequests = await recovered.app.evaluate(() => {
      const state = global as unknown as { __mt_crash_fault_requests__?: string[] }
      return state.__mt_crash_fault_requests__ ?? []
    })
    expect(firstRequests.filter(kind => kind === 'discard')).toHaveLength(1)

    const child = recovered.app.process()
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    await recovered.page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
    await Promise.race([
      exited,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('retried recovered-draft window did not exit')), 10_000))
    ])
    second = undefined
  } finally {
    if (!firstKilled) await forceTerminate(first.app)
    await forceTerminate(second)
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})

test('Cancel keeps a dirty recovered draft open when its close icon is clicked', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-close-cancel-'))
  const marker = 'untitled close Cancel'
  const first = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  let killed = false
  let restarted: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, marker)
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await forceTerminate(first.app)
    killed = true

    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    await waitForRecovery(second.app, marker)
    const page = await recoveryWindow(second.app, marker)
    const recoveredTab = page.locator('.tabs-container li[data-id^="crash-recovery:"]')
    await expect(recoveredTab).toHaveClass(/unsaved/)
    await second.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 2, checkboxChecked: false })
    })

    await recoveredTab.locator('.close-icon').evaluate(button => (button as HTMLElement).click())
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    await expect(recoveredTab).toHaveClass(/unsaved/)
    expect(fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.tombstone.json'))).toBe(false)
  } finally {
    if (!killed) await forceTerminate(first.app)
    await forceTerminate(restarted)
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})

test('opens an explicit target alongside a forced-crash draft recovery', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-explicit-'))
  const saved = path.join(userDataDir, 'saved.md')
  const explicit = path.join(userDataDir, 'explicit.md')
  fs.writeFileSync(saved, '# Saved draft\n')
  fs.writeFileSync(explicit, '# Explicit target\n')
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  let killed = false
  let restarted: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, ' recovery survives')
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try {
        return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json'))
      } catch {
        return false
      }
    }).toBe(true)
    await forceTerminate(first.app)
    killed = true

    const second = await launchElectron([explicit], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    await expect.poll(async() => {
      const windows = await second.app.windows()
      return (await Promise.all(windows.map(window => window.locator('body').innerText()))).join('\n')
    }, { timeout: 15_000 }).toContain('Explicit target')
    let recoveryWindow: Awaited<ReturnType<typeof second.app.windows>>[number] | undefined
    for (const window of await second.app.windows()) {
      if (await window.locator('.tabs-container li').filter({ hasText: 'saved.md' }).count()) recoveryWindow = window
    }
    expect(recoveryWindow).toBeTruthy()
    await expect(recoveryWindow!.locator('.tabs-container li')).toHaveCount(2)
    await expect(recoveryWindow!.locator('.tabs-container li[data-id^="crash-recovery:"]')).toHaveCount(1)
    await expect(recoveryWindow!.locator('body')).not.toContainText('Untitled-1')
    await expect(recoveryWindow!.locator('.tabs-container li').filter({ hasText: 'explicit.md' })).toHaveCount(1)
    await recoveryWindow!.locator('.tabs-container li').filter({ hasText: 'saved.md' }).click()
    await expect(recoveryWindow!.locator('body')).toContainText('recovery survives')
  } finally {
    if (!killed) await first.app.close().catch(() => {})
    await forceTerminate(restarted)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('starts with one clean New Tab after a normal clean exit', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-clean-exit-'))
  const saved = path.join(userDataDir, 'old-tab.md')
  fs.writeFileSync(saved, '# Old tab must not restore\n')
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await expect(first.page.locator('.editor-component')).toContainText('Old tab must not restore')
    await first.app.close()
    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    try {
      await expect(second.page.locator('.tabs-container li')).toHaveCount(1)
      await expect(second.page.locator('body')).not.toContainText('Old tab must not restore')
      await expect(second.page.locator('.editor-component')).toHaveText('')
    } finally {
      await second.app.close().catch(() => {})
    }
  } finally {
    await first.app.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('recovers a conflicted saved draft without overwriting a changed disk file', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-conflict-'))
  const saved = path.join(userDataDir, 'changed.md')
  fs.writeFileSync(saved, '# Original disk\n')
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  let killed = false
  let restarted: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, ' recovery copy')
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await forceTerminate(first.app)
    killed = true
    const changedDisk = Buffer.from('# Changed outside MarkText\n')
    fs.writeFileSync(saved, changedDisk)

    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    await expect.poll(async() => {
      const windows = await second.app.windows()
      return (await Promise.all(windows.map(window => window.locator('body').innerText()))).join('\n')
    }, { timeout: 15_000 }).toContain('recovery copy')
    expect(fs.readFileSync(saved)).toEqual(changedDisk)
  } finally {
    if (!killed) await first.app.close().catch(() => {})
    await forceTerminate(restarted)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('normal dirty Save tombstones its durable crash draft before the window closes', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-normal-save-'))
  const saved = path.join(userDataDir, 'saved.md')
  fs.writeFileSync(saved, '# Saved before normal exit\n')
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  let exited = false
  let restarted: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, ' persisted by Save')
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await first.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 0, checkboxChecked: false })
    })
    const child = first.app.process()
    const closed = new Promise<void>(resolve => child.once('exit', () => resolve()))
    await first.page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
    await closed
    exited = true

    expect(fs.readFileSync(saved, 'utf8')).toContain('persisted by Save')
    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    await expect(second.page.locator('body')).not.toContainText('persisted by Save')
  } finally {
    if (!exited) await first.app.close().catch(() => {})
    await restarted?.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('normal dirty Discard tombstones its durable crash draft before the window closes', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-normal-discard-'))
  const saved = path.join(userDataDir, 'saved.md')
  const diskBytes = Buffer.from('# Saved before normal exit\n')
  fs.writeFileSync(saved, diskBytes)
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  let exited = false
  let restarted: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, ' discarded by close')
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await first.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
    })
    const child = first.app.process()
    const closed = new Promise<void>(resolve => child.once('exit', () => resolve()))
    await first.page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
    await closed
    exited = true

    expect(fs.readFileSync(saved)).toEqual(diskBytes)
    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    await expect(second.page.locator('body')).not.toContainText('discarded by close')
  } finally {
    if (!exited) await first.app.close().catch(() => {})
    await restarted?.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('normal dirty Cancel keeps the document and durable crash draft open', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-normal-cancel-'))
  const saved = path.join(userDataDir, 'saved.md')
  fs.writeFileSync(saved, '# Saved before normal exit\n')
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await typeIntoEditor(first.page, ' retained after Cancel')
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await first.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 2, checkboxChecked: false })
    })
    await first.page.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
    await expect(first.page.locator('body')).toContainText('retained after Cancel')
    expect(fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json'))).toBe(true)
  } finally {
    await first.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 1, checkboxChecked: false })
    }).catch(() => {})
    await first.app.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('recovered saved draft Save tombstones its original crash identity', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-recovered-save-'))
  const saved = path.join(userDataDir, 'saved.md')
  const marker = ' saved after recovery'
  fs.writeFileSync(saved, '# Saved before recovery\n')
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  let firstKilled = false
  let second: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  let third: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, marker)
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await forceTerminate(first.app)
    firstKilled = true

    const recovered = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    second = recovered.app
    await waitForRecovery(second, marker)
    await waitForRecoveredCheckpoint(crashDraftDirectory)
    await closeWithDecision(second, await recoveryWindow(second, marker), 0)
    await forceTerminate(second)
    second = undefined
    expect(fs.readFileSync(saved, 'utf8')).toContain(marker)

    const restarted = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    third = restarted.app
    await expect.poll(() => windowText(third!)).not.toContain(marker)
  } finally {
    if (!firstKilled) await first.app.close().catch(() => {})
    await forceTerminate(second)
    await forceTerminate(third)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('recovered saved draft Discard tombstones its original crash identity', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-recovered-discard-'))
  const saved = path.join(userDataDir, 'saved.md')
  const marker = ' discarded after recovery'
  const diskBytes = Buffer.from('# Saved before recovery\n')
  fs.writeFileSync(saved, diskBytes)
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  let firstKilled = false
  let second: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  let third: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, marker)
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await forceTerminate(first.app)
    firstKilled = true

    const recovered = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    second = recovered.app
    await waitForRecovery(second, marker)
    await waitForRecoveredCheckpoint(crashDraftDirectory)
    await closeWithDecision(second, await recoveryWindow(second, marker), 1)
    await forceTerminate(second)
    second = undefined
    expect(fs.readFileSync(saved)).toEqual(diskBytes)

    const restarted = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    third = restarted.app
    await expect.poll(() => windowText(third!)).not.toContain(marker)
  } finally {
    if (!firstKilled) await first.app.close().catch(() => {})
    await forceTerminate(second)
    await forceTerminate(third)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('recovered saved draft Cancel keeps its original crash draft', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-crash-recovered-cancel-'))
  const saved = path.join(userDataDir, 'saved.md')
  const marker = ' retained after recovery Cancel'
  fs.writeFileSync(saved, '# Saved before recovery\n')
  const first = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  let firstKilled = false
  let second: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  let third: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await typeIntoEditor(first.page, marker)
    const crashDraftDirectory = path.join(userDataDir, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)
    await forceTerminate(first.app)
    firstKilled = true

    const recovered = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    second = recovered.app
    await waitForRecovery(second, marker)
    await waitForRecoveredCheckpoint(crashDraftDirectory)
    const recoveryPage = await recoveryWindow(second, marker)
    await recovered.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async() => ({ response: 2, checkboxChecked: false })
    })
    await recoveryPage.evaluate(() => window.electron.ipcRenderer.send('mt::cmd-close-window'))
    await expect(recoveryPage.locator('body')).toContainText(marker)
    expect(fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json'))).toBe(true)
    await forceTerminate(second)
    second = undefined

    const restarted = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    third = restarted.app
    await waitForRecovery(third, marker)
  } finally {
    if (!firstKilled) await first.app.close().catch(() => {})
    await forceTerminate(second)
    await forceTerminate(third)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
