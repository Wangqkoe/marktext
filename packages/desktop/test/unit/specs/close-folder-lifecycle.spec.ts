import fsPromises from 'fs/promises'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const watcherFixtures = vi.hoisted(() => {
  const instances: Array<{
    handlers: Map<string, (...args: unknown[]) => unknown>
    close: ReturnType<typeof vi.fn>
  }> = []
  return { instances }
})

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => {
      const handlers = new Map<string, (...args: unknown[]) => unknown>()
      const instance = {
        handlers,
        close: vi.fn(),
        add: vi.fn(),
        unwatch: vi.fn(),
        on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(event, handler)
          return instance
        })
      }
      watcherFixtures.instances.push(instance)
      return instance
    })
  }
}))

vi.mock('ced', () => ({ default: () => 'UTF-8' }))

const persistence = vi.hoisted(() => ({
  debounced: vi.fn(),
  immediate: vi.fn(() => Promise.resolve(false))
}))

const rendererFixtures = vi.hoisted(() => ({
  ipcListeners: new Map<string, (...args: unknown[]) => unknown>()
}))

vi.mock('@/store/bufferedState', () => ({
  debouncedSendBufferedState: persistence.debounced,
  persistBufferedStateImmediately: persistence.immediate
}))

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))

vi.hoisted(() => {
  const testWindow = globalThis as unknown as {
    window?: {
      path?: {
        sep: string
        normalize: (pathname: string) => string
        basename: (pathname: string) => string
        dirname: (pathname: string) => string
        isAbsolute: (pathname: string) => boolean
        relative: (from: string, to: string) => string
      }
      fileUtils?: {
        hasMarkdownExtension: (name: string) => boolean
        isSamePathSync: (a: string, b: string) => boolean
        pathExists: (pathname: string) => Promise<boolean>
      }
      electron?: {
        process: { env: Record<string, string> }
        ipcRenderer: {
          send: (...args: unknown[]) => void
          invoke: (...args: unknown[]) => Promise<unknown>
          on: (channel: string, listener: (...args: unknown[]) => unknown) => () => void
        }
      }
      marktext?: { env: { windowId: number } }
    }
  }
  testWindow.window ??= {}
  testWindow.window.path ??= {
    sep: '/',
    normalize: (pathname) => pathname.replaceAll('\\', '/'),
    basename: (pathname) => pathname.split('/').filter(Boolean).at(-1) ?? '',
    dirname: (pathname) => pathname.slice(0, pathname.lastIndexOf('/')),
    isAbsolute: (pathname) => pathname.startsWith('/'),
    relative: (from, to) => to.startsWith(`${from}/`) ? to.slice(from.length + 1) : ''
  }
  testWindow.window.fileUtils ??= {
    hasMarkdownExtension: (name) => name.endsWith('.md'),
    isSamePathSync: (a, b) => a.replaceAll('\\', '/').toLowerCase() === b.replaceAll('\\', '/').toLowerCase(),
    pathExists: () => Promise.resolve(false)
  }
  testWindow.window.electron ??= {
    process: { env: {} },
    ipcRenderer: {
      send: () => undefined,
      invoke: () => Promise.resolve(false),
      on: (channel, listener) => {
        rendererFixtures.ipcListeners.set(channel, listener)
        return () => rendererFixtures.ipcListeners.delete(channel)
      }
    }
  }
  testWindow.window.marktext = { env: { windowId: 1 } }
})

import Watcher from 'main_renderer/filesystem/watcher'
import { useProjectStore } from '@/store/project'

interface FolderRootIdentity {
  pathname: string
  generation: number
}

interface FolderLifecycleStore {
  OPEN_PROJECT(root: FolderRootIdentity): void
  CLOSE_FOLDER(root: FolderRootIdentity): void
}

interface DirectoryWatcherCandidate {
  ready: Promise<void>
  commit(): boolean
  close(): void
}

interface ReadyAwareWatcher {
  prepareDirectory(
    win: unknown,
    pathname: string,
    root: FolderRootIdentity
  ): DirectoryWatcherCandidate
}

