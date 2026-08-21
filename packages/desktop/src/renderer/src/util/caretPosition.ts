export interface CaretPosition {
  line: number
  column: number
}

export interface ZeroBasedEditorPoint {
  line: number
  ch: number
}

export interface EditorIndexCursor {
  anchor?: ZeroBasedEditorPoint | null
  focus?: ZeroBasedEditorPoint | null
}

export interface CaretPositionUpdate {
  session: number
  position: CaretPosition | null
}

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

export const caretPositionFromIndexCursor = (
  cursor: EditorIndexCursor | null | undefined
): CaretPosition | null => toCaretPosition(cursor?.focus)

export const formatCaretPosition = (position: CaretPosition | null): string | null =>
  position ? `Ln ${position.line}, Col ${position.column}` : null

export class CaretUpdateGate {
  private session = 0

  constructor(private readonly publish: (position: CaretPosition | null) => void) {}

  begin(): number {
    this.session += 1
    this.publish(null)
    return this.session
  }

  accept(session: number, position: CaretPosition | null): boolean {
    if (session !== this.session) return false
    this.publish(position)
    return true
  }
}

export interface AnimationFrameCoalescer<T> {
  request: (value: T) => void
  cancel: () => void
}

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
