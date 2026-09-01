import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/store/editor', () => ({
  useEditorStore: () => ({
    CREATE_BUFFERED_STATE: () => ({ tabs: [{ id: 'dirty-tab', isSaved: false }] })
  })
}))
vi.mock('@/store/project', () => ({
  useProjectStore: () => ({ CREATE_BUFFERED_STATE: () => ({ rootDirectory: '' }) })
}))
vi.mock('@/store/layout', () => ({
  useLayoutStore: () => ({
    createBufferedState: () => ({ sidebarView: 'files', sidebarVisible: true })
  })
}))

const renderer = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve(true))
}))

vi.hoisted(() => {
  const testWindow = globalThis as unknown as {
    window?: { electron?: { ipcRenderer: { invoke: typeof renderer.invoke } } }
  }
  testWindow.window ??= {}
  testWindow.window.electron = { ipcRenderer: { invoke: renderer.invoke } }
})

import {
  debouncedSendBufferedState,
  persistBufferedStateImmediately
} from '@/store/bufferedState'

describe('Close Folder buffered-state boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    renderer.invoke.mockClear()
  })

  afterEach(() => {
    debouncedSendBufferedState.cancel()
    vi.useRealTimers()
  })

  it('cancels the one-second writer and durably sends the rootless snapshot immediately', async() => {
    debouncedSendBufferedState()

    await persistBufferedStateImmediately()

    expect(renderer.invoke).toHaveBeenCalledOnce()
    expect(renderer.invoke).toHaveBeenCalledWith('update-buffer-state', {
      version: 1,
      tabs: [{ id: 'dirty-tab', isSaved: false }],
      project: { rootDirectory: '' },
      layout: { sidebarView: 'files', sidebarVisible: true }
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(renderer.invoke).toHaveBeenCalledOnce()
  })
})
