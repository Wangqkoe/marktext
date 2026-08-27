import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceTabMenuItems,
  type WorkspaceTabMenuActions,
  type WorkspaceTabMenuTarget
} from '@/contextMenu/tabs'

const target = (overrides: Partial<WorkspaceTabMenuTarget> = {}): WorkspaceTabMenuTarget => ({
  paneId: 'left',
  viewId: 'view-1',
  documentId: 'document-1',
  ...overrides
})

describe('workspace tab context menu', () => {
  it('places the flat workspace group after a divider in the accepted order', () => {
    const actions: WorkspaceTabMenuActions = { move: vi.fn(), open: vi.fn(), splitRight: vi.fn() }
    const items = createWorkspaceTabMenuItems(target({ fileKey: '/note.md' }), actions)

    expect(items.map(item => item.type === 'separator' ? 'separator' : item.id)).toEqual([
      'closeThisTab', 'closeOtherTabs', 'closeSavedTabs', 'closeAllTabs', 'separator',
      'renameFile', 'copyPath', 'showInFolder', 'separator',
      'moveTabToNewWindow', 'openTabInNewWindow', 'splitTabRight'
    ])
    expect(items.slice(-3).every(item => !item.submenu)).toBe(true)
    expect(items.map(item => item.id)).not.toContain('splitTabLeft')
  })

  it('disables Open for an untitled tab but keeps Move and Split Right available', () => {
    const actions: WorkspaceTabMenuActions = { move: vi.fn(), open: vi.fn(), splitRight: vi.fn() }
    const items = createWorkspaceTabMenuItems(target(), actions)

    expect(items.find(item => item.id === 'moveTabToNewWindow')?.enabled).not.toBe(false)
    expect(items.find(item => item.id === 'openTabInNewWindow')?.enabled).toBe(false)
    expect(items.find(item => item.id === 'splitTabRight')?.enabled).not.toBe(false)
  })

  it('labels dirty Open as a disk copy and routes every action to the clicked pane/view', async() => {
    const actions: WorkspaceTabMenuActions = {
      move: vi.fn(),
      open: vi.fn(),
      splitRight: vi.fn()
    }
    const clicked = target({ paneId: 'right', viewId: 'view-2', documentId: 'document-2', fileKey: '/note.md', dirty: true })
    const items = createWorkspaceTabMenuItems(clicked, actions)

    expect(items.find(item => item.id === 'openTabInNewWindow')?.label).toContain('disk copy')
    for (const item of items.slice(-3)) await item.click?.({}, null)
    expect(actions.move).toHaveBeenCalledWith(clicked)
    expect(actions.open).toHaveBeenCalledWith(clicked)
    expect(actions.splitRight).toHaveBeenCalledWith(clicked)
  })

  it('provides every workspace menu and command string in the desktop locales', () => {
    const locales = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'tr', 'zh-CN', 'zh-TW']
    for (const locale of locales) {
      const messages = JSON.parse(readFileSync(resolve(process.cwd(), `static/locales/${locale}.json`), 'utf8'))
      expect(messages.contextMenu.tabs).toMatchObject({
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
