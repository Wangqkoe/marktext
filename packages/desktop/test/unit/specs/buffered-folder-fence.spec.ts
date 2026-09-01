import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  restoreBufferId: 'folder-fence-window',
  handle: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ restoreBufferId: electron.restoreBufferId }))
  },
  ipcMain: { handle: electron.handle }
}))

import EditorBufferStore from 'main_renderer/editorBufferStore'

interface FolderRootBoundary {
  pathname: string
  generation: number
}

interface FolderRootFencedStore {
  setFolderRootBoundary(restoreBufferId: string, root: FolderRootBoundary): boolean
}

const temporaryDirectories: string[] = []
const createStore = (): { store: EditorBufferStore; bufferPath: string } => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-folder-fence-'))
  temporaryDirectories.push(directory)
  const store = new EditorBufferStore({ editorBufferStorePath: directory })
  const bufferPath = store.getBufferStoreInfo(electron.restoreBufferId).filePath
  return { store, bufferPath }
}

const event = { sender: {} } as never

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true })
  })
  vi.clearAllMocks()
})

describe('EditorBufferStore Folder root stale-write fence', () => {
  it('keeps a closed root tombstoned when a previously generated snapshot arrives late', () => {
    const { store, bufferPath } = createStore()
    const staleSnapshot = {
      version: 1,
      tabs: [{ id: 'dirty-tab', isSaved: false, markdown: 'unsaved text' }],
      crashDrafts: [{ documentId: 'dirty-tab', markdown: 'unsaved text' }],
      project: { rootDirectory: 'C:\\old-root', expanded: ['notes'] },
      layout: { sidebarVisible: true }
    }
    store.updateBufferState(event, staleSnapshot)

    const fencedStore = store as unknown as FolderRootFencedStore
    expect(fencedStore.setFolderRootBoundary(electron.restoreBufferId, {
      pathname: '',
      generation: 2
    })).toBe(true)
    expect(JSON.parse(fs.readFileSync(bufferPath, 'utf8')).project.rootDirectory).toBe('')

    store.updateBufferState(event, staleSnapshot)

    expect(JSON.parse(fs.readFileSync(bufferPath, 'utf8'))).toEqual({
      ...staleSnapshot,
      project: { rootDirectory: '', expanded: ['notes'] }
    })
  })

  it('protects a newly opened root from an older snapshot without discarding document fields', () => {
    const { store, bufferPath } = createStore()
    const fencedStore = store as unknown as FolderRootFencedStore
    const staleSnapshot = {
      tabs: [{ id: 'dirty-old', isSaved: false, markdown: 'preserve me' }],
      crashDrafts: [{ documentId: 'dirty-old', markdown: 'preserve me' }],
      project: { rootDirectory: 'C:\\old-root' }
    }
    store.updateBufferState(event, staleSnapshot)
    expect(fencedStore.setFolderRootBoundary(electron.restoreBufferId, {
      pathname: '',
      generation: 2
    })).toBe(true)
    expect(fencedStore.setFolderRootBoundary(electron.restoreBufferId, {
      pathname: 'C:\\new-root',
      generation: 3
    })).toBe(true)

    store.updateBufferState(event, staleSnapshot)

    expect(JSON.parse(fs.readFileSync(bufferPath, 'utf8'))).toEqual({
      ...staleSnapshot,
      project: { rootDirectory: 'C:\\new-root' }
    })
    expect(fencedStore.setFolderRootBoundary(electron.restoreBufferId, {
      pathname: '',
      generation: 2
    })).toBe(false)

    const currentSnapshot = {
      tabs: [{ id: 'dirty-new', isSaved: false, markdown: 'new unsaved text' }],
      project: { rootDirectory: 'C:\\new-root', selected: 'new.md' }
    }
    store.updateBufferState(event, currentSnapshot)
    expect(JSON.parse(fs.readFileSync(bufferPath, 'utf8'))).toEqual(currentSnapshot)
  })
})
