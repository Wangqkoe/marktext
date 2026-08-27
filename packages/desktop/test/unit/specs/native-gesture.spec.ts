import { describe, expect, it } from 'vitest'
import {
  NativeGestureAdapter,
  type NativeGestureCapability,
  type NativeGestureCommit,
  type NativeGestureSource
} from 'main_renderer/nativeGesture'

const primaryCapability: NativeGestureCapability = {
  platform: 'win32',
  observerReady: true,
  displays: [{ id: 'primary', primary: true, scaleFactor: 1, bounds: { x: 0, y: 0, width: 2560, height: 1440 } }]
}

const source: NativeGestureSource = {
  endpoint: { sessionId: 'window-session', epoch: 4 },
  getBounds: () => ({ x: 700, y: 300, width: 640, height: 420 }),
  dipToPhysical: bounds => ({ ...bounds })
}

const setup = (capability: NativeGestureCapability | undefined = primaryCapability) => {
  const commits: NativeGestureCommit[] = []
  let endpointCurrent = true
  const adapter = new NativeGestureAdapter({
    capability: () => capability,
    endpointCurrent: endpoint => endpointCurrent && endpoint.sessionId === source.endpoint.sessionId && endpoint.epoch === source.endpoint.epoch
  })
  const begin = () => adapter.begin({ gestureId: 'gesture-1', source, commit: commit => commits.push(commit) })
  return {
    adapter,
    begin,
    commits,
    expireEndpoint: () => { endpointCurrent = false }
  }
}

const outside = { x: 620, y: 480 }
const inside = { x: 800, y: 480 }

describe('Windows native external-release gesture adapter', () => {
  it.each([false, true])('commits a qualified outside left-up regardless of the native injected flag (%s)', injected => {
    const { adapter, begin, commits } = setup()
    expect(begin()).toBe(true)
    adapter.input({ kind: 'move', ...outside, injected })
    adapter.input({ kind: 'left-up', ...outside, injected })
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({
      gestureId: 'gesture-1',
      hitTest: {
        inside: false,
        eventPoint: { ...outside, units: 'physical-screen-pixels' },
        sourceBounds: {
          dip: { x: 700, y: 300, width: 640, height: 420 },
          physical: { x: 700, y: 300, width: 640, height: 420 },
          units: { dip: 'electron-dip', physical: 'physical-screen-pixels' }
        }
      }
    })
  })

  it('does not commit an inside up or an outside up after re-entry', () => {
    const insideRelease = setup()
    expect(insideRelease.begin()).toBe(true)
    insideRelease.adapter.input({ kind: 'move', ...outside })
    insideRelease.adapter.input({ kind: 'left-up', ...inside })
    expect(insideRelease.commits).toHaveLength(0)

    const reentry = setup()
    expect(reentry.begin()).toBe(true)
    reentry.adapter.input({ kind: 'move', ...outside })
    reentry.adapter.input({ kind: 'move', ...inside })
    reentry.adapter.input({ kind: 'left-up', ...outside })
    expect(reentry.commits).toHaveLength(0)
  })

  it('cancels Escape and never commits for crossing, blur, or timeout alone', () => {
    const { adapter, begin, commits } = setup()
    expect(begin()).toBe(true)
    adapter.input({ kind: 'move', ...outside })
    adapter.blur()
    adapter.timeout('gesture-1')
    expect(commits).toHaveLength(0)
    adapter.input({ kind: 'escape' })
    adapter.input({ kind: 'left-up', ...outside })
    expect(commits).toHaveLength(0)
  })

  it('rejects an old endpoint epoch before it can commit', () => {
    const { adapter, begin, commits, expireEndpoint } = setup()
    expect(begin()).toBe(true)
    expireEndpoint()
    adapter.input({ kind: 'move', ...outside })
    adapter.input({ kind: 'left-up', ...outside })
    expect(commits).toHaveLength(0)
  })

  it('replaces an old session so it cannot commit after a newer trusted press', () => {
    const { adapter, begin, commits } = setup()
    expect(begin()).toBe(true)
    adapter.input({ kind: 'move', ...outside })
    expect(adapter.begin({ gestureId: 'gesture-2', source, commit: commit => commits.push(commit) })).toBe(true)
    adapter.input({ kind: 'left-up', ...outside })
    expect(commits).toHaveLength(0)
  })

  it('fails closed when the supported Windows single-primary capability is absent', () => {
    const unsupported = setup({ ...primaryCapability, displays: [{ ...primaryCapability.displays[0], scaleFactor: 1.25 }] })
    expect(unsupported.begin()).toBe(false)
    unsupported.adapter.input({ kind: 'move', ...outside })
    unsupported.adapter.input({ kind: 'left-up', ...outside })
    expect(unsupported.commits).toHaveLength(0)
  })

  it('fails closed when a per-event DIP-to-physical snapshot cannot be taken', () => {
    const { adapter, commits } = setup()
    expect(adapter.begin({
      gestureId: 'gesture-1',
      source: { ...source, dipToPhysical: () => { throw new Error('screen snapshot failed') } },
      commit: commit => commits.push(commit)
    })).toBe(true)
    adapter.input({ kind: 'move', ...outside })
    adapter.input({ kind: 'left-up', ...outside })
    expect(commits).toHaveLength(0)
  })
})
