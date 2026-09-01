import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceTabMenuItems,
  type WorkspaceTabMenuActions,
  type WorkspaceTabMenuTarget
} from '@/contextMenu/tabs'
import bus from '@/bus'

const normalizeTestPath = (pathname: string): string => {
  const normalized = pathname.replace(/\\/g, '/').replace(/\/+/g, '/')
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized
}
const testWindow = globalThis as unknown as {
  window: {
    path: { dirname(pathname: string): string; normalize(pathname: string): string }
    fileUtils: { isSamePathSync(pathA: string, pathB: string): boolean }
  }
}
testWindow.window.path = {
  dirname: (pathname) => {
    const normalized = normalizeTestPath(pathname)
    const separator = normalized.lastIndexOf('/')
    return separator === 0 ? '/' : normalized.slice(0, separator)
  },
  normalize: normalizeTestPath
}
testWindow.window.fileUtils = {
  isSamePathSync: (pathA, pathB) =>
    normalizeTestPath(pathA).toLowerCase() === normalizeTestPath(pathB).toLowerCase()
}

const target = (overrides: Partial<WorkspaceTabMenuTarget> = {}): WorkspaceTabMenuTarget => ({
  paneId: 'left',
  viewId: 'view-1',
  documentId: 'document-1',
  ...overrides
})

