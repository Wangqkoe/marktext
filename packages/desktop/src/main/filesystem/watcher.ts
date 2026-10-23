import path from 'path'
import fsPromises from 'fs/promises'
import log from 'electron-log'
import chokidar, { type FSWatcher } from 'chokidar'
import { hasMarkdownExtension, checkPathExcludePattern } from 'common/filesystem/paths'
import { getUniqueId } from '../utils'
import { loadMarkdownFile } from '../filesystem/markdown'
import { isOsx } from '../config'
import type { BrowserWindow } from 'electron'
import type { LineEnding } from '@shared/types/files'
import type { FolderRootIdentity } from '@shared/types/ipc'
import type Preference from '../preferences'

// Watches Folder roots for the sidebar tree. Open documents observe their
// files through DocumentIO's FileObservationHub instead.

const TREE_EVENT = 'mt::update-object-tree'

export const isUncPath = (pathname: string): boolean =>
  /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(pathname)

interface WatcherEntry {
  win: BrowserWindow
  watcher: FSWatcher
  pathname: string
  root: FolderRootIdentity
  close: () => void
}

export interface DirectoryWatcherCandidate {
  ready: Promise<void>
  commit: (publish?: () => void) => boolean
  close: () => void
}

interface WatcherEventPayload {
  type: string
  change: { pathname: string; [key: string]: unknown }
}

type WatcherEventSender = (payload: WatcherEventPayload) => void

const add = async(
  pathname: string,
  endOfLine: LineEnding,
  autoGuessEncoding: boolean,
  trimTrailingNewline: number,
  autoNormalizeLineEndings: boolean,
  sendEvent: WatcherEventSender
): Promise<void> => {
  const stats = await fsPromises.stat(pathname)
  const birthTime = stats.birthtime
  const mtimeMs = stats.mtimeMs
  const isMarkdown = hasMarkdownExtension(pathname)
  const file: {
    pathname: string
    name: string
    isFile: boolean
    isDirectory: boolean
    birthTime: Date
    mtimeMs: number
    isMarkdown: boolean
    data?: Awaited<ReturnType<typeof loadMarkdownFile>>
  } = {
    pathname,
    name: path.basename(pathname),
    isFile: true,
    isDirectory: false,
    birthTime,
    mtimeMs,
    isMarkdown
  }
  if (isMarkdown) {
    // HACK: But this should be removed completely in #1034/#1035.
    try {
      const data = await loadMarkdownFile(
        pathname,
        endOfLine,
        autoGuessEncoding,
        trimTrailingNewline,
        autoNormalizeLineEndings
      )
      file.data = data
    } catch {
      // The tree only needs the node; a file that cannot be read is listed
      // without content.
    }
    sendEvent({
      type: 'add',
      change: file
    })
  }
}

const unlink = (pathname: string, sendEvent: WatcherEventSender): void => {
  const file = { pathname }
  sendEvent({
    type: 'unlink',
    change: file
  })
}

const change = async(pathname: string, sendEvent: WatcherEventSender): Promise<void> => {
  // Only send mtimeMs so the sidebar can re-sort; skip loading file content.
  try {
    const stats = await fsPromises.stat(pathname)
    sendEvent({
      type: 'change',
      change: { pathname, mtimeMs: stats.mtimeMs }
    })
  } catch {
    // File may have been deleted between the event and the stat; ignore.
  }
}

const addDir = (pathname: string, sendEvent: WatcherEventSender): void => {
  const directory = {
    pathname,
    name: path.basename(pathname),
    isCollapsed: true,
    isDirectory: true,
    isFile: false,
    isMarkdown: false,
    folders: [],
    files: []
  }

  sendEvent({
    type: 'addDir',
    change: directory
  })
}

const unlinkDir = (pathname: string, sendEvent: WatcherEventSender): void => {
  const directory = { pathname }
  sendEvent({
    type: 'unlinkDir',
    change: directory
  })
}

class Watcher {
  private _preferences: Preference
  private _activeDirectoryRoots: Map<number, FolderRootIdentity>
  watchers: Record<string, WatcherEntry>

  constructor(preferences: Preference) {
    this._preferences = preferences
    this._activeDirectoryRoots = new Map()
    this.watchers = {}
  }

  watch(win: BrowserWindow, watchPath: string, rootIdentity?: FolderRootIdentity): () => void {
    return this._watch(win, watchPath, rootIdentity, false).close
  }

  prepareDirectory(
    win: BrowserWindow,
    watchPath: string,
    rootIdentity: FolderRootIdentity
  ): DirectoryWatcherCandidate {
    return this._watch(win, watchPath, rootIdentity, true)
  }

