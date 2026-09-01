import {
  SEPARATOR,
  getCloseThis,
  getCloseOthers,
  getCloseSaved,
  getCloseAll,
  getOpenThisFolder,
  getCloseThisFolder,
  getRENAME,
  getCopyPath,
  getShowInFolder
} from './menuItems'
import { popupContextMenu } from '../popupMenu'
import type { ContextMenuItem } from '../popupMenu'
import { t } from '../../i18n'
import type { WorkspaceResult } from '@shared/workspace'
import type { FolderRootIdentity } from '@shared/types/ipc'
import { resolveFolderMenuTarget } from './folderTarget'

type MenuItemShape = {
  type?: string
  click?: (...args: unknown[]) => void
  enabled?: boolean
  [key: string]: unknown
}

const wrapClick = (item: MenuItemShape, tabId: string): MenuItemShape => {
  if (!item || item.type === 'separator') return item
  const click = item.click
  return {
    ...item,
    click: click ? () => click({ _tabId: tabId }, null) : undefined
  }
}

interface ContextMenuClickEvent {
  clientX: number
  clientY: number
}

interface TabLike {
  id: string
  pathname?: string | null
}

export interface WorkspaceTabMenuTarget {
  readonly paneId: 'left' | 'right'
  readonly viewId: string
  readonly documentId: string
  readonly fileKey?: string
  readonly dirty?: boolean
  readonly folderRoot?: FolderRootIdentity
}

export interface WorkspaceTabMenuActions {
  activate(target: WorkspaceTabMenuTarget): Promise<WorkspaceResult>
  move(target: WorkspaceTabMenuTarget): void | Promise<unknown>
  open(target: WorkspaceTabMenuTarget): void | Promise<unknown>
  splitRight(target: WorkspaceTabMenuTarget): void | Promise<unknown>
  openFolder(target: WorkspaceTabMenuTarget, directoryPath: string): void | Promise<unknown>
  closeFolder(target: WorkspaceTabMenuTarget): void | Promise<unknown>
}

export interface WorkspaceTabMenuWorkspace {
  readonly target: WorkspaceTabMenuTarget
  readonly actions: WorkspaceTabMenuActions
}

export type WorkspaceTabMenuResolver = (
  documentId: string,
  folderRoot?: FolderRootIdentity
) => WorkspaceTabMenuWorkspace | undefined

let workspaceTabMenuResolver: WorkspaceTabMenuResolver | undefined

export const registerWorkspaceTabMenuResolver = (
  resolver: WorkspaceTabMenuResolver
): (() => void) => {
  workspaceTabMenuResolver = resolver
  return () => {
    if (workspaceTabMenuResolver === resolver) workspaceTabMenuResolver = undefined
  }
}

export const resolveWorkspaceTabMenu = (
  documentId: string,
  folderRoot?: FolderRootIdentity
): WorkspaceTabMenuWorkspace | undefined => workspaceTabMenuResolver?.(documentId, folderRoot)

const workspaceItem = (
  id: string,
  label: string,
  enabled: boolean,
  click: () => void | Promise<unknown>
): MenuItemShape => ({ id, label, enabled, click })

const wrapWorkspaceClick = (
  item: MenuItemShape,
  target: WorkspaceTabMenuTarget,
  actions: WorkspaceTabMenuActions,
  includeTabId = true
): MenuItemShape => {
  if (!item || item.type === 'separator') return item
  const click = item.click
  return {
    ...item,
    click: async() => {
      let activated: WorkspaceResult
      try {
        activated = await actions.activate(target)
      } catch {
        return
      }
      if (activated.status !== 'applied') return
      if (click) click(includeTabId ? { _tabId: target.documentId } : {}, null)
    }
  }
}

/**
 * Builds the tab menu with a captured pane/view target.  The callbacks never
 * consult the legacy currentFile; callers receive the tab the user clicked.
 */
export const createWorkspaceTabMenuItems = (
  target: WorkspaceTabMenuTarget,
  actions: WorkspaceTabMenuActions
): MenuItemShape[] => {
  const pathname = target.fileKey
  const closeThis = getCloseThis()
  const closeOthers = getCloseOthers()
  const closeSaved = getCloseSaved()
  const closeAll = getCloseAll()
  const folderTarget = resolveFolderMenuTarget(pathname, target.folderRoot?.pathname)
  const folder = (
    folderTarget.kind === 'close' ? getCloseThisFolder() : getOpenThisFolder()
  ) as MenuItemShape
  const rename = getRENAME()
  const copyPath = getCopyPath()
  const showInFolder = getShowInFolder()

  folder.enabled = folderTarget.enabled
  folder.click = () =>
    folderTarget.kind === 'close'
      ? actions.closeFolder(target)
      : folderTarget.directoryPath && actions.openFolder(target, folderTarget.directoryPath)
  ;([rename, copyPath, showInFolder] as MenuItemShape[]).forEach((item) => {
    item.enabled = !!pathname
  })

  return [
    closeThis as MenuItemShape,
    closeOthers as MenuItemShape,
    closeSaved as MenuItemShape,
    closeAll as MenuItemShape,
    SEPARATOR,
    folder as MenuItemShape,
    SEPARATOR,
    rename as MenuItemShape,
    copyPath as MenuItemShape,
    showInFolder as MenuItemShape,
    SEPARATOR,
    workspaceItem('moveTabToNewWindow', t('contextMenu.tabs.moveToNewWindow'), true, () =>
      actions.move(target)
    ),
    workspaceItem(
      'openTabInNewWindow',
      t(
        target.dirty
          ? 'contextMenu.tabs.openDiskCopyInNewWindow'
          : 'contextMenu.tabs.openInNewWindow'
      ),
      !!pathname,
      () => actions.open(target)
    ),
    workspaceItem('splitTabRight', t('contextMenu.tabs.splitRight'), true, () =>
      actions.splitRight(target)
    )
  ].map((item) =>
    wrapWorkspaceClick(
      item as MenuItemShape,
      target,
      actions,
      item !== closeSaved && item !== closeAll
    )
  )
}

export const showContextMenu = (
  event: ContextMenuClickEvent,
  tab: TabLike,
  workspace?: WorkspaceTabMenuWorkspace
): void => {
  if (workspace) {
    popupContextMenu(
      createWorkspaceTabMenuItems(workspace.target, workspace.actions) as ContextMenuItem[],
      {
        x: event.clientX,
        y: event.clientY
      }
    )
    return
  }
  const { pathname } = tab
  const closeThis = getCloseThis()
  const closeOthers = getCloseOthers()
  const closeSaved = getCloseSaved()
  const closeAll = getCloseAll()
  const rename = getRENAME()
  const copyPath = getCopyPath()
  const showInFolder = getShowInFolder()

  ;([rename, copyPath, showInFolder] as MenuItemShape[]).forEach((item) => {
    item.enabled = !!pathname
  })

  const items = [
    closeThis,
    closeOthers,
    closeSaved,
    closeAll,
    SEPARATOR,
    rename,
    copyPath,
    showInFolder
  ].map((item) => wrapClick(item as MenuItemShape, tab.id))

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}
