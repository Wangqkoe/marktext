import { describe, expect, it } from 'vitest'
import { createWorkspaceProjectionMirror, createWorkspaceRuntime } from '@/workspace'

describe('WorkspaceProjectionMirror', () => {
  it('accepts controller subscription data only and detaches on disposal', async () => {
    const controller = createWorkspaceRuntime([{ markdown: 'private markdown', title: 'note' }])
    const mirror = createWorkspaceProjectionMirror(controller)
    const initial = mirror.getSnapshot()

    expect(Object.isFrozen(initial)).toBe(true)
    expect(JSON.stringify(initial)).not.toContain('private markdown')
    expect(JSON.stringify(initial)).not.toContain('portableHistory')
    expect(JSON.stringify(initial)).not.toContain('lease')

    await controller.execute({ kind: 'new-tab' })
    expect(mirror.getSnapshot().panes[0]?.tabs).toHaveLength(2)

    const beforeDispose = mirror.getSnapshot()
    mirror.dispose()
    await controller.execute({ kind: 'new-tab' })
    expect(mirror.getSnapshot()).toBe(beforeDispose)
  })
})
