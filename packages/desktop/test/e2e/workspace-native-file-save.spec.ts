import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { launchElectron, typeIntoEditor, waitForMenuReady } from './helpers'

type SaveDialogPlan =
  | { readonly status: 'pending' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'selected'; readonly filePath: string }

const configureSaveDialog = async(app: ElectronApplication, plan: SaveDialogPlan): Promise<void> => {
  await app.evaluate(({ dialog }, nextPlan) => {
    const g = global as unknown as {
      __mt_stab007_save_dialog__?: {
        calls: number
        plan: SaveDialogPlan
        resolvers: Array<(result: { canceled: boolean; filePath?: string }) => void>
      }
    }
    g.__mt_stab007_save_dialog__ = { calls: 0, plan: nextPlan, resolvers: [] }
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => {
      const state = g.__mt_stab007_save_dialog__
      if (!state) throw new Error('STAB-007 save dialog test state is missing')
      state.calls += 1
      if (state.plan.status === 'pending') return new Promise((resolve) => state.resolvers.push(resolve))
      return state.plan.status === 'cancelled'
        ? { canceled: true }
        : { canceled: false, filePath: state.plan.filePath }
    }
  }, plan)
}

const settleSaveDialog = async(app: ElectronApplication, plan: Exclude<SaveDialogPlan, { readonly status: 'pending' }>): Promise<void> => {
  await app.evaluate((_electron, nextPlan) => {
    const g = global as unknown as {
      __mt_stab007_save_dialog__?: {
        plan: SaveDialogPlan
        resolvers: Array<(result: { canceled: boolean; filePath?: string }) => void>
      }
    }
    const state = g.__mt_stab007_save_dialog__
    if (!state) throw new Error('STAB-007 save dialog test state is missing')
    state.plan = nextPlan
    const result = nextPlan.status === 'cancelled'
      ? { canceled: true }
      : { canceled: false, filePath: nextPlan.filePath }
    for (const resolve of state.resolvers.splice(0)) resolve(result)
  }, plan)
}

const saveDialogCalls = async(app: ElectronApplication): Promise<number> => app.evaluate(() => {
  const g = global as unknown as {
    __mt_stab007_save_dialog__?: { calls: number }
  }
  return g.__mt_stab007_save_dialog__?.calls ?? 0
})

const invokeFileSaveFromMenu = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ BrowserWindow, Menu }) => {
    const window = BrowserWindow.getFocusedWindow()
    const fileMenu = Menu.getApplicationMenu()?.items.find((item) =>
      item.submenu?.items.some((entry) => entry.accelerator?.includes('S'))
    )
    const save = fileMenu?.submenu?.items.find((item) => item.accelerator?.includes('S') && !item.accelerator?.includes('Shift'))
    if (!window || !save) throw new Error('File > Save is unavailable')
    save.click(undefined, window, window.webContents)
  })
}

const invokeCtrlSave = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) throw new Error('focused window is unavailable')
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'S', modifiers: ['control'] })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'S', modifiers: ['control'] })
  })
}

const snapshotActiveDocument = async(page: Page) => page.evaluate(() => {
  const driver = window as unknown as {
    __mtWorkspaceSnapshot?: () => {
      projection: {
        focusedPaneId: string
        panes: Array<{ paneId: string; activeViewId: string; tabs: Array<{ viewId: string; dirty: boolean }> }>
      }
      documents: Array<{ viewId: string; fileKey?: string; markdown: string }>
    }
  }
  const snapshot = driver.__mtWorkspaceSnapshot?.()
  const pane = snapshot?.projection.panes.find((candidate) => candidate.paneId === snapshot.projection.focusedPaneId)
  const active = pane?.tabs.find((candidate) => candidate.viewId === pane.activeViewId)
  const document = snapshot?.documents.find((candidate) => candidate.viewId === active?.viewId)
  return { dirty: active?.dirty, fileKey: document?.fileKey, markdown: document?.markdown }
})

const holdFirstSavedCrashDraftAck = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ ipcMain }) => {
    const state = {
      held: false,
      release: undefined as (() => void) | undefined
    }
    ;(global as unknown as { __mt_stab007_saved_crash_draft_ack__?: typeof state }).__mt_stab007_saved_crash_draft_ack__ = state
    ipcMain.removeHandler('mt::workspace::crash-draft')
    ipcMain.handle('mt::workspace::crash-draft', async(_event, request: { readonly kind: string }) => {
      if (request.kind === 'saved' && !state.held) {
        state.held = true
        return new Promise((resolve) => {
          state.release = () => {
            resolve({ durable: true })
          }
        })
      }
      return request.kind === 'checkpoint'
        ? { durable: true, receipt: 'STAB-007-test-receipt' }
        : request.kind === 'recover'
          ? { durable: true, recoveries: [] }
          : { durable: true }
    })
  })
}

