import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { quit: vi.fn() } }))
vi.mock('main_renderer/config', () => ({ isOsx: false }))
vi.mock('main_renderer/i18n', () => ({ t: (key: string) => key }))
vi.mock('main_renderer/menu/actions/file', () => ({
  closeFolder: vi.fn(),
  openFolder: vi.fn()
}))
vi.mock('main_renderer/menu/actions/marktext', () => ({ userSetting: vi.fn() }))

import createFileMenu from 'main_renderer/menu/templates/file'

describe('File menu Folder-root lifecycle entry', () => {
  it('places disabled Close Folder directly after Open Folder', () => {
    const menu = createFileMenu(
      { getAccelerator: vi.fn(() => null) } as never,
      { getAll: vi.fn(() => ({ autoSave: false })) } as never,
      []
    )
    const items = menu.submenu as Electron.MenuItemConstructorOptions[]
    const openIndex = items.findIndex(({ label }) => label === 'menu.file.openFolder')

    expect(openIndex).toBeGreaterThanOrEqual(0)
    expect(items[openIndex + 1]).toMatchObject({
      id: 'closeFolderMenuItem',
      label: 'menu.file.closeFolder',
      enabled: false
    })
    expect(items[openIndex + 1]?.type).not.toBe('separator')
  })
})
