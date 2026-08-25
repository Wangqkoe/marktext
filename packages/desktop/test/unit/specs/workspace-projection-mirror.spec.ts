import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createWorkspaceProjectionMirror, createWorkspaceRuntime } from '@/workspace'

vi.hoisted(() => {
  const w = globalThis as unknown as { window?: { path?: { sep: string; dirname: (path: string) => string }; electron?: { clipboard: { writeText: () => void }; ipcRenderer: { send: () => void; on: () => void } } } }
  w.window ??= {}
  w.window.path ??= { sep: '/', dirname: (path: string) => path }
  w.window.electron ??= { clipboard: { writeText: () => {} }, ipcRenderer: { send: () => {}, on: () => {} } }
})
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn(), name: 'notify' } }))
import { useEditorStore } from '@/store/editor'

describe('WorkspaceProjectionMirror', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('accepts controller subscription data only and detaches on disposal', async () => {
    const controller = createWorkspaceRuntime([{ markdown: 'private markdown', title: 'note' }])
    const mirror = createWorkspaceProjectionMirror(controller)
    const initial = mirror.getSnapshot()

    expect(Object.isFrozen(initial)).toBe(true)
    expect(initial.documents[0]?.markdown).toBe('private markdown')
    expect(JSON.stringify(initial)).toContain('portableHistory')
    expect(JSON.stringify(initial)).not.toContain('lease')
    expect(JSON.stringify(initial)).not.toContain('ownerFence')
    expect(JSON.stringify(initial)).not.toContain('DiskRevision')

    await controller.execute({ kind: 'new-tab' })
    expect(mirror.getSnapshot().projection.panes[0]?.tabs).toHaveLength(2)

    const beforeDispose = mirror.getSnapshot()
    mirror.dispose()
    await controller.execute({ kind: 'new-tab' })
    expect(mirror.getSnapshot()).toBe(beforeDispose)
  })

  it('drives the Pinia compatibility facade one way from its frozen projection', async () => {
    const controller = createWorkspaceRuntime([
      { documentId: 'note', markdown: 'controller-only', title: 'note.md', fileKey: '/note.md' }
    ])
    const store = useEditorStore()
    store.ATTACH_WORKSPACE_FACADE(controller)

    expect(store.currentFile).toMatchObject({ id: 'note', filename: 'note.md', pathname: '/note.md' })
    expect(store.currentFile?.markdown).toBe('controller-only')
    if (!store.currentFile) throw new Error('missing facade tab')
    expect(() => {
      if (store.currentFile) store.currentFile.filename = 'forged.md'
    }).toThrow()
    expect(controller.getProjection().panes[0]?.tabs[0]?.title).toBe('note.md')

    await controller.execute({ kind: 'new-tab' })
    expect(store.tabs.map((tab) => tab.filename)).toEqual(['note.md', 'New Tab'])
    store.DETACH_WORKSPACE_FACADE()
  })
})
