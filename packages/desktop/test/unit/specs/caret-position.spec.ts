import { describe, expect, it, vi } from 'vitest'
import {
  CaretUpdateGate,
  caretPositionFromIndexCursor,
  createAnimationFrameCoalescer,
  formatCaretPosition,
  toCaretPosition
} from '@/util/caretPosition'

describe('caret position', () => {
  it('converts a zero-based editor point to a one-based display position', () => {
    expect(toCaretPosition({ line: 0, ch: 0 })).toEqual({ line: 1, column: 1 })
    expect(toCaretPosition({ line: 8, ch: 12 })).toEqual({ line: 9, column: 13 })
  })

  it('returns null when an editor point is absent or invalid', () => {
    expect(toCaretPosition(null)).toBeNull()
    expect(toCaretPosition(undefined)).toBeNull()
    expect(toCaretPosition({ line: -1, ch: 0 })).toBeNull()
    expect(toCaretPosition({ line: 0, ch: Number.NaN })).toBeNull()
  })

  it('uses the focus endpoint of an index cursor', () => {
    expect(
      caretPositionFromIndexCursor({
        anchor: { line: 9, ch: 4 },
        focus: { line: 2, ch: 6 }
      })
    ).toEqual({ line: 3, column: 7 })
    expect(caretPositionFromIndexCursor({ anchor: { line: 0, ch: 0 }, focus: null })).toBeNull()
  })

  it('formats only valid positions for the status bar', () => {
    expect(formatCaretPosition({ line: 3, column: 7 })).toBe('Ln 3, Col 7')
    expect(formatCaretPosition(null)).toBeNull()
  })

  it('clears on a new session and rejects an update from an older session', () => {
    const publish = vi.fn()
    const gate = new CaretUpdateGate(publish)
    const first = gate.begin()

    expect(gate.accept(first, { line: 1, column: 2 })).toBe(true)
    const second = gate.begin()
    expect(publish.mock.calls).toEqual([[null], [{ line: 1, column: 2 }], [null]])

    expect(gate.accept(first, { line: 8, column: 9 })).toBe(false)
    expect(gate.accept(second, { line: 4, column: 5 })).toBe(true)
    expect(publish).toHaveBeenLastCalledWith({ line: 4, column: 5 })
  })

  it('coalesces rapid requests into one update with the latest value per frame', () => {
    const frames: FrameRequestCallback[] = []
    const schedule = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const cancel = vi.fn()
    const update = vi.fn()
    const coalescer = createAnimationFrameCoalescer(update, schedule, cancel)

    coalescer.request('first')
    coalescer.request('second')
    coalescer.request('latest')

    expect(schedule).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    frames.shift()?.(16)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith('latest')

    coalescer.request('next frame')
    expect(schedule).toHaveBeenCalledTimes(2)
    frames.shift()?.(32)
    expect(update).toHaveBeenLastCalledWith('next frame')
  })
})
