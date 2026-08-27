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
  const exited = new Promise<void>(resolve => child.once('exit', resolve))
  const mainPid = await app.evaluate(() => process.pid)
  execFileSync('taskkill', ['/PID', String(mainPid), '/T', '/F'])
  await exited
}

for (const scenario of [
  { kind: 'saved', edit: '', expectedDirty: false },
  { kind: 'dirty', edit: ' dirty move', expectedDirty: true },
  { kind: 'untitled', edit: 'Untitled move content', expectedDirty: true }
]) {
  test(`moves a ${scenario.kind} tab through the production renderer action seam`, async() => {
    const { kind, edit, expectedDirty } = scenario
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-transfer-action-'))
    const file = path.join(profile, 'move.md')
    fs.writeFileSync(file, '# Move action content\n')
    const { app, page } = await launchElectron(kind === 'untitled' ? [] : [file], { userDataDir: profile, userDataDirOwnership: 'caller' })
    try {
      await expect(page.locator('.editor-with-tabs')).toBeVisible()
      if (edit) await typeIntoEditor(page, edit)
      const tabId = await page.locator('.tabs-container li').first().getAttribute('data-id')
      expect(tabId).toBeTruthy()
      const result = await page.evaluate(async(id) => {
        const driver = window as unknown as {
          __mtMoveTabToNewWindow?: (input: { tabId: string; paneId: 'left' | 'right' }) => Promise<unknown>
        }
        return driver.__mtMoveTabToNewWindow?.({ tabId: id!, paneId: 'left' })
      }, tabId)
      expect(result).toMatchObject({ status: 'applied' })
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2)
      const target = (await app.windows()).find(candidate => candidate !== page)
      expect(target).toBeTruthy()
      await expect(target!.locator('.editor-with-tabs')).toBeVisible()
      await expect(target!.locator('body')).toContainText(kind === 'untitled' ? 'Untitled move content' : 'Move action content')
    // A transfer target owns only the local target view, never its startup
    // bootstrap tab or the source document identity supplied by the intent.
      await expect(target!.locator('.tabs-container li')).toHaveCount(1)
      const activeTargetTab = target!.locator('.tabs-container li.active')
      await expect(activeTargetTab).toHaveCount(1)
      await expect(activeTargetTab).not.toHaveAttribute('data-id', tabId!)
      await expect(activeTargetTab).toHaveAttribute('data-id', /^transfer-target:/)
      await expect(activeTargetTab).toHaveClass(expectedDirty ? /unsaved/ : /active/)
      await expect(page.locator('.tabs-container li')).toHaveCount(1)
      await expect(page.locator('.tabs-container li')).toContainText('New Tab')
    } finally {
      await forceTerminate(app)
      fs.rmSync(profile, { recursive: true, force: true })
    }
  })
}