const heldSavedCrashDraftAck = async(app: ElectronApplication): Promise<boolean> => await app.evaluate(() =>
  (global as unknown as { __mt_stab007_saved_crash_draft_ack__?: { held: boolean } }).__mt_stab007_saved_crash_draft_ack__?.held ?? false
)

const releaseFirstSavedCrashDraftAck = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(() => {
    const state = (global as unknown as {
      __mt_stab007_saved_crash_draft_ack__?: { release?: () => void }
    }).__mt_stab007_saved_crash_draft_ack__
    if (!state?.release) throw new Error('STAB-007 saved crash draft acknowledgement is not held')
    state.release()
  })
}

const stopApp = async(app: ElectronApplication): Promise<void> => {
  const child = app.process()
  if (child.exitCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  const mainPid = await app.evaluate(() => process.pid)
  execFileSync('taskkill', ['/PID', String(mainPid), '/T', '/F'])
  await exited
}

const saveEntries: ReadonlyArray<{ readonly name: string; readonly invoke: (app: ElectronApplication, page: Page) => Promise<void> }> = [
  {
    name: 'Ctrl+S',
    invoke: async(app) => invokeCtrlSave(app)
  },
  { name: 'File > Save', invoke: async(app) => invokeFileSaveFromMenu(app) }
]

for (const entry of saveEntries) {
  test(`${entry.name} opens one target dialog for a dirty untitled document, preserves Cancel, and saves the selected path`, async() => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-native-file-save-'))
    const target = path.join(profile, `${entry.name.replaceAll(/[^a-z]/gi, '-').toLowerCase()}-target.md`)
    const sentinel = `STAB007_${entry.name.replaceAll(/[^a-z]/gi, '_').toUpperCase()}_UNTITLED_SAVE`
    const { app, page } = await launchElectron([], { userDataDir: profile, userDataDirOwnership: 'caller' })
    try {
      await waitForMenuReady(app)
      await typeIntoEditor(page, sentinel)
      const crashDraftDirectory = path.join(profile, 'crash-drafts')
      await expect.poll(() => {
        try { return fs.readdirSync(crashDraftDirectory).some((name) => name.endsWith('.draft.json')) } catch { return false }
      }).toBe(true)

      await configureSaveDialog(app, { status: 'cancelled' })
      await entry.invoke(app, page)
      await expect.poll(() => saveDialogCalls(app), { timeout: 5_000 }).toBe(1)
      expect(fs.existsSync(target)).toBe(false)
      await expect.poll(() => snapshotActiveDocument(page)).toEqual({
        dirty: true,
        fileKey: undefined,
        markdown: expect.stringContaining(sentinel)
      })
      expect(fs.readdirSync(crashDraftDirectory).some((name) => name.endsWith('.draft.json'))).toBe(true)

      await configureSaveDialog(app, { status: 'selected', filePath: target })
      await entry.invoke(app, page)
      await expect.poll(() => saveDialogCalls(app), { timeout: 5_000 }).toBe(1)
      await expect.poll(() => fs.existsSync(target)).toBe(true)
      await expect.poll(() => fs.readFileSync(target, 'utf8')).toContain(sentinel)
      await expect.poll(() => snapshotActiveDocument(page)).toEqual({
        dirty: false,
        fileKey: target,
        markdown: expect.stringContaining(sentinel)
      })
    } finally {
      await stopApp(app).catch(() => {})
      fs.rmSync(profile, { recursive: true, force: true })
    }
  })
}

test('ordinary Save for a saved document does not open a target dialog', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-native-file-save-existing-'))
  const saved = path.join(profile, 'existing.md')
  const sentinel = 'STAB007_EXISTING_FILE_SAVE'
  fs.writeFileSync(saved, '# Existing document\n')
  const { app, page } = await launchElectron([saved], { userDataDir: profile, userDataDirOwnership: 'caller' })
  try {
    await waitForMenuReady(app)
    await typeIntoEditor(page, sentinel)
    await configureSaveDialog(app, { status: 'cancelled' })
    await invokeCtrlSave(app)
    await expect.poll(() => fs.readFileSync(saved, 'utf8')).toContain(sentinel)
    expect(await saveDialogCalls(app)).toBe(0)
  } finally {
    await stopApp(app).catch(() => {})
    fs.rmSync(profile, { recursive: true, force: true })
  }
})

