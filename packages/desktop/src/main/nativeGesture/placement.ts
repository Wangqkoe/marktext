import type { NativeExternalReleasePoint } from '../tabTransfer/types'

interface NativeWindowSize { readonly width: number; readonly height: number }
interface NativeWorkArea { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** The only target placement V1 supports: top-left at the physical release, clamped to one 96-DPI work area. */
export const clampNativeExternalReleasePoint = (
  releasePoint: NativeExternalReleasePoint,
  windowSize: NativeWindowSize,
  workArea: NativeWorkArea
): NativeExternalReleasePoint => ({
  x: Math.max(workArea.x, Math.min(releasePoint.x, Math.max(workArea.x, workArea.x + workArea.width - windowSize.width))),
  y: Math.max(workArea.y, Math.min(releasePoint.y, Math.max(workArea.y, workArea.y + workArea.height - windowSize.height)))
})
