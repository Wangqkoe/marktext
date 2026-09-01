import {
  SEPARATOR,
  getNewFile,
  getNewDirectory,
  getCloseFolder,
  getCOPY,
  getCUT,
  getPASTE,
  getRENAME,
  getDELETE,
  getShowInFolder
} from './menuItems'
import { popupContextMenu, type ContextMenuItem } from '../popupMenu'

export type SidebarContextTargetKind = 'root' | 'folder' | 'file'

export const createSidebarContextMenuItems = (
  targetKind: SidebarContextTargetKind,
  hasPathCache: boolean
): ContextMenuItem[] => {
  const createGroup: ContextMenuItem[] = [getNewFile(), getNewDirectory(), SEPARATOR]
  const rootGroup: ContextMenuItem[] = targetKind === 'root'
    ? [getCloseFolder(), SEPARATOR]
    : []
  const pathGroup: ContextMenuItem[] = [getCOPY(), getCUT(), getPASTE(), SEPARATOR]
  const contextItems: ContextMenuItem[] = [
    ...createGroup,
    ...rootGroup,
    ...pathGroup,
    getRENAME(),
    getDELETE(),
    SEPARATOR,
    getShowInFolder()
  ]

  const pasteItem = contextItems.find(({ id }) => id === 'pasteMenuItem')
  if (pasteItem) pasteItem.enabled = hasPathCache
  return contextItems
}

export const showContextMenu = (
  event: { clientX: number; clientY: number },
  hasPathCache: boolean,
  targetKind: SidebarContextTargetKind
): void => {
  const contextItems = createSidebarContextMenuItems(targetKind, hasPathCache)

  const items: ContextMenuItem[] = contextItems.map((item) => {
    if (!item || item.type === 'separator') return item
    const click = item.click
    return {
      ...item,
      click: click ? () => click(null, null) : undefined
    }
  })

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}
