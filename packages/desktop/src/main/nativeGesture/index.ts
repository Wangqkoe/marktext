import type { TransferEndpoint } from '../tabTransfer/types'

export interface NativeGestureRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface NativeGestureDisplay {
  readonly id: string | number
  readonly primary: boolean
  readonly scaleFactor: number
  readonly bounds: NativeGestureRect
}

/** A fresh observer/display snapshot. Unsupported shapes must omit this value. */
export interface NativeGestureCapability {
  readonly platform: NodeJS.Platform
  readonly observerReady: boolean
  readonly electronMajor?: number
  readonly displays: readonly NativeGestureDisplay[]
}

export interface NativeGestureSource {
  readonly endpoint: TransferEndpoint
  readonly getBounds: () => NativeGestureRect
  readonly dipToPhysical: (bounds: NativeGestureRect) => NativeGestureRect
}

export type NativeGestureInput =
  | { readonly kind: 'move' | 'left-up'; readonly x: number; readonly y: number; readonly injected?: boolean }
  | { readonly kind: 'escape'; readonly injected?: boolean }

export interface NativeGestureHitTest {
  readonly inside: boolean
  readonly eventPoint: { readonly x: number; readonly y: number; readonly units: 'physical-screen-pixels' }
  readonly sourceBounds: {
    readonly dip: NativeGestureRect
    readonly physical: NativeGestureRect
    readonly display: NativeGestureDisplay
    readonly units: { readonly dip: 'electron-dip'; readonly physical: 'physical-screen-pixels' }
  }
}

export interface NativeGestureCommit { readonly gestureId: string; readonly hitTest: NativeGestureHitTest }

export interface NativeGestureBegin {
  readonly gestureId: string
  readonly source: NativeGestureSource
  readonly commit: (commit: NativeGestureCommit) => void
}

interface ActiveGesture extends NativeGestureBegin { candidate: boolean }

export interface NativeGestureAdapterOptions {
  readonly capability: () => NativeGestureCapability | undefined
  readonly endpointCurrent: (endpoint: TransferEndpoint) => boolean
}

/**
 * The product policy is deliberately narrower than a generic Windows check.
 * Issue 10 proves only Electron 42 / one primary 2560×1440 display at 96 DPI.
 */
export const isSupportedWindowsNativeGestureCapability = (
  capability: NativeGestureCapability | undefined
): capability is NativeGestureCapability => {
  if (!capability || capability.platform !== 'win32' || !capability.observerReady) return false
  if (capability.electronMajor !== undefined && capability.electronMajor !== 42) return false
  if (capability.displays.length !== 1) return false
  const display = capability.displays[0]
  return !!display && display.primary && display.scaleFactor === 1 &&
    display.bounds.x === 0 && display.bounds.y === 0 &&
    display.bounds.width === 2560 && display.bounds.height === 1440
}

/**
 * Receives only event-level native input. Crossing, blur and timeout intentionally
 * leave an active session intact; none of them is a detach trigger.
 */
export class NativeGestureAdapter {
  private active: ActiveGesture | undefined

  constructor(private readonly options: NativeGestureAdapterOptions) {}

  begin(begin: NativeGestureBegin): boolean {
    try {
      if (!this.enabled() || !this.options.endpointCurrent(begin.source.endpoint)) return false
      this.active = { ...begin, candidate: false }
      return true
    } catch {
      this.active = undefined
      return false
    }
  }

  input(input: NativeGestureInput): void {
    const active = this.active
    if (!active) return
    if (input.kind === 'escape') {
      this.active = undefined
      return
    }
    let hitTest: NativeGestureHitTest | undefined
    try {
      if (!this.options.endpointCurrent(active.source.endpoint)) {
        this.active = undefined
        return
      }
      hitTest = this.hitTest(active.source, input)
    } catch {
      this.active = undefined
      return
    }
    if (!hitTest) {
      this.active = undefined
      return
    }
    if (input.kind === 'move') {
      active.candidate = !hitTest.inside
      return
    }
    this.active = undefined
    if (active.candidate && !hitTest.inside) {
      try { active.commit({ gestureId: active.gestureId, hitTest }) } catch {}
    }
  }

  /** Native blur is observable but never a commit/cancel substitute. */
  blur(): void {}

  /** A timeout may be observed by callers but cannot mutate a gesture into a detach. */
  timeout(_gestureId: string): void {}

  dispose(): void { this.active = undefined }

  private enabled(): boolean { return isSupportedWindowsNativeGestureCapability(this.options.capability()) }

  private hitTest(
    source: NativeGestureSource,
    input: Extract<NativeGestureInput, { readonly kind: 'move' | 'left-up' }>
  ): NativeGestureHitTest | undefined {
    const capability = this.options.capability()
    if (!isSupportedWindowsNativeGestureCapability(capability)) return undefined
    const dip = source.getBounds()
    const physical = source.dipToPhysical(dip)
    const display = capability.displays[0]
    if (!display) return undefined
    const inside = input.x >= physical.x && input.x < physical.x + physical.width &&
      input.y >= physical.y && input.y < physical.y + physical.height
    return {
      inside,
      eventPoint: { x: input.x, y: input.y, units: 'physical-screen-pixels' },
      sourceBounds: {
        dip,
        physical,
        display: { ...display, bounds: { ...display.bounds } },
        units: { dip: 'electron-dip', physical: 'physical-screen-pixels' }
      }
    }
  }
}
