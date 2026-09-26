import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { IFileState } from '@shared/types/files'

vi.hoisted(() => {
  const w = globalThis as unknown as {
    window?: {
      path?: { sep: string; dirname: (pathname: string) => string }
      electron?: {
        clipboard: { writeText: (value: string) => void }
        ipcRenderer: { send: (...args: unknown[]) => void; on: (...args: unknown[]) => void }
      }
    }
  }
  w.window ??= {}
  w.window.path ??= { sep: '/', dirname: pathname => pathname.split('/').slice(0, -1).join('/') }
  w.window.electron ??= {
    clipboard: { writeText: () => undefined },
    ipcRenderer: { send: () => undefined, on: () => undefined }
  }
})

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))

import { useEditorStore } from '@/store/editor'

const tab = (id: string): IFileState => ({
  id,
  filename: `${id}.md`,
  pathname: `/notes/${id}.md`,
  markdown: id,
  isSaved: true,
  history: { stack: [], index: -1 },
  cursor: null,
  scrollTop: 0
} as unknown as IFileState)

describe('editor store tab close focus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('returns to the most recently focused open tab when closing the active tab', () => {
    const store = useEditorStore()
    const [first, second, third] = [tab('first'), tab('second'), tab('third')]
    store.tabs = [first, second, third]
    store.currentFile = first

    store.UPDATE_CURRENT_FILE(second)
    store.UPDATE_CURRENT_FILE(third)
    store.FORCE_CLOSE_TAB(third)

    expect(store.currentFile?.id).toBe('second')
  })

  it('keeps the active tab when closing a background tab and skips it in later MRU fallback', () => {
    const store = useEditorStore()
    const [first, second, third] = [tab('first'), tab('second'), tab('third')]
    store.tabs = [first, second, third]
    store.currentFile = first

    store.UPDATE_CURRENT_FILE(second)
    store.UPDATE_CURRENT_FILE(third)
    store.FORCE_CLOSE_TAB(second)
    expect(store.currentFile?.id).toBe('third')

    store.FORCE_CLOSE_TAB(third)
    expect(store.currentFile?.id).toBe('first')
  })

  it('uses the same MRU fallback after a confirmed unsaved close closes by id', () => {
    const store = useEditorStore()
    const [first, second, third] = [tab('first'), tab('second'), tab('third')]
    store.tabs = [first, second, third]
    store.currentFile = first

    store.UPDATE_CURRENT_FILE(second)
    store.UPDATE_CURRENT_FILE(third)
    store.CLOSE_TABS(['third'])

    expect(store.currentFile?.id).toBe('second')
  })
})
