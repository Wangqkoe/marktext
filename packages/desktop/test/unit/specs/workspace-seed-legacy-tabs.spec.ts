import { describe, it, expect, vi } from 'vitest'

// `@/store/editor` reads `window.path.sep` at module load (normally injected by
// the preload bridge); stub the surface before the hoisted import runs.
vi.hoisted(() => {
  const w = globalThis as unknown as {
    window?: {
      path?: { sep: string; dirname: (p: string) => string }
      electron?: { ipcRenderer: { send: () => void; on: () => void } }
    }
  }
  w.window ??= {}
  w.window.path ??= { sep: '/', dirname: (p: string) => p }
  w.window.electron ??= { ipcRenderer: { send: () => {}, on: () => {} } }
})

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))

import { workspaceSeedFromLegacyTabs } from '@/store/editor'

type FileState = Parameters<typeof workspaceSeedFromLegacyTabs>[0][number]

const file = (id: string, name: string) =>
  ({
    id,
    markdown: `# ${name}\n`,
    filename: name,
    pathname: `/docs/${name}`,
    encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 2
  }) as unknown as FileState

describe('workspaceSeedFromLegacyTabs', () => {
  it('seeds a background startup file that arrived before the workspace mounted', () => {
    const other = file('mt-0', 'other.md')
    const note = file('mt-1', 'note.md')

    const seed = workspaceSeedFromLegacyTabs([other, note], note)

    expect(seed.map((input) => input.documentId)).toEqual(['mt-0', 'mt-1'])
    expect(seed.map((input) => input.fileKey)).toEqual(['/docs/other.md', '/docs/note.md'])
  })

  // The controller activates the last seed input.
  it('puts the current file last so it stays active', () => {
    const note = file('mt-0', 'note.md')
    const other = file('mt-1', 'other.md')

    const seed = workspaceSeedFromLegacyTabs([note, other], note)

    expect(seed.map((input) => input.documentId)).toEqual(['mt-1', 'mt-0'])
  })

  it('seeds nothing without a current file', () => {
    expect(workspaceSeedFromLegacyTabs([file('mt-0', 'a.md')], null)).toEqual([])
  })
})
