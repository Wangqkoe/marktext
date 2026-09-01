import path from 'path'
import fsPromises from 'fs/promises'
import log from 'electron-log'
import chokidar, { type FSWatcher } from 'chokidar'
import { exists } from 'common/filesystem'
import { hasMarkdownExtension, checkPathExcludePattern } from 'common/filesystem/paths'
import { getUniqueId } from '../utils'
import { getContentHash, loadMarkdownFile } from '../filesystem/markdown'
import { isLinux, isOsx } from '../config'
import type { BrowserWindow } from 'electron'
import type { LineEnding } from '@shared/types/files'
import type { FolderRootIdentity } from '@shared/types/ipc'
import type Preference from '../preferences'

// TODO(refactor): Please see GH#1035.

export const WATCHER_STABILITY_THRESHOLD = 1000
export const WATCHER_STABILITY_POLL_INTERVAL = 150

const EVENT_NAME = {
  dir: 'mt::update-object-tree' as const,
  file: 'mt::update-file' as const
}

type WatchType = 'dir' | 'file'

interface IgnoreEntry {
  windowId: number
  pathname: string
  contentHash: string
  duration: number
  start: Date
}

interface WatcherEntry {
  win: BrowserWindow
  watcher: FSWatcher
  pathname: string
  type: WatchType
  root: FolderRootIdentity | null
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
  win: BrowserWindow,
  pathname: string,
  type: WatchType,
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
    } catch (err) {
      // Only notify user about opened files.
      if (type === 'file') {
        win.webContents.send('mt::show-notification', {
          title: 'Watcher I/O error',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
        return
      }
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

const change = async(
  win: BrowserWindow,
  pathname: string,
  type: WatchType,
  endOfLine: LineEnding,
  autoGuessEncoding: boolean,
  trimTrailingNewline: number,
  autoNormalizeLineEndings: boolean,
  sendEvent: WatcherEventSender
): Promise<void> => {
  if (type === 'dir') {
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
    return
  }

  const isMarkdown = hasMarkdownExtension(pathname)
  if (isMarkdown) {
    try {
      const [data, stats] = await Promise.all([
        loadMarkdownFile(pathname, endOfLine, autoGuessEncoding, trimTrailingNewline, autoNormalizeLineEndings),
        fsPromises.stat(pathname)
      ])
      const file = { pathname, data, mtimeMs: stats.mtimeMs }
      sendEvent({
        type: 'change',
        change: file
      })
    } catch (err) {
      if (type === 'file') {
        win.webContents.send('mt::show-notification', {
          title: 'Watcher I/O error',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }
}

const addDir = (pathname: string, type: WatchType, sendEvent: WatcherEventSender): void => {
  if (type === 'file') return

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

const unlinkDir = (pathname: string, type: WatchType, sendEvent: WatcherEventSender): void => {
  if (type === 'file') return

  const directory = { pathname }
  sendEvent({
    type: 'unlinkDir',
    change: directory
  })
}

class Watcher {
  private _preferences: Preference
  private _ignoreChangeEvents: IgnoreEntry[]
  private _pendingFileEventChecks: Map<string, Promise<void>>
  private _activeDirectoryRoots: Map<number, FolderRootIdentity>
  watchers: Record<string, WatcherEntry>

  constructor(preferences: Preference) {
    this._preferences = preferences
    this._ignoreChangeEvents = []
    this._pendingFileEventChecks = new Map()
    this._activeDirectoryRoots = new Map()
    this.watchers = {}
  }

  watch(
    win: BrowserWindow,
    watchPath: string,
    type: WatchType = 'dir',
    rootIdentity?: FolderRootIdentity
  ): () => void {
    return this._watch(win, watchPath, type, rootIdentity, false).close
  }

  prepareDirectory(
    win: BrowserWindow,
    watchPath: string,
    rootIdentity: FolderRootIdentity
  ): DirectoryWatcherCandidate {
    return this._watch(win, watchPath, 'dir', rootIdentity, true)
  }

  private _watch(
    win: BrowserWindow,
    watchPath: string,
    type: WatchType,
    rootIdentity: FolderRootIdentity | undefined,
    waitForDirectoryReady: boolean
  ): DirectoryWatcherCandidate {
    const usePolling = isOsx ? true : this._preferences.getItem<boolean>('watcherUsePolling')

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
      ignoreInitial: type === 'file',
      persistent: true,
      ignorePermissionErrors: true,

      depth: type === 'file' ? (isOsx ? 1 : 0) : undefined,

      // Defer events until writes settle only for the file watcher, which
      // reloads file CONTENT on change and would otherwise read a partial file
      // (GH#1043). The directory watcher just lists nodes and re-sorts by mtime,
      // so deferring its `add` events only made new files appear in the sidebar
      // ~1s late (GH#3955).
      ...(type === 'file'
        ? {
          awaitWriteFinish: {
            stabilityThreshold: WATCHER_STABILITY_THRESHOLD,
            pollInterval: WATCHER_STABILITY_POLL_INTERVAL
          }
        }
        : {}),

      usePolling
      // chokidar's `ignored` callback signature varies between versions; this options
      // bag works at runtime but defies the bundled type.
    } as unknown as Parameters<typeof chokidar.watch>[1])

    let disposed = false
    let enospcReached = false
    let renameTimer: NodeJS.Timeout | null = null
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
    const root = type === 'dir'
      ? (rootIdentity ?? { pathname: watchPath, generation: 0 })
      : null
    const isCurrent = (): boolean => {
      if (disposed || !root) return !disposed
      const activeRoot = this._activeDirectoryRoots.get(win.id)
      return !!activeRoot &&
        activeRoot.generation === root.generation &&
        activeRoot.pathname === root.pathname
    }
    const sendEvent: WatcherEventSender = (payload) => {
      if (disposed) return
      if (root && waitForDirectoryReady && !committed) {
        pendingEvents.push(payload)
        return
      }
      if (!isCurrent()) return
      win.webContents.send(
        EVENT_NAME[type],
        root ? { ...payload, root } : payload
      )
    }

    watcher
      .on('add', async(pathname: string) => {
        if (!(await this._shouldIgnoreEvent(win.id, pathname, type, usePolling))) {
          const { _preferences } = this
          const eol = _preferences.getPreferredEol() as LineEnding
          const {
            autoGuessEncoding = true,
            trimTrailingNewline = 2,
            autoNormalizeLineEndings = false
          } = _preferences.getAll()
          add(
            win,
            pathname,
            type,
            eol,
            autoGuessEncoding,
            trimTrailingNewline,
            autoNormalizeLineEndings,
            sendEvent
          )
        }
      })
      .on('change', async(pathname: string) => {
        if (!(await this._shouldIgnoreEvent(win.id, pathname, type, usePolling))) {
          const { _preferences } = this
          const eol = _preferences.getPreferredEol() as LineEnding
          const {
            autoGuessEncoding = true,
            trimTrailingNewline = 2,
            autoNormalizeLineEndings = false
          } = _preferences.getAll()
          change(
            win,
            pathname,
            type,
            eol,
            autoGuessEncoding,
            trimTrailingNewline,
            autoNormalizeLineEndings,
            sendEvent
          )
        }
      })
      .on('unlink', (pathname: string) => unlink(pathname, sendEvent))
      .on('addDir', (pathname: string) => addDir(pathname, type, sendEvent))
      .on('unlinkDir', (pathname: string) => unlinkDir(pathname, type, sendEvent))
      .on('raw', (event: string, subpath: string, details: unknown) => {
        if (
          globalThis.MARKTEXT_DEBUG_VERBOSE >= 3
        ) {
          console.log('watcher: ', event, subpath, details)
        }

        // Fix atomic rename on Linux (chokidar#591).
        if (isLinux && type === 'file' && event === 'rename') {
          if (renameTimer) {
            clearTimeout(renameTimer)
          }
          renameTimer = setTimeout(async() => {
            renameTimer = null
            if (disposed) {
              return
            }

            const fileExists = await exists(watchPath)
            if (fileExists) {
              watcher.unwatch(watchPath)
              watcher.add(watchPath)
            }
          }, 150)
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
      if (root) {
        const activeRoot = this._activeDirectoryRoots.get(win.id)
        if (
          activeRoot?.generation === root.generation &&
          activeRoot.pathname === root.pathname
        ) {
          this._activeDirectoryRoots.delete(win.id)
        }
      }
      if (this.watchers[id]) {
        delete this.watchers[id]
      }
      if (renameTimer) {
        clearTimeout(renameTimer)
        renameTimer = null
      }
      pendingEvents.length = 0
      watcher.close()
    }

    const commit = (publish: () => void = () => undefined): boolean => {
      if (!root || disposed || !readyReached) return false
      if (committed) return true

      const previousRoot = this._activeDirectoryRoots.get(win.id)
      this._activeDirectoryRoots.set(win.id, root)
      const replacedEntries = Object.entries(this.watchers)
        .filter(([entryId, entry]) => (
          entryId !== id && entry.win === win && entry.type === 'dir'
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
      type,
      root,
      close: closeFn
    }
    if (root && !waitForDirectoryReady) {
      this._activeDirectoryRoots.set(win.id, root)
    }

    return { ready, commit, close: closeFn }
  }

  unwatch(win: BrowserWindow, watchPath: string, type: WatchType = 'dir'): void {
    for (const id of Object.keys(this.watchers)) {
      const w = this.watchers[id]
      if (w.win === win && w.pathname === watchPath && w.type === type) {
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
    this._ignoreChangeEvents = []
    this._pendingFileEventChecks.clear()
    this._activeDirectoryRoots.clear()
  }

  /**
   * Queue an expected changed event for content saved by MarkText. Only valid
   * for files and "add"/"change" events.
   */
  ignoreChangedEvent(
    windowId: number,
    pathname: string,
    contentHash: string,
    duration: number = WATCHER_STABILITY_THRESHOLD + WATCHER_STABILITY_POLL_INTERVAL * 2
  ): void {
    this._ignoreChangeEvents.push({ windowId, pathname, contentHash, duration, start: new Date() })
  }

  /**
   * Check whether we should ignore the current event because the file may be
   * changed from MarkText itself.
   */
  async _shouldIgnoreEvent(
    winId: number,
    pathname: string,
    type: WatchType,
    usePolling: boolean
  ): Promise<boolean> {
    if (type !== 'file') return false

    // EventEmitter does not await async listeners. Serialize checks for the
    // same open file so each event observes and consumes a consistent queue.
    const eventKey = `${winId}\0${pathname}`
    const previousCheck = this._pendingFileEventChecks.get(eventKey) ?? Promise.resolve()
    let releaseCurrentCheck!: () => void
    const currentCheck = new Promise<void>((resolve) => {
      releaseCurrentCheck = resolve
    })
    this._pendingFileEventChecks.set(eventKey, currentCheck)
    await previousCheck

    try {
      const { _ignoreChangeEvents } = this
      const currentTime = new Date()
      let currentContentHash: string | undefined
      let contentReadAttempted = false
      let fileMtimeMs: number | null | undefined
      for (let i = 0; i < _ignoreChangeEvents.length; ++i) {
        const {
          windowId,
          pathname: pathToIgnore,
          contentHash,
          start,
          duration
        } = _ignoreChangeEvents[i]
        if (windowId === winId && pathToIgnore === pathname) {
          let isOwnSaveCandidate = currentTime.getTime() - start.getTime() < duration
          let isDelayedOwnSaveCandidate = false

          // Try to catch cloud drives that emit the change event not
          // immediately or re-sync the change (GH#3044).
          if (!isOwnSaveCandidate && !usePolling) {
            if (fileMtimeMs === undefined) {
              try {
                fileMtimeMs = (await fsPromises.stat(pathname)).mtimeMs
              } catch (error) {
                fileMtimeMs = null
                console.error('Failed to "stat" file to determine modification time:', error)
              }
            }
            if (fileMtimeMs !== null && fileMtimeMs - start.getTime() < duration) {
              isOwnSaveCandidate = true
              isDelayedOwnSaveCandidate = true
            }
          }

          if (!isOwnSaveCandidate) {
            _ignoreChangeEvents.splice(i, 1)
            --i
            continue
          }

          if (!contentReadAttempted) {
            contentReadAttempted = true
            try {
              currentContentHash = getContentHash(await fsPromises.readFile(pathname))
            } catch (error) {
              console.error('Failed to read file to verify modification origin:', error)
              return false
            }
          }

          // A mismatched entry may describe an older coalesced or reordered
          // save. Keep scanning until the current disk bytes match an eligible
          // save, and retain unmatched entries for a later watcher event.
          if (currentContentHash !== contentHash) continue

          if (isDelayedOwnSaveCandidate && globalThis.MARKTEXT_DEBUG_VERBOSE >= 3) {
            console.log(
              `Ignoring file event after "stat": current="${currentTime.toISOString()}", start="${start.toISOString()}", file="${new Date(fileMtimeMs as number).toISOString()}".`
            )
          }

          // A matching newer save supersedes older queued saves for this file;
          // preserve any newer entries so out-of-order events can still match.
          for (let j = i; j >= 0; --j) {
            const entry = _ignoreChangeEvents[j]
            if (entry.windowId === winId && entry.pathname === pathname) {
              _ignoreChangeEvents.splice(j, 1)
            }
          }
          return true
        }
      }
      return false
    } finally {
      releaseCurrentCheck()
      if (this._pendingFileEventChecks.get(eventKey) === currentCheck) {
        this._pendingFileEventChecks.delete(eventKey)
      }
    }
  }
}

export default Watcher