test('coalesces concurrent untitled Save entries until their dialog settles', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-native-file-save-reentry-'))
  const target = path.join(profile, 'coalesced-save.md')
  const sentinel = 'STAB007_COALESCED_UNTITLED_SAVE'
  const afterSave = ' STAB007_SAVE_AFTER_COALESCED_TARGET'
  const { app, page } = await launchElectron([], { userDataDir: profile, userDataDirOwnership: 'caller' })
  try {
    await waitForMenuReady(app)
    await typeIntoEditor(page, sentinel)
    const crashDraftDirectory = path.join(profile, 'crash-drafts')
    await expect.poll(() => {
      try { return fs.readdirSync(crashDraftDirectory).some((name) => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)

    await configureSaveDialog(app, { status: 'pending' })
    await invokeCtrlSave(app)
    await expect.poll(() => saveDialogCalls(app), { timeout: 5_000 }).toBe(1)
    await invokeFileSaveFromMenu(app)
    await expect.poll(() => saveDialogCalls(app), { timeout: 1_000 }).toBe(1)

    await settleSaveDialog(app, { status: 'cancelled' })
    await expect.poll(() => snapshotActiveDocument(page)).toEqual({
      dirty: true,
      fileKey: undefined,
      markdown: expect.stringContaining(sentinel)
    })
    expect(fs.readdirSync(crashDraftDirectory).some((name) => name.endsWith('.draft.json'))).toBe(true)

    await configureSaveDialog(app, { status: 'selected', filePath: target })
    await invokeCtrlSave(app)
    await expect.poll(() => saveDialogCalls(app), { timeout: 5_000 }).toBe(1)
    await expect.poll(() => fs.existsSync(target)).toBe(true)
    await expect.poll(() => fs.readFileSync(target, 'utf8')).toContain(sentinel)
    await expect.poll(() => snapshotActiveDocument(page)).toEqual({
      dirty: false,
      fileKey: target,
      markdown: expect.stringContaining(sentinel)
    })

    await typeIntoEditor(page, afterSave)
    await invokeFileSaveFromMenu(app)
    await expect.poll(() => fs.readFileSync(target, 'utf8')).toContain(afterSave)
    expect(await saveDialogCalls(app)).toBe(1)
  } finally {
    await stopApp(app).catch(() => {})
    fs.rmSync(profile, { recursive: true, force: true })
  }
})

test('saves a newly dirty bound document while its prior Save As waits for CrashDraft', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-native-file-save-bound-race-'))
  const target = path.join(profile, 'bound-race.md')
  const initial = 'STAB007_BOUND_SAVE_INITIAL'
  const after = ' STAB007_BOUND_SAVE_AFTER'
  const { app, page } = await launchElectron([], { userDataDir: profile, userDataDirOwnership: 'caller' })
  let held = false
  try {
    await waitForMenuReady(app)
    await typeIntoEditor(page, initial)
    await expect.poll(() => {
      try { return fs.readdirSync(path.join(profile, 'crash-drafts')).some((name) => name.endsWith('.draft.json')) } catch { return false }
    }).toBe(true)

    await configureSaveDialog(app, { status: 'selected', filePath: target })
    await holdFirstSavedCrashDraftAck(app)
    await invokeCtrlSave(app)
    await expect.poll(() => heldSavedCrashDraftAck(app)).toBe(true)
    held = true
    await expect.poll(() => snapshotActiveDocument(page)).toEqual({
      dirty: false,
      fileKey: target,
      markdown: expect.stringContaining(initial)
    })
    await expect.poll(() => fs.readFileSync(target, 'utf8')).toContain(initial)

    await typeIntoEditor(page, after)
    await invokeFileSaveFromMenu(app)
    await expect.poll(() => fs.readFileSync(target, 'utf8')).toContain(after)
    await releaseFirstSavedCrashDraftAck(app)
    held = false
    await expect.poll(() => snapshotActiveDocument(page)).toEqual({
      dirty: false,
      fileKey: target,
      markdown: expect.stringContaining(after)
    })
  } finally {
    if (held) await releaseFirstSavedCrashDraftAck(app).catch(() => {})
    await stopApp(app).catch(() => {})
    fs.rmSync(profile, { recursive: true, force: true })
  }
})
