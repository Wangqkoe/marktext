import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  addFile,
  unlinkFile,
  addDirectory,
  unlinkDirectory,
  resortTree,
  updateFileMtime
} from './treeCtrl'
import { usePreferencesStore } from './preferences'
import bus from '../bus'
import { create, paste, rename, type FileCreateType, type PasteOptions } from '../util/fileSystem'
import { PATH_SEPARATOR } from '../config'
import notice from '../services/notification'
import { getFileStateFromData } from './help'
import { useLayoutStore } from './layout'
import { useEditorStore } from './editor'
import { debouncedSendBufferedState, persistBufferedStateImmediately } from './bufferedState'
import type { TreeNode } from '../components/sideBar/types'
import type { FileChangeDetail } from '@shared/types/files'
import type { FolderRootIdentity, FolderTreeChangePayload } from '@shared/types/ipc'

type ProjectTree = TreeNode
type TreeChange = FileChangeDetail

const normalizeProjectRoot = (pathname: string | null | undefined): string => {
  return pathname ? window.path.normalize(pathname) : ''
}

const createProjectRoot = (pathname: string): ProjectTree | null => {
  const normalizedPathname = normalizeProjectRoot(pathname)
  if (!normalizedPathname) return null

  let name = window.path.basename(normalizedPathname)
  if (!name) {
    // Root directory such as "/" or "C:\"
    name = normalizedPathname
  }

  return {
    pathname: normalizedPathname,
    name,
    isDirectory: true,
    isFile: false,
    isMarkdown: false,
    folders: [],
    files: []
  }
}

interface BufferedProjectState {
  rootDirectory: string
}

const createBufferedProjectState = (state: unknown): BufferedProjectState => {
  const s = (state || {}) as { rootDirectory?: string; projectTree?: { pathname?: string } }
  return {
    rootDirectory: normalizeProjectRoot(s.rootDirectory || s.projectTree?.pathname)
  }
}

interface OpenProjectOptions {
  revealLayout?: boolean
  scheduleBufferUpdate?: boolean
}

interface CreateCacheEntry {
  dirname: string
  type: 'file' | 'directory' | string
}

interface ClipboardEntry {
  type: 'copy' | 'cut' | string
  src: string
  dest?: string
}

interface PendingEvent {
  root: FolderRootIdentity
  type: string
  change: TreeChange
}

