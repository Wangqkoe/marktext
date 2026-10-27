import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CrashDraftStore } from 'main_renderer/crashDraftRecovery'
import { createWorkspaceRuntime } from '@/workspace'

// Every editor window, and every launch, runs its own renderer: a fresh
// controller and a freshly evaluated util module stand in for one.
const firstDocumentId = (): string => {
  const [document] = createWorkspaceRuntime([{ markdown: 'draft' }]).getFacadeSnapshot().documents
  if (!document) throw new Error('expected the seeded document')
  return document.documentId
}

const freshLegacyTabId = async(): Promise<string> => {
  vi.resetModules()
  const { getUniqueId } = await import('@/util')
  return getUniqueId()
}

const checkpoint = (documentId: string, documentRevision: number) => ({
  documentId,
  documentRevision,
  markdown: `revision ${documentRevision}`,
  view: { cursor: { line: 0, column: 0 }, selection: null }
})

describe('document ids across windows and launches', () => {
  const directories: string[] = []
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  it('gives the first document of each window a different id', () => {
    expect(firstDocumentId()).not.toBe(firstDocumentId())
  })

  it('gives the first legacy tab of each window a different id', async() => {
    expect(await freshLegacyTabId()).not.toBe(await freshLegacyTabId())
  })

  // The crash-draft directory outlives every window. A later launch's dirty
  // document must not inherit an earlier launch's drafts and tombstone, or
  // its own checkpoint is refused as stale and Don't Save cannot close it.
  it('lets a later launch discard its dirty document after an earlier launch discarded one', async() => {
    const directory = mkdtempSync(path.join(tmpdir(), 'mt-crash-ids-'))
    directories.push(directory)

    const earlier = new CrashDraftStore(directory)
    const earlierId = firstDocumentId()
    await expect(earlier.checkpoint(checkpoint(earlierId, 1))).resolves.toEqual({ durable: true })
    await expect(earlier.checkpoint(checkpoint(earlierId, 2))).resolves.toEqual({ durable: true })
    await expect(earlier.discard(earlierId, 2)).resolves.toEqual({ durable: true })

    const later = new CrashDraftStore(directory)
    const laterId = firstDocumentId()
    await expect(later.checkpoint(checkpoint(laterId, 1))).resolves.toEqual({ durable: true })
    await expect(later.discard(laterId, 1)).resolves.toEqual({ durable: true })
    await expect(later.markCleanShutdown()).resolves.toEqual({ durable: true })
  })
})