test('moves the last saved tab into a singleton target and closes that target through File Close Tab', async() => {
  test.setTimeout(60_000)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-transfer-singleton-target-'))
  const file = path.join(profile, 'move.md')
  fs.writeFileSync(file, '# Singleton transfer target\n')
  const { app, page } = await launchElectron([file], { userDataDir: profile, userDataDirOwnership: 'caller' })
  const child = app.process()
  let restarted: ElectronApplication | undefined
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    const sourceId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.id)
    if (!sourceId) throw new Error('source window was not found')
    const tabId = await page.locator('.tabs-container li').first().getAttribute('data-id')
    expect(tabId).toBeTruthy()
    await expect(page.evaluate(async(id) => {
      const driver = window as unknown as {
        __mtMoveTabToNewWindow?: (input: { tabId: string; paneId: 'left' | 'right' }) => Promise<unknown>
      }
      return driver.__mtMoveTabToNewWindow?.({ tabId: id!, paneId: 'left' })
    }, tabId)).resolves.toMatchObject({ status: 'applied' })

    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2)
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    await expect(page.locator('.tabs-container li')).toContainText('New Tab')

    const targetId = await app.evaluate(async({ BrowserWindow }, marker) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (await window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(marker)})`)) return window.id
      }
      return undefined
    }, 'Singleton transfer target')
    if (!targetId) throw new Error('moved target window was not found')
    const target = (await app.windows()).find(candidate => candidate !== page)
    if (!target) throw new Error('moved target Playwright page was not found')
    await expect(target.locator('.tabs-container li')).toHaveCount(1)
    await expect(target.locator('.tabs-container li')).toHaveAttribute('data-id', /^transfer-target:/)
    await expect(target.locator('.tabs-container li')).not.toContainText('Untitled-1')
    await expect.poll(() => {
      try {
        return fs.readdirSync(path.join(profile, 'crash-drafts')).filter(name => name.endsWith('.draft.json'))
      } catch {
        return []
      }
    }).toEqual([])

    const closeTarget = target.waitForEvent('close')
    await app.evaluate(({ BrowserWindow, Menu }, windowId) => {
      const window = BrowserWindow.fromId(windowId)
      const fileMenu = Menu.getApplicationMenu()?.items.find(item => item.submenu?.items.some(entry => entry.label === 'Close Tab'))
      const closeTab = fileMenu?.submenu?.items.find(item => item.label === 'Close Tab')
      if (!window || !closeTab) throw new Error('File > Close Tab is unavailable')
      closeTab.click(undefined, window, window.webContents)
    }, targetId)
    await closeTarget
    await expect.poll(() => app.evaluate(({ BrowserWindow }, windowId) => BrowserWindow.fromId(windowId) === null, targetId)).toBe(true)
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect.poll(() => app.evaluate(({ BrowserWindow }, windowId) => BrowserWindow.fromId(windowId)?.id, sourceId)).toBe(sourceId)
    await app.evaluate(({ BrowserWindow, Menu }, windowId) => {
      const window = BrowserWindow.fromId(windowId)
      const fileMenu = Menu.getApplicationMenu()?.items.find(item => item.submenu?.items.some(entry => entry.label === 'Close Tab'))
      const closeTab = fileMenu?.submenu?.items.find(item => item.label === 'Close Tab')
      if (!window || !closeTab) throw new Error('File > Close Tab is unavailable')
      closeTab.click(undefined, window, window.webContents)
    }, sourceId)
    await expect.poll(() => child.exitCode, { timeout: 5_000 }).toBe(0)

    const second = await launchElectron([], { userDataDir: profile, userDataDirOwnership: 'caller' })
    restarted = second.app
    await expect(second.page.locator('.tabs-container li')).toHaveCount(1)
    await expect(second.page.locator('.tabs-container li')).not.toHaveClass(/unsaved/)
    await expect(second.page.locator('.editor-component')).toHaveText('')
    await expect(second.page.locator('body')).not.toContainText('Singleton transfer target')
  } finally {
    if (child.exitCode === null) await forceTerminate(app)
    await forceTerminate(restarted)
    fs.rmSync(profile, { recursive: true, force: true })
  }
})

test('keeps ordinary New Window and Open in new window isolated from the source', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-ordinary-new-window-'))
  const file = path.join(profile, 'open.md')
  fs.writeFileSync(file, '# Open in new window\n')
  const { app, page } = await launchElectron([file], { userDataDir: profile, userDataDirOwnership: 'caller' })
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    const blankWindow = app.waitForEvent('window')
    await app.evaluate(({ BrowserWindow, Menu }) => {
      const window = BrowserWindow.getFocusedWindow()
      const fileMenu = Menu.getApplicationMenu()?.items.find(item => item.submenu?.items.some(entry => entry.label === 'New Window'))
      const newWindow = fileMenu?.submenu?.items.find(item => item.label === 'New Window')
      if (!window || !newWindow) throw new Error('File > New Window is unavailable')
      newWindow.click(undefined, window, window.webContents)
    })
    const blank = await blankWindow
    await expect(blank.locator('.tabs-container li')).toHaveCount(1)
    await expect(blank.locator('.tabs-container li')).toContainText('Untitled-1')
    await expect(page.locator('body')).toContainText('Open in new window')

    const openedWindow = app.waitForEvent('window')
    await page.evaluate(filePath => window.electron.ipcRenderer.send('mt::cmd-open-file-in-new-window', filePath), file)
    const opened = await openedWindow
    await expect(opened.locator('.tabs-container li')).toHaveCount(1)
    await expect(opened.locator('body')).toContainText('Open in new window')
    await expect(page.locator('body')).toContainText('Open in new window')
  } finally {
    await forceTerminate(app)
    fs.rmSync(profile, { recursive: true, force: true })
  }
})

test('restores dirty saved-tab history in the target after a last-tab Move', async() => {
  test.setTimeout(60_000)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-transfer-history-'))
  const file = path.join(profile, 'move.md')
  fs.writeFileSync(file, '# Move history source\n')
  const { app, page } = await launchElectron([file], { userDataDir: profile, userDataDirOwnership: 'caller' })
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    await typeIntoEditor(page, ' unsaved target history')
    await expect(page.locator('.editor-component')).toContainText('unsaved target history')
    const tabId = await page.locator('.tabs-container li').first().getAttribute('data-id')
    expect(tabId).toBeTruthy()
    await expect(page.evaluate(async(id) => {
      const driver = window as unknown as {
        __mtMoveTabToNewWindow?: (input: { tabId: string; paneId: 'left' | 'right' }) => Promise<unknown>
      }
      return driver.__mtMoveTabToNewWindow?.({ tabId: id!, paneId: 'left' })
    }, tabId)).resolves.toMatchObject({ status: 'applied' })
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2)
    await expect(page.locator('.tabs-container li')).toContainText('New Tab')

    const target = (await app.windows()).find(candidate => candidate !== page)
    expect(target).toBeTruthy()
    await expect(target!.locator('.editor-component')).toContainText('unsaved target history')
    const targetId = await app.evaluate(async({ BrowserWindow }, marker) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (await window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(marker)})`)) return window.id
      }
      return undefined
    }, 'unsaved target history')
    if (!targetId) throw new Error('moved target window was not found')
    await app.evaluate(({ BrowserWindow }, windowId) => {
      BrowserWindow.fromId(windowId)?.webContents.send('mt::editor-edit-action', 'undo')
    }, targetId)
    await expect.poll(() => target!.locator('.editor-component').innerText()).not.toContain('unsaved target history')
  } finally {
    await forceTerminate(app)
    fs.rmSync(profile, { recursive: true, force: true })
  }
})