export const useProjectStore = defineStore('project', () => {
  // Heterogeneous UI state: assigned file nodes, folder nodes, and the empty
  // "no selection" object/null across sidebar components; a single non-`any`
  // union breaks both the assignments and the field reads, so it stays a hatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeItem = ref<any>({})
  const createCache = ref<CreateCacheEntry | Record<string, never>>({})
  const newFileNameCache = ref<string>('')
  const renameCache = ref<string | null>(null)
  const clipboard = ref<ClipboardEntry | null>(null)
  const projectTree = ref<ProjectTree | null>(null)
  const pendingTreeEvents = ref<PendingEvent[]>([])
  const folderRootIdentity = ref<FolderRootIdentity | null>(null)
  const folderRootGeneration = ref(0)

  const preferencesStore = usePreferencesStore()

  watch(
    [() => preferencesStore.fileSortBy, () => preferencesStore.fileSortOrder],
    ([sortBy, sortOrder]) => {
      if (projectTree.value) {
        resortTree(projectTree.value, String(sortBy), String(sortOrder))
      }
    }
  )

  const normalizeRootIdentity = (
    root: string | FolderRootIdentity
  ): FolderRootIdentity | null => {
    const pathname = normalizeProjectRoot(typeof root === 'string' ? root : root.pathname)
    if (!pathname) return null
    if (
      typeof root !== 'string' &&
      (!Number.isSafeInteger(root.generation) || root.generation < 0)
    ) {
      return null
    }
    return {
      pathname,
      generation: typeof root === 'string'
        ? folderRootGeneration.value + 1
        : Math.max(0, Math.trunc(root.generation))
    }
  }

  const isSameRoot = (a: FolderRootIdentity, b: FolderRootIdentity): boolean =>
    a.generation === b.generation && window.fileUtils.isSamePathSync(a.pathname, b.pathname)

  const clearRootOwnedState = (): void => {
    activeItem.value = {}
    createCache.value = {}
    newFileNameCache.value = ''
    renameCache.value = null
    clipboard.value = null
    projectTree.value = null
    pendingTreeEvents.value = []
  }

  function OPEN_PROJECT(
    root: string | FolderRootIdentity,
    { revealLayout = true, scheduleBufferUpdate = true }: OpenProjectOptions = {}
  ): void {
    const layoutStore = useLayoutStore()
    const identity = normalizeRootIdentity(root)
    if (!identity || identity.generation < folderRootGeneration.value) return
    const tree = createProjectRoot(identity.pathname)
    if (!tree) return

    const queuedEvents = pendingTreeEvents.value.filter((event) => isSameRoot(event.root, identity))
    clearRootOwnedState()
    folderRootGeneration.value = identity.generation
    folderRootIdentity.value = identity
    projectTree.value = tree

    if (revealLayout) {
      layoutStore.openProjectLayout({ scheduleBufferUpdate })
    }

    // Process pending events that arrived before projectTree was initialized.
    for (const event of queuedEvents) {
      _processTreeEvent(event.type, event.change)
    }

    if (scheduleBufferUpdate) {
      debouncedSendBufferedState()
    }
  }

  function CLOSE_FOLDER(root: FolderRootIdentity): void {
    const identity = normalizeRootIdentity(root)
    if (!identity || identity.generation < folderRootGeneration.value) return
    if (
      identity.generation === folderRootGeneration.value &&
      !folderRootIdentity.value &&
      !projectTree.value
    ) {
      return
    }

    folderRootGeneration.value = identity.generation
    folderRootIdentity.value = null
    clearRootOwnedState()
    useLayoutStore().closeFolderLayout({ scheduleBufferUpdate: false })
    persistBufferedStateImmediately().catch((err) => {
      console.error('Failed to persist closed Folder root', err)
    })
  }

  function CREATE_BUFFERED_STATE(): BufferedProjectState {
    return createBufferedProjectState({
      projectTree: projectTree.value
    })
  }

  function RESTORE_BUFFERED_STATE(state: unknown): void {
    const { rootDirectory } = createBufferedProjectState(state)
    if (rootDirectory) {
      if (projectTree.value?.pathname === rootDirectory) return
      OPEN_PROJECT(rootDirectory, { revealLayout: false, scheduleBufferUpdate: false })
    } else {
      folderRootIdentity.value = null
      clearRootOwnedState()
    }
  }

  function LISTEN_FOR_LOAD_PROJECT(): void {
    window.electron.ipcRenderer.on('mt::open-directory', (_e, root) => {
      OPEN_PROJECT(root)
    })
    window.electron.ipcRenderer.on('mt::close-directory', (_e, root) => {
      CLOSE_FOLDER(root)
    })
  }

  function LISTEN_FOR_UPDATE_PROJECT(): void {
    window.electron.ipcRenderer.on('mt::update-object-tree', (_e, payload) => {
      const { root, type, change } = (payload as FolderTreeChangePayload) ?? {}
      const identity = root && normalizeRootIdentity(root)
      if (!identity || identity.generation < folderRootGeneration.value) return

      const currentRoot = folderRootIdentity.value
      if (!currentRoot || !projectTree.value) {
        if (identity.generation > folderRootGeneration.value) {
          pendingTreeEvents.value.push({ root: identity, type, change })
        }
        return
      }
      if (!isSameRoot(currentRoot, identity)) return
      _processTreeEvent(type, change)
    })
  }

  function _processTreeEvent(type: string, change: TreeChange): void {
    const editorStore = useEditorStore()
    switch (type) {
      case 'add': {
        const { pathname, data, isMarkdown } = change
        addFile(
          projectTree.value!,
          change as Parameters<typeof addFile>[1],
          String(preferencesStore.fileSortBy),
          String(preferencesStore.fileSortOrder)
        )
        if (isMarkdown && newFileNameCache.value && pathname === newFileNameCache.value) {
          const fileState = getFileStateFromData(data as Record<string, unknown>)
          editorStore.UPDATE_CURRENT_FILE(fileState)
          newFileNameCache.value = ''
        }
        break
      }
      case 'unlink':
        unlinkFile(projectTree.value!, change)
        editorStore.SET_SAVE_STATUS_WHEN_REMOVE(change)
        break
      case 'addDir':
        addDirectory(projectTree.value!, change)
        break
      case 'unlinkDir':
        unlinkDirectory(projectTree.value!, change)
        break
      case 'change':
        if (change?.mtimeMs !== undefined) {
          updateFileMtime(
            projectTree.value!,
            change as Parameters<typeof updateFileMtime>[1],
            String(preferencesStore.fileSortBy),
            String(preferencesStore.fileSortOrder)
          )
        }
        break
      default:
        if (window.electron?.process?.env?.NODE_ENV === 'development') {
          console.log(`Unknown directory watch type: "${type}"`)
        }
        break
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function CHANGE_ACTIVE_ITEM(item: any): void {
    activeItem.value = item
  }

  function CHANGE_CLIPBOARD(data: ClipboardEntry | null): void {
    clipboard.value = data
  }

  function ASK_FOR_OPEN_PROJECT(): void {
    window.electron.ipcRenderer.send('mt::ask-for-open-project-in-sidebar')
  }

  function LISTEN_FOR_SIDEBAR_CONTEXT_MENU(): void {
    bus.on('SIDEBAR::show-in-folder', () => {
      const { pathname } = activeItem.value
      window.electron.shell.showItemInFolder(pathname)
    })
    bus.on('SIDEBAR::new', (type: unknown) => {
      const { pathname, isDirectory } = activeItem.value
      const dirname = isDirectory ? pathname : window.path.dirname(pathname)
      createCache.value = { dirname, type: String(type) }
      bus.emit('SIDEBAR::show-new-input')
    })
    bus.on('SIDEBAR::remove', () => {
      const { pathname } = activeItem.value
      window.electron.ipcRenderer.invoke('mt::fs-trash-item', pathname).catch((err) => {
        notice.notify({
          title: 'Error while deleting',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
    })
    bus.on('SIDEBAR::copy-cut', (type: unknown) => {
      const { pathname: src } = activeItem.value
      clipboard.value = { type: String(type), src }
    })
    bus.on('SIDEBAR::paste', () => {
      const cb = clipboard.value
      const { pathname, isDirectory } = activeItem.value
      const dirname = isDirectory ? pathname : window.path.dirname(pathname)
      if (cb && cb.src) {
        cb.dest = dirname + PATH_SEPARATOR + window.path.basename(cb.src)

        if (window.path.normalize(cb.src) === window.path.normalize(cb.dest)) {
          notice.notify({
            title: 'Paste Forbidden',
            type: 'warning',
            message: 'Source and destination must not be the same.'
          })
          return
        }

        paste(cb as PasteOptions)
          .then(() => {
            clipboard.value = null
          })
          .catch((err) => {
            notice.notify({
              title: 'Error while pasting',
              type: 'error',
              message: err instanceof Error ? err.message : String(err)
            })
          })
      }
    })
    bus.on('SIDEBAR::rename', () => {
      const { pathname } = activeItem.value
      renameCache.value = pathname
      bus.emit('SIDEBAR::show-rename-input')
    })
  }

  async function CREATE_FILE_DIRECTORY(name: string): Promise<void> {
    const cache = createCache.value as CreateCacheEntry
    const { dirname, type } = cache

    if (type === 'file' && !window.fileUtils.hasMarkdownExtension(name)) {
      name += '.md'
    }

    const fullName = `${dirname}/${name}`

    // Creating over an existing path would silently overwrite it (outputFile
    // truncates). Refuse instead of destroying the existing file (#1946).
    if (await window.fileUtils.pathExists(fullName)) {
      createCache.value = {}
      notice.notify({
        title: 'Error in Side Bar',
        type: 'error',
        message: `A ${type} named "${name}" already exists in this folder.`
      })
      return
    }

    create(fullName, type as FileCreateType)
      .then(() => {
        createCache.value = {}
        if (type === 'file') {
          newFileNameCache.value = fullName
        }
      })
      .catch((err) => {
        notice.notify({
          title: 'Error in Side Bar',
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
      })
  }

  function RENAME_IN_SIDEBAR(name: string): void {
    const editorStore = useEditorStore()
    const src = renameCache.value
    if (!src) return
    const dirname = window.path.dirname(src)
    const dest = dirname + PATH_SEPARATOR + name
    rename(src, dest).then(() => {
      editorStore.RENAME_IF_NEEDED({ src, dest })
    })
  }

  function OPEN_SETTING_WINDOW(): void {
    window.electron.ipcRenderer.send('mt::open-setting-window')
  }

  return {
    activeItem,
    createCache,
    newFileNameCache,
    renameCache,
    clipboard,
    projectTree,
    pendingTreeEvents,
    folderRootIdentity,
    OPEN_PROJECT,
    CLOSE_FOLDER,
    CREATE_BUFFERED_STATE,
    RESTORE_BUFFERED_STATE,
    LISTEN_FOR_LOAD_PROJECT,
    LISTEN_FOR_UPDATE_PROJECT,
    CHANGE_ACTIVE_ITEM,
    CHANGE_CLIPBOARD,
    ASK_FOR_OPEN_PROJECT,
    LISTEN_FOR_SIDEBAR_CONTEXT_MENU,
    CREATE_FILE_DIRECTORY,
    RENAME_IN_SIDEBAR,
    OPEN_SETTING_WINDOW
  }
})