  private _watch(
    win: BrowserWindow,
    watchPath: string,
    rootIdentity: FolderRootIdentity | undefined,
    waitForDirectoryReady: boolean
  ): DirectoryWatcherCandidate {
    const usePolling = isOsx || isUncPath(watchPath)
      ? true
      : this._preferences.getItem<boolean>('watcherUsePolling')

    const id = getUniqueId()

    const watcher = chokidar.watch(watchPath, {
      ignored: (pathname: string, fileInfo?: { isDirectory: () => boolean }) => {
        if (!fileInfo) {
          return /(?:^|[/\\])(?:node_modules|(?:.+\.asar))/.test(pathname)
        }

        if (/(?:^|[/\\])(?:node_modules|(?:.+\.asar))/.test(pathname)) {
          return true
        }

        if (
          checkPathExcludePattern(
            pathname,
            this._preferences.getItem<readonly string[]>('treePathExcludePatterns')
          )
        ) {
          return true
        }
        if (fileInfo.isDirectory()) {
          return false
        }
        return !hasMarkdownExtension(pathname)
      },
      ignoreInitial: false,
      persistent: true,
      ignorePermissionErrors: true,
      // No awaitWriteFinish: the tree just lists nodes and re-sorts by mtime,
      // and deferring `add` made new files appear ~1s late (GH#3955).
      usePolling
      // chokidar's `ignored` callback signature varies between versions; this options
      // bag works at runtime but defies the bundled type.
    } as unknown as Parameters<typeof chokidar.watch>[1])

    let disposed = false
    let enospcReached = false
    let readyReached = !waitForDirectoryReady
    let committed = !waitForDirectoryReady
    const pendingEvents: WatcherEventPayload[] = []
    let settleReady!: () => void
    let rejectReady!: (reason: unknown) => void
    const ready = waitForDirectoryReady
      ? new Promise<void>((resolve, reject) => {
        settleReady = resolve
        rejectReady = reject
      })
      : Promise.resolve()
    const root = rootIdentity ?? { pathname: watchPath, generation: 0 }
    const isCurrent = (): boolean => {
      if (disposed) return false
      const activeRoot = this._activeDirectoryRoots.get(win.id)
      return !!activeRoot &&
        activeRoot.generation === root.generation &&
        activeRoot.pathname === root.pathname
    }
    const sendEvent: WatcherEventSender = (payload) => {
      if (disposed) return
      if (waitForDirectoryReady && !committed) {
        pendingEvents.push(payload)
        return
      }
      if (!isCurrent()) return
      win.webContents.send(TREE_EVENT, { ...payload, root })
    }

    watcher
      .on('add', (pathname: string) => {
        const { _preferences } = this
        const eol = _preferences.getPreferredEol() as LineEnding
        const {
          autoGuessEncoding = true,
          trimTrailingNewline = 2,
          autoNormalizeLineEndings = false
        } = _preferences.getAll()
        add(
          pathname,
          eol,
          autoGuessEncoding,
          trimTrailingNewline,
          autoNormalizeLineEndings,
          sendEvent
        )
      })
      .on('change', (pathname: string) => change(pathname, sendEvent))
      .on('unlink', (pathname: string) => unlink(pathname, sendEvent))
      .on('addDir', (pathname: string) => addDir(pathname, sendEvent))
      .on('unlinkDir', (pathname: string) => unlinkDir(pathname, sendEvent))
      .on('raw', (event: string, subpath: string, details: unknown) => {
        if (
          globalThis.MARKTEXT_DEBUG_VERBOSE >= 3
        ) {
          console.log('watcher: ', event, subpath, details)
        }
      })
      .on('ready', () => {
        if (waitForDirectoryReady && !disposed && !readyReached) {
          readyReached = true
          settleReady()
        }
      })
      .on('error', (error: unknown) => {
        const code = (error as NodeJS.ErrnoException)?.code
        if (code === 'ENOSPC') {
          if (!enospcReached) {
            enospcReached = true
            log.warn('inotify limit reached: Too many file descriptors are opened.')

            win.webContents.send('mt::show-notification', {
              title: 'inotify limit reached',
              type: 'warning',
              message:
                'Cannot watch all files and file changes because too many file descriptors are opened.'
            })
          }
        } else {
          log.error('Error while watching files:', error)
        }
        if (waitForDirectoryReady && !readyReached) {
          closeFn(error)
        }
      })

    const closeFn = (reason: unknown = new Error('Directory watcher candidate closed.')): void => {
      if (disposed) return
      disposed = true
      if (waitForDirectoryReady && !readyReached) {
        rejectReady(reason)
      }
      const activeRoot = this._activeDirectoryRoots.get(win.id)
      if (
        activeRoot?.generation === root.generation &&
        activeRoot.pathname === root.pathname
      ) {
        this._activeDirectoryRoots.delete(win.id)
      }
      if (this.watchers[id]) {
        delete this.watchers[id]
      }
      pendingEvents.length = 0
      watcher.close()
    }

    const commit = (publish: () => void = () => undefined): boolean => {
      if (disposed || !readyReached) return false
      if (committed) return true

      const previousRoot = this._activeDirectoryRoots.get(win.id)
      this._activeDirectoryRoots.set(win.id, root)
      const replacedEntries = Object.entries(this.watchers)
        .filter(([entryId, entry]) => (
          entryId !== id && entry.win === win
        ))
        .map(([, entry]) => entry)
      committed = true
      try {
        pendingEvents.splice(0).forEach(sendEvent)
        publish()
      } catch (err) {
        committed = false
        if (previousRoot) {
          this._activeDirectoryRoots.set(win.id, previousRoot)
        } else {
          this._activeDirectoryRoots.delete(win.id)
        }
        log.error('Failed to commit Folder watcher candidate:', err)
        return false
      }
      replacedEntries.forEach(({ close }) => close())
      return true
    }

    this.watchers[id] = {
      win,
      watcher,
      pathname: watchPath,
      root,
      close: closeFn
    }
    if (!waitForDirectoryReady) {
      this._activeDirectoryRoots.set(win.id, root)
    }

    return { ready, commit, close: closeFn }
  }

  unwatch(win: BrowserWindow, watchPath: string): void {
    for (const id of Object.keys(this.watchers)) {
      const w = this.watchers[id]
      if (w.win === win && w.pathname === watchPath) {
        w.close()
        break
      }
    }
  }

  unwatchByWindowId(windowId: number): void {
    const entries: WatcherEntry[] = []
    for (const id of Object.keys(this.watchers)) {
      const w = this.watchers[id]
      if (w.win.id === windowId) {
        entries.push(w)
      }
    }
    entries.forEach(({ close }) => close())
  }

  close(): void {
    Object.keys(this.watchers).forEach((id) => this.watchers[id].close())
    this.watchers = {}
    this._activeDirectoryRoots.clear()
  }
}

export default Watcher