test('rebinds the crash-draft endpoint after renderer reload', async() => {
  const { app, page } = await launchElectron()
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    const receipt = await page.evaluate(() => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', {
      kind: 'checkpoint',
      checkpoint: {
        documentId: 'electron-endpoint-test',
        documentRevision: 1,
        markdown: 'draft',
        view: { cursor: { line: 0, column: 0 }, selection: null }
      }
    })) as { durable: boolean; receipt?: string }
    expect(receipt).toMatchObject({ durable: true, receipt: expect.any(String) })
    await page.reload({ waitUntil: 'commit', timeout: 5000 })
    await page.waitForSelector('.editor-with-tabs', { timeout: 5000 })
    // A receipt issued to the pre-navigation endpoint is inert after reload;
    // the freshly bound renderer can checkpoint again with a new receipt.
    await expect(page.evaluate((staleReceipt) => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', {
      kind: 'saved', receipt: staleReceipt
    }), receipt.receipt)).resolves.toMatchObject({ durable: false })
    await expect(page.evaluate(() => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', {
      kind: 'checkpoint',
      checkpoint: {
        documentId: 'electron-endpoint-test',
        documentRevision: 2,
        markdown: 'after reload',
        view: { cursor: { line: 0, column: 0 }, selection: null }
      }
    }))).resolves.toMatchObject({ durable: true, receipt: expect.any(String) })
  } finally {
    await forceTerminate(app)
  }
})

test('keeps the source usable when production target creation fails before authorization', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-transfer-target-failure-'))
  const file = path.join(profile, 'move.md')
  fs.writeFileSync(file, '# Target failure source\n')
  const { app, page } = await launchElectron([file], {
    userDataDir: profile,
    userDataDirOwnership: 'caller',
    transferFault: 'target-create-once'
  })
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    const tabId = await page.locator('.tabs-container li').first().getAttribute('data-id')
    expect(tabId).toBeTruthy()
    const first = await page.evaluate(async(id) => {
      const driver = window as unknown as {
        __mtMoveTabToNewWindow?: (input: { tabId: string; paneId: 'left' | 'right' }) => Promise<unknown>
      }
      return driver.__mtMoveTabToNewWindow?.({ tabId: id!, paneId: 'left' })
    }, tabId)
    expect(first).toMatchObject({ status: 'failed', reason: expect.stringContaining('target creation') })
    await expect(page.locator('body')).toContainText('Target failure source')
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)

    const second = await page.evaluate(async(id) => {
      const driver = window as unknown as {
        __mtMoveTabToNewWindow?: (input: { tabId: string; paneId: 'left' | 'right' }) => Promise<unknown>
      }
      return driver.__mtMoveTabToNewWindow?.({ tabId: id!, paneId: 'left' })
    }, tabId)
    expect(second).toMatchObject({ status: 'applied' })
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    await expect(page.locator('.tabs-container li')).toContainText('New Tab')
  } finally {
    await forceTerminate(app)
    fs.rmSync(profile, { recursive: true, force: true })
  }
})

