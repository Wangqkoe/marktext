import type { FileWordCount } from '@shared/types/files'

/** A one-based Markdown position suitable for display in the status bar. */
export interface CaretPosition {
  line: number
  column: number
}

/** A zero-based `{ line, ch }` point returned by Muya or CodeMirror. */
export interface ZeroBasedEditorPoint {
  line: number
  ch: number
}

/** The anchor and active focus endpoints of an editor selection. */
export interface EditorIndexCursor {
  anchor?: ZeroBasedEditorPoint | null
  focus?: ZeroBasedEditorPoint | null
}

declare const caretSessionBrand: unique symbol

/** Identifies one uninterrupted active-document and editor-mode session. */
export type CaretSession = number & { readonly [caretSessionBrand]: true }

/** A transient report; `null` means the active editor has no valid position. */
export interface CaretPositionUpdate {
  session: CaretSession
  position: CaretPosition | null
  /** Counts of the selected text, `null` for a caret; omitted by a report that cannot see the selection. */
  selection?: FileWordCount | null
}

/** Convert an editor point to one-based display units, or reject an invalid point. */
export const toCaretPosition = (
  point: ZeroBasedEditorPoint | null | undefined
): CaretPosition | null => {
  if (
    !point ||
    !Number.isInteger(point.line) ||
    !Number.isInteger(point.ch) ||
    point.line < 0 ||
    point.ch < 0
  ) {
    return null
  }
  return { line: point.line + 1, column: point.ch + 1 }
}

/** Read the active/focus endpoint from an editor cursor in one-based display units. */
export const caretPositionFromIndexCursor = (
  cursor: EditorIndexCursor | null | undefined
): CaretPosition | null => toCaretPosition(cursor?.focus)

/** Format a valid display position; preserve absence as `null`. */
export const formatCaretPosition = (position: CaretPosition | null): string | null =>
  position ? `Ln ${position.line}, Col ${position.column}` : null

/**
 * Owns the generation boundary for transient caret reports. Starting a new
 * session clears the displayed value and permanently invalidates older tokens.
 */
export class CaretUpdateGate<T = CaretPosition> {
  private session = 0

  constructor(private readonly publish: (report: T | null) => void) {}

  /** Clear the consumer and return the only token accepted for subsequent reports. */
  begin(): CaretSession {
    this.session += 1
    this.publish(null)
    return this.session as CaretSession
  }

  /** Publish a current-session report, returning whether the report was accepted. */
  accept(session: CaretSession, report: T | null): boolean {
    if (session !== this.session) return false
    this.publish(report)
    return true
  }
}

/** A latest-value animation-frame queue; cancellation never invokes the update. */
export interface AnimationFrameCoalescer<T> {
  request: (value: T) => void
  cancel: () => void
}

/**
 * Create a queue that invokes `update` at most once per animation frame with
 * the most recently requested value. Scheduler arguments allow deterministic tests.
 */
export const createAnimationFrameCoalescer = <T>(
  update: (value: T) => void,
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame
): AnimationFrameCoalescer<T> => {
  let frame: number | null = null
  let latest: T

  const request = (value: T): void => {
    latest = value
    if (frame !== null) return
    frame = schedule(() => {
      frame = null
      update(latest)
    })
  }

  const cancel = (): void => {
    if (frame === null) return
    cancelFrame(frame)
    frame = null
  }

  return { request, cancel }
}
