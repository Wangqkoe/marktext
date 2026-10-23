import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  const w = globalThis as unknown as {
    window?: {
      path?: { sep: string; dirname: (p: string) => string }
      fileUtils?: { isSamePathSync: (a: string, b: string) => boolean }
      electron?: { ipcRenderer: { send: (...a: unknown[]) => void; on: Mock } }
    }
  }
  w.window ??= {}
  w.window.path ??= { sep: '/', dirname: (p: string) => p }
  w.window.fileUtils ??= { isSamePathSync: (a, b) => a === b }
  w.window.electron ??= { ipcRenderer: { send: () => {}, on: vi.fn() } }
})

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))
vi.mock('@/store/bufferedState', () => ({ debouncedSendBufferedState: vi.fn() }))

import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'

describe('useEditorStore HANDLE_WORKSPACE_DISK_CHANGE', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const setup = (dirty: boolean) => {
    const store = useEditorStore()
    usePreferencesStore().autoSave = false
    const read = {
      status: 'read',
      documentId: 'doc-1',
      ownerFence: 'fence',
      readToken: 'token',
      document: { markdown: 'from disk\n', trimTrailingNewline: 2 }
    }
    const composition = {
      readDocumentFromDisk: vi.fn(async() => read),
      reloadDocumentFromDisk: vi.fn(async() => ({ status: 'applied', workspaceRevision: 1 })),
      adoptDiskRead: vi.fn(),
      markDocumentMissing: vi.fn()
    }
    store.ATTACH_WORKSPACE_COMPOSITION(
      composition as unknown as Parameters<typeof store.ATTACH_WORKSPACE_COMPOSITION>[0]
    )
    store.workspaceFacade = {
      documents: [{ documentId: 'doc-1', title: 'a.md', dirty, markdown: 'in editor\n' }]
    } as unknown as typeof store.workspaceFacade
    const tab = { id: 'doc-1', notifications: [] as unknown[] }
    store.tabs = [tab] as unknown as typeof store.tabs
    return { store, composition, read, tab }
  }

  const observation = { documentId: 'doc-1', ownerFence: 'fence', kind: 'reload' } as unknown as Parameters<
    ReturnType<typeof useEditorStore>['HANDLE_WORKSPACE_DISK_CHANGE']
  >[0]

  it('reloads an unedited document silently even with autoSave off (#3652)', async() => {
    const { store, composition, read, tab } = setup(false)

    await store.HANDLE_WORKSPACE_DISK_CHANGE(observation)

    expect(composition.reloadDocumentFromDisk).toHaveBeenCalledWith(read, 'preserve')
    expect(tab.notifications).toHaveLength(0)
  })

  it('asks before replacing unsaved edits', async() => {
    const { store, composition, tab } = setup(true)

    await store.HANDLE_WORKSPACE_DISK_CHANGE(observation)

    expect(composition.reloadDocumentFromDisk).not.toHaveBeenCalled()
    expect(tab.notifications).toEqual([expect.objectContaining({ showConfirm: true, exclusiveType: 'file_changed' })])
  })
})