describe('workspace tab context menu', () => {
  const createActions = (): WorkspaceTabMenuActions => ({
    activate: vi.fn(async() => ({ status: 'applied' as const, workspaceRevision: 1 })),
    move: vi.fn(),
    open: vi.fn(),
    splitRight: vi.fn(),
    openFolder: vi.fn(),
    closeFolder: vi.fn()
  })
  it('places the close, Folder, path, and workspace groups in the accepted order', () => {
    const actions = createActions()
    const items = createWorkspaceTabMenuItems(target({ fileKey: '/note.md' }), actions)

    expect(items.map((item) => (item.type === 'separator' ? 'separator' : item.id))).toEqual([
      'closeThisTab',
      'closeOtherTabs',
      'closeSavedTabs',
      'closeAllTabs',
      'separator',
      'openThisFolder',
      'separator',
      'renameFile',
      'copyPath',
      'showInFolder',
      'separator',
      'moveTabToNewWindow',
      'openTabInNewWindow',
      'splitTabRight'
    ])
    expect(items.slice(-3).every((item) => !item.submenu)).toBe(true)
    expect(items.map((item) => item.id)).not.toContain('splitTabLeft')
  })

  it('disables Open for an untitled tab but keeps Move and Split Right available', () => {
    const actions = createActions()
    const items = createWorkspaceTabMenuItems(target(), actions)

    expect(items.find((item) => item.id === 'moveTabToNewWindow')?.enabled).not.toBe(false)
    expect(items.find((item) => item.id === 'openTabInNewWindow')?.enabled).toBe(false)
    expect(items.find((item) => item.id === 'openThisFolder')?.enabled).toBe(false)
    expect(items.find((item) => item.id === 'splitTabRight')?.enabled).not.toBe(false)
  })

  it('labels dirty Open as a disk copy and routes every action to the clicked pane/view', async() => {
    const actions: WorkspaceTabMenuActions = {
      activate: vi.fn(async() => ({ status: 'applied' as const, workspaceRevision: 1 })),
      move: vi.fn(),
      open: vi.fn(),
      splitRight: vi.fn(),
      openFolder: vi.fn(),
      closeFolder: vi.fn()
    }
    const clicked = target({
      paneId: 'right',
      viewId: 'view-2',
      documentId: 'document-2',
      fileKey: '/note.md',
      dirty: true
    })
    const items = createWorkspaceTabMenuItems(clicked, actions)

    expect(items.find((item) => item.id === 'openTabInNewWindow')?.label).toContain('disk copy')
    for (const item of items.slice(-3)) await item.click?.({}, null)
    expect(actions.move).toHaveBeenCalledWith(clicked)
    expect(actions.open).toHaveBeenCalledWith(clicked)
    expect(actions.splitRight).toHaveBeenCalledWith(clicked)
  })

  it('activates the clicked pane before legacy tab actions and retains batch semantics', async() => {
    const activate = vi.fn(async() => ({ status: 'applied' as const, workspaceRevision: 1 }))
    const actions: WorkspaceTabMenuActions = {
      activate,
      move: vi.fn(),
      open: vi.fn(),
      splitRight: vi.fn(),
      openFolder: vi.fn(),
      closeFolder: vi.fn()
    }
    const emit = vi.spyOn(bus, 'emit')
    const clicked = target({
      paneId: 'right',
      viewId: 'right-view',
      documentId: 'right-document',
      fileKey: '/right.md'
    })
    const items = createWorkspaceTabMenuItems(clicked, actions)

    await items.find((item) => item.id === 'closeThisTab')?.click?.({}, null)
    await items.find((item) => item.id === 'closeOtherTabs')?.click?.({}, null)
    await items.find((item) => item.id === 'renameFile')?.click?.({}, null)
    await items.find((item) => item.id === 'copyPath')?.click?.({}, null)
    await items.find((item) => item.id === 'showInFolder')?.click?.({}, null)
    await items.find((item) => item.id === 'closeSavedTabs')?.click?.({}, null)
    await items.find((item) => item.id === 'closeAllTabs')?.click?.({}, null)

    expect(activate).toHaveBeenCalledTimes(7)
    expect(activate).toHaveBeenCalledWith(clicked)
    expect(emit).toHaveBeenCalledWith('TABS::close-this', 'right-document')
    expect(emit).toHaveBeenCalledWith('TABS::close-others', 'right-document')
    expect(emit).toHaveBeenCalledWith('TABS::rename', 'right-document')
    expect(emit).toHaveBeenCalledWith('TABS::copy-path', 'right-document')
    expect(emit).toHaveBeenCalledWith('TABS::show-in-folder', 'right-document')
    expect(emit).toHaveBeenCalledWith('TABS::close-saved')
    expect(emit).toHaveBeenCalledWith('TABS::close-all')
    emit.mockRestore()
  })

  it('fails closed when the clicked tab can no longer be activated', async() => {
    const activate = vi.fn(async() => ({
      status: 'rejected' as const,
      reason: 'missing pane view'
    }))
    const actions: WorkspaceTabMenuActions = {
      activate,
      move: vi.fn(),
      open: vi.fn(),
      splitRight: vi.fn(),
      openFolder: vi.fn(),
      closeFolder: vi.fn()
    }
    const emit = vi.spyOn(bus, 'emit')
    const items = createWorkspaceTabMenuItems(target({ fileKey: '/gone.md' }), actions)

    await items.find((item) => item.id === 'closeThisTab')?.click?.({}, null)
    await items.find((item) => item.id === 'closeSavedTabs')?.click?.({}, null)

    expect(activate).toHaveBeenCalledTimes(2)
    expect(emit).not.toHaveBeenCalled()
    emit.mockRestore()
  })

  it('selects Close only for an equivalent normalized parent and captures the clicked target', async() => {
    const actions = createActions()
    const clicked = target({
      paneId: 'right',
      viewId: 'right-view',
      documentId: 'right-document',
      fileKey: 'C:\\Users\\Writer\\Notes\\same.md',
      folderRoot: 'c:/users/writer/notes/'
    })
    const items = createWorkspaceTabMenuItems(clicked, actions)
    const folder = items.find((item) => item.id === 'closeThisFolder')

    expect(folder?.enabled).toBe(true)
    await folder?.click?.({}, null)
    expect(actions.activate).toHaveBeenCalledWith(clicked)
    expect(actions.closeFolder).toHaveBeenCalledWith(clicked)
    expect(actions.openFolder).not.toHaveBeenCalled()
  })

  it('opens the captured parent when it differs from the Folder root', async() => {
    const actions = createActions()
    const clicked = target({
      fileKey: '/workspace/nested/note.md',
      folderRoot: '/workspace'
    })
    const items = createWorkspaceTabMenuItems(clicked, actions)
    const folder = items.find((item) => item.id === 'openThisFolder')

    await folder?.click?.({}, null)
    expect(actions.openFolder).toHaveBeenCalledWith(clicked, '/workspace/nested')
    expect(actions.closeFolder).not.toHaveBeenCalled()
  })

  it('provides every workspace menu and command string in the desktop locales', () => {
    const locales = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'tr', 'zh-CN', 'zh-TW']
    for (const locale of locales) {
      const messages = JSON.parse(
        readFileSync(resolve(process.cwd(), `static/locales/${locale}.json`), 'utf8')
      )
      expect(messages.contextMenu.tabs).toMatchObject({
        openThisFolder: expect.any(String),
        closeThisFolder: expect.any(String),
        moveToNewWindow: expect.any(String),
        openInNewWindow: expect.any(String),
        openDiskCopyInNewWindow: expect.any(String),
        splitRight: expect.any(String)
      })
      expect(messages.commands.workspace).toMatchObject({
        moveToNewWindow: expect.any(String),
        openInNewWindow: expect.any(String),
        splitRight: expect.any(String)
      })
    }
  })
})