const watcherPreferences = {
  getItem: vi.fn(() => false),
  getPreferredEol: vi.fn(() => 'lf'),
  getAll: vi.fn(() => ({
    autoGuessEncoding: true,
    trimTrailingNewline: 2,
    autoNormalizeLineEndings: false
  }))
}

describe('directory watcher generation ownership', () => {
  beforeEach(() => {
    watcherFixtures.instances.length = 0
    vi.restoreAllMocks()
  })

  it('drops a delayed directory stat result after its Folder root is closed', async() => {
    const send = vi.fn()
    const win = { id: 7, webContents: { send } }
    const watcher = new Watcher(watcherPreferences as never)
    watcher.watch(win as never, '/old-root', 'dir', { pathname: '/old-root', generation: 1 })

    let releaseStat!: (value: { mtimeMs: number }) => void
    const statGate = new Promise<{ mtimeMs: number }>((resolve) => {
      releaseStat = resolve
    })
    vi.spyOn(fsPromises, 'stat').mockImplementationOnce(() => statGate as never)

    const change = watcherFixtures.instances[0].handlers.get('change')
    expect(change).toBeDefined()
    change?.('/old-root/late.md')
    await vi.waitFor(() => expect(fsPromises.stat).toHaveBeenCalledOnce())

    watcher.unwatch(win as never, '/old-root', 'dir')
    releaseStat({ mtimeMs: 42 })
    await Promise.resolve()
    await Promise.resolve()

    expect(send).not.toHaveBeenCalledWith('mt::update-object-tree', expect.anything())
    watcher.close()
  })

  it('keeps the committed Folder root active when a candidate errors before ready', async() => {
    const send = vi.fn()
    const win = { id: 6, webContents: { send } }
    const watcher = new Watcher(watcherPreferences as never)
    watcher.watch(win as never, '/old-root', 'dir', { pathname: '/old-root', generation: 1 })

    const candidate = (watcher as unknown as ReadyAwareWatcher).prepareDirectory(
      win,
      '/candidate-root',
      { pathname: '/candidate-root', generation: 2 }
    )
    const readyResult = candidate.ready.catch((error: unknown) => error)
    watcherFixtures.instances[1].handlers.get('error')?.(new Error('candidate unavailable'))

    await expect(readyResult).resolves.toBeInstanceOf(Error)
    expect(watcherFixtures.instances[0].close).not.toHaveBeenCalled()
    expect(watcherFixtures.instances[1].close).toHaveBeenCalledOnce()

    watcherFixtures.instances[0].handlers.get('unlink')?.('/old-root/still-active.md')
    expect(send).toHaveBeenCalledWith('mt::update-object-tree', {
      root: { pathname: '/old-root', generation: 1 },
      type: 'unlink',
      change: { pathname: '/old-root/still-active.md' }
    })
    watcher.close()
  })

  it('replaces the old Folder watcher only after async ready wins the first terminal event', async() => {
    const send = vi.fn()
    const win = { id: 10, webContents: { send } }
    const watcher = new Watcher(watcherPreferences as never)
    watcher.watch(win as never, '/old-root', 'dir', { pathname: '/old-root', generation: 1 })

    const candidate = (watcher as unknown as ReadyAwareWatcher).prepareDirectory(
      win,
      '/new-root',
      { pathname: '/new-root', generation: 2 }
    )

    expect(candidate.commit()).toBe(false)
    expect(watcherFixtures.instances[0].close).not.toHaveBeenCalled()
    watcherFixtures.instances[1].handlers.get('addDir')?.('/new-root/nested')
    expect(send).not.toHaveBeenCalledWith('mt::update-object-tree', expect.objectContaining({
      change: expect.objectContaining({ pathname: '/new-root/nested' })
    }))

    watcherFixtures.instances[1].handlers.get('ready')?.()
    await expect(candidate.ready).resolves.toBeUndefined()
    watcherFixtures.instances[1].handlers.get('error')?.(new Error('late watcher error'))

    expect(candidate.commit()).toBe(true)
    expect(watcherFixtures.instances[0].close).toHaveBeenCalledOnce()
    expect(watcherFixtures.instances[1].close).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('mt::update-object-tree', {
      root: { pathname: '/new-root', generation: 2 },
      type: 'addDir',
      change: expect.objectContaining({ pathname: '/new-root/nested' })
    })

    watcherFixtures.instances[0].handlers.get('unlink')?.('/old-root/late.md')
    watcherFixtures.instances[1].handlers.get('unlink')?.('/new-root/current.md')
    expect(send).not.toHaveBeenCalledWith('mt::update-object-tree', expect.objectContaining({
      change: { pathname: '/old-root/late.md' }
    }))
    expect(send).toHaveBeenCalledWith('mt::update-object-tree', {
      root: { pathname: '/new-root', generation: 2 },
      type: 'unlink',
      change: { pathname: '/new-root/current.md' }
    })
    watcher.close()
  })

  it('rejects queued callbacks from a replaced Folder root generation', () => {
    const send = vi.fn()
    const win = { id: 8, webContents: { send } }
    const watcher = new Watcher(watcherPreferences as never)
    watcher.watch(win as never, '/old-root', 'dir', { pathname: '/old-root', generation: 1 })
    watcher.watch(win as never, '/new-root', 'dir', { pathname: '/new-root', generation: 2 })

    const oldUnlink = watcherFixtures.instances[0].handlers.get('unlink')
    oldUnlink?.('/old-root/late.md')

    expect(send).not.toHaveBeenCalledWith('mt::update-object-tree', expect.anything())
    watcher.close()
  })

  it('stops only the directory watcher and preserves document file watchers', () => {
    const send = vi.fn()
    const win = { id: 9, webContents: { send } }
    const watcher = new Watcher(watcherPreferences as never)
    watcher.watch(win as never, '/root', 'dir', { pathname: '/root', generation: 1 })
    watcher.watch(win as never, '/root/open.md', 'file')

    watcher.unwatch(win as never, '/root', 'dir')

    expect(watcherFixtures.instances[0].close).toHaveBeenCalledOnce()
    expect(watcherFixtures.instances[1].close).not.toHaveBeenCalled()
    expect(Object.values(watcher.watchers).map(({ type }) => type)).toEqual(['file'])
    watcherFixtures.instances[1].handlers.get('unlink')?.('/root/open.md')
    expect(send).toHaveBeenCalledWith('mt::update-file', {
      type: 'unlink',
      change: { pathname: '/root/open.md' }
    })
    watcher.close()
  })
})

