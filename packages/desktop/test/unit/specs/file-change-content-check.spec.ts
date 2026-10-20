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

describe('useEditorStore LISTEN_FOR_FILE_CHANGE — a file changed on disk', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(window.electron.ipcRenderer.on as Mock).mockReset()
  })

  const makeTab = (store: ReturnType<typeof useEditorStore>, isSaved = true) => {
    const tab = {
      id: 'tab-1',
      filename: 'a.md',
      pathname: '/x/a.md',
      markdown: 'hello',
      isSaved,
      scrollTop: 120,
      notifications: [],
      history: { stack: [], index: -1 }
    }
    store.tabs = [tab] as unknown as typeof store.tabs
    store.tabIdToIndex = { 'tab-1': 0 }
    return tab
  }

  const captureHandler = () => {
    const onMock = window.electron.ipcRenderer.on as Mock
    const call = onMock.mock.calls.find((c) => c[0] === 'mt::update-file')!
    return call[1] as (e: unknown, payload: unknown) => void
  }

  const fire = (handler: ReturnType<typeof captureHandler>, markdown: string) =>
    handler(null, {
      type: 'change',
      change: {
        pathname: '/x/a.md',
        data: {
          markdown,
          filename: 'a.md',
          encoding: 'utf8',
          lineEnding: 'lf',
          adjustLineEndingOnSave: false,
          trimTrailingNewline: 2,
          isMixedLineEndings: false
        }
      }
    })

  // #1861: a watcher 'change' event fires even when only the file's mtime
  // changed (e.g. a git checkout that left the content byte-identical).
  it('ignores a change whose content matches the tab', () => {
    const store = useEditorStore()
    const tab = makeTab(store)
    const notifySpy = vi.spyOn(store, 'pushTabNotification').mockImplementation(() => {})
    store.LISTEN_FOR_FILE_CHANGE()

    fire(captureHandler(), 'hello')

    expect(notifySpy).not.toHaveBeenCalled()
    expect(tab.isSaved).toBe(true)
  })

  // #3652: MarkText as a preview window beside another editor. Reloading a tab
  // the user never touched discards nothing, so it must not depend on autoSave,
  // which writes in the opposite direction and would overwrite the other editor.
  it('reloads a tab without unsaved edits silently, with autoSave off', () => {
    const store = useEditorStore()
    usePreferencesStore().autoSave = false
    const tab = makeTab(store)
    const notifySpy = vi.spyOn(store, 'pushTabNotification').mockImplementation(() => {})
    store.LISTEN_FOR_FILE_CHANGE()

    fire(captureHandler(), 'hello world')

    expect(tab.markdown).toBe('hello world')
    expect(tab.isSaved).toBe(true)
    expect(notifySpy).not.toHaveBeenCalled()
  })

  it('asks first when the tab has unsaved edits', () => {
    const store = useEditorStore()
    const tab = makeTab(store, false)
    const notifySpy = vi.spyOn(store, 'pushTabNotification').mockImplementation(() => {})
    store.LISTEN_FOR_FILE_CHANGE()

    fire(captureHandler(), 'hello world')

    expect(tab.markdown).toBe('hello')
    expect(notifySpy).toHaveBeenCalledTimes(1)
  })

  it('still asks when the tab has unsaved edits and autoSave is on', () => {
    const store = useEditorStore()
    usePreferencesStore().autoSave = true
    const tab = makeTab(store, false)
    const notifySpy = vi.spyOn(store, 'pushTabNotification').mockImplementation(() => {})
    store.LISTEN_FOR_FILE_CHANGE()

    fire(captureHandler(), 'hello world')

    expect(tab.markdown).toBe('hello')
    expect(notifySpy).toHaveBeenCalledTimes(1)
  })
})

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
