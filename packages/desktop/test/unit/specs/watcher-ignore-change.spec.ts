import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ced', () => ({ default: () => 'UTF-8' }))

import Watcher from 'main_renderer/filesystem/watcher'
import { getContentHash } from 'main_renderer/filesystem/markdown'

describe('watcher own-save event filtering', () => {
  let directory: string
  let pathname: string
  let watcher: Watcher

  beforeEach(async() => {
    directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'marktext-watcher-'))
    pathname = path.join(directory, 'document.md')
    const preferences = { getItem: vi.fn(() => false) }
    watcher = new Watcher(preferences as never)
  })

  afterEach(async() => {
    watcher.close()
    await fsPromises.rm(directory, { recursive: true, force: true })
  })

  it('ignores a watcher event when disk still contains the content MarkText saved', async() => {
    const content = Buffer.from('# Saved by MarkText\n')
    await fsPromises.writeFile(pathname, content)
    watcher.ignoreChangedEvent(1, pathname, getContentHash(content), 10_000)

    await expect(watcher._shouldIgnoreEvent(1, pathname, 'file', true)).resolves.toBe(true)
  })

  it('does not ignore an external write that follows a MarkText save', async() => {
    const savedContent = Buffer.from('# Saved by MarkText\n')
    const externalContent = Buffer.from('# Changed externally\n')
    await fsPromises.writeFile(pathname, externalContent)
    watcher.ignoreChangedEvent(1, pathname, getContentHash(savedContent), 10_000)

    await expect(watcher._shouldIgnoreEvent(1, pathname, 'file', true)).resolves.toBe(false)

    await fsPromises.writeFile(pathname, savedContent)
    await expect(watcher._shouldIgnoreEvent(1, pathname, 'file', true)).resolves.toBe(true)
  })

  it('matches a newer queued save when an older save hash no longer matches disk', async() => {
    const olderContent = Buffer.from('# Older MarkText save\n')
    const newerContent = Buffer.from('# Newer MarkText save\n')
    await fsPromises.writeFile(pathname, newerContent)
    watcher.ignoreChangedEvent(1, pathname, getContentHash(olderContent), 10_000)
    watcher.ignoreChangedEvent(1, pathname, getContentHash(newerContent), 10_000)

    await expect(watcher._shouldIgnoreEvent(1, pathname, 'file', true)).resolves.toBe(true)
  })

  it('preserves a newer queued save after matching an older save event', async() => {
    const olderContent = Buffer.from('# Older MarkText save\n')
    const newerContent = Buffer.from('# Newer MarkText save\n')
    watcher.ignoreChangedEvent(1, pathname, getContentHash(olderContent), 10_000)
    watcher.ignoreChangedEvent(1, pathname, getContentHash(newerContent), 10_000)

    await fsPromises.writeFile(pathname, olderContent)
    await expect(watcher._shouldIgnoreEvent(1, pathname, 'file', true)).resolves.toBe(true)

    await fsPromises.writeFile(pathname, newerContent)
    await expect(watcher._shouldIgnoreEvent(1, pathname, 'file', true)).resolves.toBe(true)
  })

  it('serializes concurrent events so each observes its queued save', async() => {
    const olderContent = Buffer.from('# Older MarkText save\n')
    const newerContent = Buffer.from('# Newer MarkText save\n')
    watcher.ignoreChangedEvent(1, pathname, getContentHash(olderContent), 10_000)
    watcher.ignoreChangedEvent(1, pathname, getContentHash(newerContent), 10_000)

    let releaseFirstRead!: () => void
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve
    })
    let activeReads = 0
    let maxActiveReads = 0
    const readFile = vi
      .spyOn(fsPromises, 'readFile')
      .mockImplementationOnce(async() => {
        activeReads++
        maxActiveReads = Math.max(maxActiveReads, activeReads)
        await firstReadGate
        activeReads--
        return olderContent
      })
      .mockImplementationOnce(async() => {
        activeReads++
        maxActiveReads = Math.max(maxActiveReads, activeReads)
        activeReads--
        return newerContent
      })

    const olderEvent = watcher._shouldIgnoreEvent(1, pathname, 'file', true)
    const newerEvent = watcher._shouldIgnoreEvent(1, pathname, 'file', true)
    await vi.waitFor(() => expect(readFile).toHaveBeenCalledTimes(1))
    releaseFirstRead()

    await expect(Promise.all([olderEvent, newerEvent])).resolves.toEqual([true, true])
    expect(readFile).toHaveBeenCalledTimes(2)
    expect(maxActiveReads).toBe(1)
  })
})
