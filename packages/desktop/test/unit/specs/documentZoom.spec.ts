import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { captureScrollAnchor, normalizeDocumentZoom } from '@/util/documentZoom'
import { usePreferencesStore } from '@/store/preferences'

vi.mock('@/i18n', () => ({ setLanguage: vi.fn() }))

describe('document zoom preference', () => {
  const send = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    send.mockReset()
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { ipcRenderer: { send } }
    })
  })

  it('normalizes the supported factor and persists it through the preference IPC', () => {
    const store = usePreferencesStore()

    store.SET_SINGLE_PREFERENCE({ type: 'documentZoom', value: 3 })

    expect(store.documentZoom).toBe(2)
    expect(send).toHaveBeenCalledWith('mt::set-user-preference', { documentZoom: 2 })
    expect(normalizeDocumentZoom(Number.NaN)).toBe(1)
    expect(normalizeDocumentZoom(0.2)).toBe(0.5)
  })
})

describe('document zoom scroll anchor', () => {
  it('keeps the first visible block at the same viewport offset after reflow', () => {
    const container = document.createElement('div')
    const anchor = document.createElement('p')
    container.appendChild(anchor)
    document.body.appendChild(container)
    container.scrollTop = 600
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 2000 })
    container.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    let anchorTop = 140
    anchor.getBoundingClientRect = () => ({ top: anchorTop, bottom: anchorTop + 30 }) as DOMRect

    const restore = captureScrollAnchor(container, 'p')
    anchorTop = 260
    restore()

    expect(container.scrollTop).toBe(720)
    container.remove()
  })
})