describe('renderer Folder root lifecycle', () => {
  beforeEach(() => {
    rendererFixtures.ipcListeners.clear()
    persistence.debounced.mockClear()
    persistence.immediate.mockClear()
    setActivePinia(createPinia())
  })

  it('clears root-owned state, keeps the close idempotent, and rejects old events after reopen', () => {
    const store = useProjectStore()
    const lifecycle = store as unknown as FolderLifecycleStore
    store.LISTEN_FOR_LOAD_PROJECT()
    store.LISTEN_FOR_UPDATE_PROJECT()
    const open = rendererFixtures.ipcListeners.get('mt::open-directory')
    const close = rendererFixtures.ipcListeners.get('mt::close-directory')
    const update = rendererFixtures.ipcListeners.get('mt::update-object-tree')
    expect([open, close, update]).not.toContain(undefined)

    open?.({}, { pathname: '/old-root', generation: 1 })
    store.activeItem = { pathname: '/old-root/selected.md' }
    store.createCache = { dirname: '/old-root', type: 'file' }
    store.newFileNameCache = '/old-root/new.md'
    store.renameCache = '/old-root/rename.md'
    store.clipboard = { type: 'cut', src: '/old-root/cut.md' }

    close?.({}, { pathname: '/old-root', generation: 2 })
    close?.({}, { pathname: '/old-root', generation: 2 })

    expect(store.projectTree).toBeNull()
    expect(store.activeItem).toEqual({})
    expect(store.createCache).toEqual({})
    expect(store.newFileNameCache).toBe('')
    expect(store.renameCache).toBeNull()
    expect(store.clipboard).toBeNull()
    expect(store.pendingTreeEvents).toEqual([])
    expect(persistence.immediate).toHaveBeenCalledOnce()

    open?.({}, { pathname: '/new-root', generation: 3 })
    update?.({}, {
      root: { pathname: '/old-root', generation: 1 },
      type: 'addDir',
      change: { pathname: '/old-root/late', name: 'late', isDirectory: true }
    })

    expect(store.projectTree?.pathname).toBe('/new-root')
    expect(store.projectTree?.folders).toEqual([])
    expect(store.pendingTreeEvents).toEqual([])

    lifecycle.CLOSE_FOLDER({ pathname: '/new-root', generation: 4 })
    expect(store.projectTree).toBeNull()
  })

  it('replays initial directory and file events when a ready watcher replaces an active root', () => {
    const store = useProjectStore()
    store.LISTEN_FOR_LOAD_PROJECT()
    store.LISTEN_FOR_UPDATE_PROJECT()
    const open = rendererFixtures.ipcListeners.get('mt::open-directory')
    const update = rendererFixtures.ipcListeners.get('mt::update-object-tree')

    open?.({}, { pathname: '/old-root', generation: 1 })
    update?.({}, {
      root: { pathname: '/new-root', generation: 2 },
      type: 'addDir',
      change: { pathname: '/new-root/nested' }
    })
    update?.({}, {
      root: { pathname: '/new-root', generation: 2 },
      type: 'add',
      change: {
        pathname: '/new-root/nested/inside.md',
        name: 'inside.md',
        isDirectory: false,
        isFile: true,
        isMarkdown: true
      }
    })

    expect(store.projectTree?.pathname).toBe('/old-root')
    expect(store.projectTree?.folders).toEqual([])
    expect(store.pendingTreeEvents).toHaveLength(2)

    open?.({}, { pathname: '/new-root', generation: 2 })

    expect(store.pendingTreeEvents).toEqual([])
    expect(store.projectTree?.pathname).toBe('/new-root')
    expect(store.projectTree?.folders).toHaveLength(1)
    expect(store.projectTree?.folders[0]).toMatchObject({
      pathname: '/new-root/nested',
      files: [expect.objectContaining({
        pathname: '/new-root/nested/inside.md',
        name: 'inside.md'
      })]
    })
  })

  it('keeps failed replacement events derived and clears them on a later generation', () => {
    const store = useProjectStore()
    store.LISTEN_FOR_LOAD_PROJECT()
    store.LISTEN_FOR_UPDATE_PROJECT()
    const open = rendererFixtures.ipcListeners.get('mt::open-directory')
    const update = rendererFixtures.ipcListeners.get('mt::update-object-tree')

    open?.({}, { pathname: '/old-root', generation: 1 })
    update?.({}, {
      root: { pathname: '/failed-root', generation: 2 },
      type: 'addDir',
      change: { pathname: '/failed-root/must-not-appear' }
    })
    update?.({}, {
      root: { pathname: '/old-root', generation: 1 },
      type: 'addDir',
      change: { pathname: '/old-root/still-current' }
    })

    expect(store.projectTree?.pathname).toBe('/old-root')
    expect(store.projectTree?.folders.map(({ name }) => name)).toEqual(['still-current'])
    expect(store.pendingTreeEvents).toHaveLength(1)

    update?.({}, {
      root: { pathname: '/final-root', generation: 3 },
      type: 'addDir',
      change: { pathname: '/final-root/complete' }
    })
    open?.({}, { pathname: '/final-root', generation: 3 })

    expect(store.pendingTreeEvents).toEqual([])
    expect(store.projectTree?.pathname).toBe('/final-root')
    expect(store.projectTree?.folders.map(({ name }) => name)).toEqual(['complete'])
  })
})
