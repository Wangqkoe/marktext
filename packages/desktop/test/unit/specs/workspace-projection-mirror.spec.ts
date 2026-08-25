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

  it('keeps nested controller facade values independent and deeply frozen', async () => {
    const controller = createWorkspaceRuntime([{ markdown: 'one', title: 'note' }])
    const store = useEditorStore()
    store.ATTACH_WORKSPACE_FACADE(controller)
    const facade = store.workspaceFacade as ReturnType<typeof controller.getFacadeSnapshot>
    const document = facade.documents[0]!
    expect(Object.isFrozen(document.portableHistory)).toBe(true)
    expect(Object.isFrozen(document.cursor)).toBe(true)
    expect(Object.isFrozen(document.encoding)).toBe(true)
    expect(Object.isFrozen(document.toc)).toBe(true)
    expect(Object.isFrozen(document.status)).toBe(true)
    expect(() => { (document.encoding as { encoding: string }).encoding = 'forged' }).toThrow()
    expect(controller.getFacadeSnapshot().documents[0]?.encoding.encoding).toBe('utf8')
    store.DETACH_WORKSPACE_FACADE()
  })

  it('projects an independent, deeply frozen legacy currentFile without freezing UI search state', async() => {
    const controller = createWorkspaceRuntime([
      {
        documentId: 'note',
        markdown: 'one',
        title: 'note.md',
        portableHistory: { version: 1, value: { entries: [{ id: 'controller-history' }] } }
      }
    ])
    const binding = await controller.bindPaneEditor('left', {
      refresh: async() => {},
      flush: async() => ({})
    })
    const lease = binding.getLease()
    if (!lease) throw new Error('missing lease')
    const store = useEditorStore()
    store.ATTACH_WORKSPACE_FACADE(controller)
    expect(binding.report(lease, {
      cursor: { line: 3, column: 2 },
      selection: { anchor: { line: 3, column: 1 }, head: { line: 3, column: 2 } },
      toc: [{ id: 'controller-toc', title: 'Controller TOC', level: 2 }],
      status: { wordCount: 4, characterCount: 16, caret: { line: 3, column: 2 } }
    }).status).toBe('applied')

    const current = store.currentFile as (typeof store.currentFile & {
      selection: { anchor: { line: number }; head: { column: number } }
      toc: Array<{ title: string }>
      status: { caret: { line: number } }
    })
    if (!current) throw new Error('missing legacy current file')
    expect(current).not.toBe(store.tabs[0])
    expect(current.history).toMatchObject({ version: 1, value: { entries: [{ id: 'controller-history' }] } })
    expect(current.cursor).toEqual({ line: 3, column: 2 })
    expect(current.selection).toMatchObject({ anchor: { line: 3 }, head: { column: 2 } })
    expect(current.encoding).toEqual({ encoding: 'utf8', isBom: false })
    expect(current.toc[0]?.title).toBe('Controller TOC')
    expect(current.status.caret.line).toBe(3)
    expect(current.wordCount).toEqual({ paragraph: 0, word: 4, character: 16, all: 16 })

    expect(() => {
      ;((current.history as unknown as { value: { entries: Array<{ id: string }> } }).value.entries[0]!).id = 'forged'
    }).toThrow()
    expect(() => { (current.cursor as { line: number }).line = 99 }).toThrow()
    expect(() => { current.encoding.encoding = 'forged' }).toThrow()
    expect(() => { current.toc[0]!.title = 'forged' }).toThrow()
    expect(() => { current.status.caret.line = 99 }).toThrow()
    expect(() => { store.listToc[0]!.content = 'forged' }).toThrow()
    expect(() => { store.toc[0]!.children.push(store.toc[0]!) }).toThrow()
    current.searchMatches.value = 'ui-only'

    const truth = controller.getFacadeSnapshot().documents[0]!
    expect(truth.portableHistory).toMatchObject({ value: { entries: [{ id: 'controller-history' }] } })
    expect(truth.cursor).toEqual({ line: 3, column: 2 })
    expect(truth.toc[0]?.title).toBe('Controller TOC')
    expect(truth.status.caret?.line).toBe(3)
    expect(store.currentFile?.searchMatches.value).toBe('ui-only')
    store.DETACH_WORKSPACE_FACADE()
  })
})
