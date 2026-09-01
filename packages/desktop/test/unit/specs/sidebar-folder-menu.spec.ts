import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n', () => ({ t: (key: string) => key }))
vi.mock('@/contextMenu/sideBar/actions', () => ({
  closeFolder: vi.fn(),
  copy: vi.fn(),
  cut: vi.fn(),
  newDirectory: vi.fn(),
  newFile: vi.fn(),
  paste: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  showInFolder: vi.fn()
}))

import * as sidebarMenu from '@/contextMenu/sideBar'

interface MenuItem {
  id?: string
  type?: string
  enabled?: boolean
}

interface SidebarMenuModule {
  createSidebarContextMenuItems(kind: 'root' | 'folder' | 'file', hasClipboard: boolean): MenuItem[]
}

const menuFactory = sidebarMenu as unknown as SidebarMenuModule
const signature = (items: MenuItem[]): string[] =>
  items.map((item) => item.type === 'separator' ? 'separator' : String(item.id))

describe('Files context menu Folder-root ownership', () => {
  it('places Close Folder in the exact root-only group', () => {
    const items = menuFactory.createSidebarContextMenuItems('root', false)

    expect(signature(items).slice(0, 9)).toEqual([
      'newFileMenuItem',
      'newDirectoryMenuItem',
      'separator',
      'closeFolderMenuItem',
      'separator',
      'copyMenuItem',
      'cutMenuItem',
      'pasteMenuItem',
      'separator'
    ])
    expect(items.find(({ id }) => id === 'pasteMenuItem')?.enabled).toBe(false)
  })

  it.each(['folder', 'file'] as const)('does not expose Close Folder for a %s target', (kind) => {
    expect(signature(menuFactory.createSidebarContextMenuItems(kind, true))).not.toContain(
      'closeFolderMenuItem'
    )
  })
})
