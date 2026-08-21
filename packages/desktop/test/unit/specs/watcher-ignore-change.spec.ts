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
  })
})
