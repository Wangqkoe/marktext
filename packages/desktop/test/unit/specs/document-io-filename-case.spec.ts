import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  FileObservationHub,
  MemoryFileObservationWatchFactory,
  NodeFileObservationStorage,
  type FileLocation,
  type FileObservationEvent
} from 'main_renderer/filesystem/fileObservation'
import { DocumentIOCoordinator } from 'main_renderer/filesystem/documentIO'
import type { DocumentIoSaveRequest } from '@shared/workspace/documentIo'

const options = { encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf' as const, adjustLineEndingOnSave: false }

class RecordingWatchFactory extends MemoryFileObservationWatchFactory {
  readonly watchedPathnames: string[] = []

  override watch(location: FileLocation, onChange: (event: FileObservationEvent) => void): () => void {
    this.watchedPathnames.push(location.pathname)
    return super.watch(location, onChange)
  }
}

// The storage is forced case-insensitive, so the lower-cased identity key is
// exercised on every platform; on a case-sensitive volume a write through that
// key would create a second, lower-cased file instead of renaming this one.
describe('DocumentIOCoordinator keeps the file name case on a case-insensitive volume', () => {
  const cleanups: (() => Promise<void> | void)[] = []

  afterEach(async() => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  })

  const setup = async() => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'marktext-case-'))
    const watchers = new RecordingWatchFactory()
    const hub = new FileObservationHub(new NodeFileObservationStorage({ caseSensitive: false }), watchers)
    const coordinator = new DocumentIOCoordinator(hub)
    coordinator.registerEndpoint({ id: 'sender', sessionId: 'session', send: () => undefined })
    cleanups.push(() => rm(directory, { recursive: true, force: true }))
    cleanups.push(() => hub.close())
    return { directory, watchers, coordinator }
  }

  const bind = async(coordinator: DocumentIOCoordinator, pathname: string) => {
    const ack = await coordinator.request('sender', {
      kind: 'bind',
      requestId: `bind:${pathname}`,
      documentId: 'document',
      documentRevision: 1,
      pathname,
      dirty: true
    })
    if (ack.status !== 'bound') throw new Error(`bind failed: ${ack.status}`)
    return ack.ownerFence
  }

  const save = (ownerFence: string, requestId: string, documentRevision: number, markdown: string): DocumentIoSaveRequest => ({
    kind: 'save',
    requestId,
    documentId: 'document',
    documentRevision,
    ownerFence,
    markdown,
    options
  })

  it('saves a mixed-case file in place, including repeated (auto-)saves', async() => {
    const { directory, watchers, coordinator } = await setup()
    const file = path.join(directory, 'delhayeOpticalFrequencyComb2007.md')
    await writeFile(file, 'baseline\n')
    const ownerFence = await bind(coordinator, file)

    // Auto-save sends the same `save` request as Ctrl+S, so two in a row cover both.
    await expect(coordinator.request('sender', save(ownerFence, 'save:1', 2, 'first\n')))
      .resolves.toMatchObject({ status: 'durable-success' })
    await expect(coordinator.request('sender', save(ownerFence, 'save:2', 3, 'second\n')))
      .resolves.toMatchObject({ status: 'durable-success' })

    expect(await readdir(directory)).toEqual(['delhayeOpticalFrequencyComb2007.md'])
    expect(await readFile(file, 'utf8')).toBe('second\n')
    expect(watchers.watchedPathnames).toEqual([path.normalize(file)])
  })

  it('keeps the case of the new name for Save As and rename', async() => {
    const { directory, coordinator } = await setup()
    const source = path.join(directory, 'Source.md')
    await writeFile(source, 'baseline\n')
    const ownerFence = await bind(coordinator, source)

    const renamedTarget = path.join(directory, 'RenamedNote.md')
    await expect(coordinator.request('sender', {
      ...save(ownerFence, 'rename', 2, 'renamed\n'), kind: 'rename', targetPathname: renamedTarget
    })).resolves.toMatchObject({ status: 'durable-success' })
    await expect(coordinator.request('sender', save(ownerFence, 'save-after-rename', 3, 'renamed again\n')))
      .resolves.toMatchObject({ status: 'durable-success' })

    const copyTarget = path.join(directory, 'CopyOfNote.md')
    await expect(coordinator.request('sender', {
      ...save(ownerFence, 'save-as', 4, 'copy\n'), kind: 'save-as', targetPathname: copyTarget
    })).resolves.toMatchObject({ status: 'durable-success' })

    expect((await readdir(directory)).sort()).toEqual(['CopyOfNote.md', 'RenamedNote.md', 'Source.md'])
    expect(await readFile(renamedTarget, 'utf8')).toBe('renamed again\n')
    expect(await readFile(copyTarget, 'utf8')).toBe('copy\n')
  })

  it('keeps the case of an untitled document saved for the first time', async() => {
    const { directory, coordinator } = await setup()
    const target = path.join(directory, 'UntitledDraft.md')
    await expect(coordinator.request('sender', {
      kind: 'save-as',
      requestId: 'untitled',
      documentId: 'untitled',
      documentRevision: 0,
      markdown: 'draft\n',
      options,
      targetPathname: target
    })).resolves.toMatchObject({ status: 'durable-success' })

    expect(await readdir(directory)).toEqual(['UntitledDraft.md'])
    expect(await readFile(target, 'utf8')).toBe('draft\n')
  })

  it('writes to the on-disk name even when the file was opened through a differently cased path', async(context) => {
    const { directory, coordinator } = await setup()
    const file = path.join(directory, 'MixedCase.md')
    await writeFile(file, 'baseline\n')
    const lowerCased = path.join(directory, 'mixedcase.md')
    // Only a really case-insensitive volume (NTFS, APFS default) can open the lower-cased spelling.
    const insensitive = await stat(lowerCased).then(() => true, () => false)
    if (!insensitive) return context.skip()
    const ownerFence = await bind(coordinator, lowerCased)

    await expect(coordinator.request('sender', save(ownerFence, 'save', 2, 'updated\n')))
      .resolves.toMatchObject({ status: 'durable-success' })

    expect(await readdir(directory)).toEqual(['MixedCase.md'])
    expect(await readFile(file, 'utf8')).toBe('updated\n')
  })
})
