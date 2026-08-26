import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { launchElectron, typeIntoEditor } from './helpers'

const forceTerminate = async(app: ElectronApplication | undefined): Promise<void> => {
  if (!app) return
  const child = app.process()
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', resolve))
  let mainPid: number
  try {
    mainPid = await app.evaluate(() => process.pid)
  } catch {
    return
  }
  if (child.exitCode !== null) return
  try {
    execFileSync('taskkill', ['/PID', String(mainPid), '/T', '/F'])
  } catch {
    if (child.exitCode !== null) return
    throw new Error('could not terminate the Electron process tree')
  }
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
    }).toBe(true)
    await forceTerminate(first.app)
    killed = true

    const second = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
    restarted = second.app
    await expect.poll(async() => {
      const windows = await second.app.windows()
      return (await Promise.all(windows.map(window => window.locator('body').innerText()))).join('\n')
    }, { timeout: 15_000 }).toContain('Untitled before crash')
    let recoveryWindow: Awaited<ReturnType<typeof second.app.windows>>[number] | undefined
    for (const window of await second.app.windows()) {
      if ((await window.locator('body').innerText()).includes('Untitled before crash')) recoveryWindow = window
    }
    expect(recoveryWindow).toBeTruthy()
    await expect(recoveryWindow!.locator('.tabs-container li.active')).toHaveAttribute('data-id', 'crash-recovery:mt-0')
  } finally {
    if (!killed) await first.app.close().catch(() => {})
    await forceTerminate(restarted)
    fs.rmSync(userDataDir, { recursive: true, force: true })
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
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
      try { return fs.readdirSync(crashDraftDirectory).some(name => name.endsWith('.draft.json')) }
      catch { return false }
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