test('forwards an authorized Move through startup recovery without restoring injected sidecar history', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-transfer-recovery-restart-'))
  const moved = path.join(profile, 'moved.md')
  const explicit = path.join(profile, 'explicit.md')
  fs.writeFileSync(moved, '# Post authorization recovery\n')
  fs.writeFileSync(explicit, '# Explicit startup stays open\n')
  const first = await launchElectron([moved], {
    userDataDir: profile,
    userDataDirOwnership: 'caller',
    transferFault: 'hold-source-release'
  })
  let firstKilled = false
  let secondApp: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
  try {
    await expect(first.page.locator('.editor-with-tabs')).toBeVisible()
    await typeIntoEditor(first.page, ' recovery history must not restore')
    await expect(first.page.locator('.editor-component')).toContainText('recovery history must not restore')
    const tabId = await first.page.locator('.tabs-container li').first().getAttribute('data-id')
    expect(tabId).toBeTruthy()
    await first.page.evaluate((id) => {
      const driver = window as unknown as {
        __mtMoveTabToNewWindow?: (input: { tabId: string; paneId: 'left' | 'right' }) => Promise<unknown>
      }
      window.setTimeout(() => {
        const action = driver.__mtMoveTabToNewWindow
        if (action) action({ tabId: id!, paneId: 'left' }).catch(() => undefined)
      }, 0)
    }, tabId)
    const journalPath = path.join(profile, 'tab-transfer', 'journal.ndjson')
    await expect.poll(() => {
      try {
        return fs.readFileSync(journalPath, 'utf8').split('\n').flatMap(line => line ? [JSON.parse(line) as { phase: string; kind: string }] : [])
      } catch {
        return []
      }
    }).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'commit-authorized', kind: 'observed' }),
      expect.objectContaining({ phase: 'source-released', kind: 'intent' })
    ]))
    const transferId = fs.readFileSync(journalPath, 'utf8').split('\n')
      .flatMap(line => line ? [JSON.parse(line) as { transferId?: string }] : [])
      .find(record => record.transferId !== undefined)?.transferId
    if (!transferId) throw new Error('transfer id was not recorded')
    const transferDir = path.join(profile, 'tab-transfer')
    const capsule = JSON.parse(Buffer.from(
      (JSON.parse(fs.readFileSync(path.join(transferDir, `${transferId}.capsule.json`), 'utf8')) as { bytes: string }).bytes,
      'base64'
    ).toString('utf8')) as { history: unknown }
    const recoveryPath = path.join(transferDir, `${transferId}.recovery.json`)
    const recovery = JSON.parse(fs.readFileSync(recoveryPath, 'utf8')) as Record<string, unknown>
    fs.writeFileSync(recoveryPath, JSON.stringify({ ...recovery, history: capsule.history }))

    const child = first.app.process()
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    const mainPid = await first.app.evaluate(() => process.pid)
    execFileSync('taskkill', ['/PID', String(mainPid), '/T', '/F'])
    await exited
    firstKilled = true

    const second = await launchElectron([explicit], { userDataDir: profile, userDataDirOwnership: 'caller' })
    secondApp = second.app
    expect(await second.app.evaluate(() => process.pid)).not.toBe(mainPid)
    expect(await second.app.evaluate(() => process.argv)).toContain(explicit)
    await expect.poll(() => second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBeGreaterThanOrEqual(1)
    await expect.poll(async() => {
      const windows = await second.app.windows()
      return (await Promise.all(windows.map(window => window.locator('body').innerText()))).join('\n')
    }).toContain('Post authorization recovery')
    await expect.poll(async() => {
      const windows = await second.app.windows()
      return (await Promise.all(windows.map(window => window.locator('body').innerText()))).join('\n')
    }).toContain('recovery history must not restore')
    await expect.poll(async() => {
      const windows = await second.app.windows()
      return (await Promise.all(windows.map(window => window.locator('body').innerText()))).join('\n')
    }, { timeout: 20_000 }).toContain('Explicit startup stays open')
    await expect.poll(() => {
      try {
        const last = fs.readFileSync(journalPath, 'utf8').trim().split('\n').at(-1)
        const record = last ? JSON.parse(last) as { phase?: string; kind?: string; aborted?: boolean; ownerSessionId?: string; source?: { sessionId?: string }; target?: { sessionId?: string } } : undefined
        return record && { phase: record.phase, kind: record.kind, aborted: record.aborted, owner: record.ownerSessionId, source: record.source?.sessionId, target: record.target?.sessionId }
      } catch { return undefined }
    }, { timeout: 20_000 }).toMatchObject({ phase: 'completed', kind: 'observed' })
    const migrations = fs.readFileSync(path.join(profile, 'tab-transfer', 'migrations.ndjson'), 'utf8').trim().split('\n')
    expect(migrations).toHaveLength(1)
    let recovered: Awaited<ReturnType<typeof second.app.windows>>[number] | undefined
    for (const candidate of await second.app.windows()) {
      if ((await candidate.locator('body').innerText()).includes('recovery history must not restore')) {
        recovered = candidate
        break
      }
    }
    if (!recovered) throw new Error('recovered window was not found')
    await expect.poll(() => recovered!.evaluate((marker) => {
      const driver = window as unknown as {
        __mtWorkspaceSnapshot?: () => { documents: Array<{ markdown: string; portableHistory: unknown }> }
      }
      return driver.__mtWorkspaceSnapshot?.().documents.find(document => document.markdown.includes(marker))?.portableHistory
    }, 'recovery history must not restore')).toEqual({ version: 1, value: [] })
  } finally {
    if (!firstKilled) await forceTerminate(first.app)
    await forceTerminate(secondApp)
    fs.rmSync(profile, { recursive: true, force: true })
  }
})
