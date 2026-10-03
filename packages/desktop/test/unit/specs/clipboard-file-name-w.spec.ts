import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    on: vi.fn(),
    readBuffer: vi.fn(),
    read: vi.fn(),
    has: vi.fn(),
    readText: vi.fn(),
    writeText: vi.fn()
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle, on: electronMocks.on },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn(),
    openPath: vi.fn()
  },
  clipboard: {
    readBuffer: electronMocks.readBuffer,
    read: electronMocks.read,
    has: electronMocks.has,
    readText: electronMocks.readText,
    writeText: electronMocks.writeText
  }
}))

vi.mock('electron-log', () => ({ default: { error: vi.fn() } }))

import { registerShellHandlers } from '../../../src/main/ipc/shell'

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')

const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    enumerable: originalPlatform?.enumerable ?? true,
    value: platform
  })
}

const guessFilePath = (): string | null => {
  const handler = electronMocks.handlers.get('mt::clipboard::guess-file-path')
  if (!handler) throw new Error('guess-file-path IPC handler was not registered')
  return handler({}) as string | null
}

describe('Windows FileNameW clipboard handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    electronMocks.handlers.clear()
    setPlatform('win32')
    registerShellHandlers()
  })

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform)
  })

  it('decodes a non-ASCII path from UTF-16LE bytes', () => {
    const pathname = 'C:\\资料\\图片-ä.png'
    electronMocks.readBuffer.mockReturnValue(Buffer.from(`${pathname}\u0000`, 'utf16le'))

    expect(guessFilePath()).toBe(pathname)
    expect(electronMocks.readBuffer).toHaveBeenCalledWith('FileNameW')
  })

  it('returns the first non-empty path from a NUL-separated list', () => {
    electronMocks.readBuffer.mockReturnValue(
      Buffer.from('\u0000\u0000C:\\first.png\u0000D:\\second.png\u0000', 'utf16le')
    )

    expect(guessFilePath()).toBe('C:\\first.png')
  })

  it('returns an empty string for an empty FileNameW buffer', () => {
    electronMocks.readBuffer.mockReturnValue(Buffer.alloc(0))

    expect(guessFilePath()).toBe('')
  })

  it('does not read FileNameW on an unsupported platform', () => {
    setPlatform('linux')

    expect(guessFilePath()).toBe('')
    expect(electronMocks.readBuffer).not.toHaveBeenCalled()
  })
})
