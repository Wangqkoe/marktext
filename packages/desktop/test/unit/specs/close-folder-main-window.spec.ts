import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  emit: vi.fn(() => true),
  on: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: {},
  ipcMain: electron
}))
vi.mock('electron-log', () => ({ default: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('electron-window-state', () => ({ default: vi.fn() }))
vi.mock('main_renderer/config', () => ({
  TITLE_BAR_HEIGHT: 32,
  editorWinOptions: {},
  isLinux: false,
  isOsx: false
}))
vi.mock('main_renderer/contextMenu/editor', () => ({ showEditorContextMenu: vi.fn() }))
vi.mock('main_renderer/filesystem/markdown', () => ({ loadMarkdownFile: vi.fn() }))
vi.mock('main_renderer/spellchecker', () => ({ switchLanguage: vi.fn() }))
vi.mock('main_renderer/ipc', () => ({
  getCrashDraftAdapter: vi.fn(),
  getDocumentIoAdapter: vi.fn(),
  getTransferAdapter: vi.fn()
}))
vi.mock('main_renderer/windows/documentIO', () => ({ attachEditorDocumentIo: vi.fn() }))
vi.mock('main_renderer/windows/utils', () => ({
  ensureWindowPosition: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn()
}))

import EditorWindow from 'main_renderer/windows/editor'
import { WindowLifecycle } from 'main_renderer/windows/base'

interface DeferredCandidate {
  ready: Promise<void>
  commit: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  resolve: () => void
  reject: (error: Error) => void
}

const createCandidate = (settled: 'ready' | 'pending' = 'pending'): DeferredCandidate => {
  let resolveReady!: () => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  if (settled === 'ready') resolveReady()
  return {
    ready,
    commit: vi.fn((publish?: () => void) => {
      publish?.()
      return true
    }),
    close: vi.fn(),
    resolve: resolveReady,
    reject: rejectReady
  }
}

const temporaryRoots: string[] = []
const createRoot = (name: string): string => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), `marktext-${name}-`))
  temporaryRoots.push(parent)
  const root = path.join(parent, name)
  fs.mkdirSync(root)
  return root
}

afterEach(() => {
  temporaryRoots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
  vi.clearAllMocks()
})

describe('EditorWindow Folder watcher transaction', () => {
  it('does not publish or replace a Folder root until its watcher is ready', async() => {
    const first = createCandidate('ready')
    const second = createCandidate()
    const candidates = [first, second]
    const send = vi.fn()
    const accessor = {
      windowManager: {
        prepareDirectoryWatcher: vi.fn(() => candidates.shift())
      },
      preferences: { setItems: vi.fn() },
      menu: {
        addRecentlyUsedDocument: vi.fn(),
        updateFolderRootMenu: vi.fn()
      }
    }
    const editor = new EditorWindow(accessor as never)
    editor.lifecycle = WindowLifecycle.READY
    editor.browserWindow = { id: 42, webContents: { send } } as never
    const oldRoot = createRoot('old-root')
    const newRoot = createRoot('new-root')

    await editor.openFolder(oldRoot)
    send.mockClear()

    const replacement = editor.openFolder(newRoot)
    await Promise.resolve()

    expect(send).not.toHaveBeenCalled()
    expect(second.commit).not.toHaveBeenCalled()

    second.resolve()
    await expect(replacement).resolves.toBe(true)
    expect(second.commit).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith('mt::open-directory', {
      pathname: path.normalize(newRoot),
      generation: 2
    })
  })

  it('retains the old main and renderer root when a candidate fails before ready', async() => {
    const first = createCandidate('ready')
    const second = createCandidate()
    const candidates = [first, second]
    const send = vi.fn()
    const accessor = {
      windowManager: {
        prepareDirectoryWatcher: vi.fn(() => candidates.shift())
      },
      preferences: { setItems: vi.fn() },
      menu: {
        addRecentlyUsedDocument: vi.fn(),
        updateFolderRootMenu: vi.fn()
      }
    }
    const editor = new EditorWindow(accessor as never)
    editor.lifecycle = WindowLifecycle.READY
    editor.browserWindow = { id: 43, webContents: { send } } as never
    const oldRoot = createRoot('retained-root')
    const failedRoot = createRoot('failed-root')

    await editor.openFolder(oldRoot)
    send.mockClear()

    const replacement = editor.openFolder(failedRoot)
    second.reject(new Error('watcher failed before ready'))

    await expect(replacement).resolves.toBe(false)
    expect(editor.openedRootDirectory).toBe(path.normalize(oldRoot))
    expect(send).not.toHaveBeenCalledWith('mt::open-directory', expect.objectContaining({
      pathname: path.normalize(failedRoot)
    }))
    expect(first.close).not.toHaveBeenCalled()
  })
})
