import { describe, expect, it } from 'vitest'
import { mapIndexCursor } from '@shared/workspace/indexCursorMap'

const at = (line: number, ch: number) => ({ anchor: { line, ch }, focus: { line, ch } })

// The document's own text as Source mode shows it, and the engine's
// re-serialization of the same content.
const original = '# Title\n\n\n\npara one\n\n\n\n* star item\n* second TARGET here\n\n\n\nlast para\n'
const engine = '# Title\n\npara one\n\n- star item\n- second TARGET here\n\nlast para\n'

describe('mapIndexCursor', () => {
  it('moves a caret across collapsed blank lines', () => {
    expect(mapIndexCursor(at(2, 3), engine, original)).toEqual(at(4, 3))
    expect(mapIndexCursor(at(7, 4), engine, original)).toEqual(at(13, 4))
    expect(mapIndexCursor(at(13, 4), original, engine)).toEqual(at(7, 4))
  })

  it('keeps the column on a line whose list marker was rewritten', () => {
    expect(mapIndexCursor(at(5, 11), engine, original)).toEqual(at(9, 11))
    expect(mapIndexCursor(at(9, 11), original, engine)).toEqual(at(5, 11))
  })

  it('maps a caret on a dropped blank line to the next shared line', () => {
    expect(mapIndexCursor(at(6, 0), original, engine)).toEqual(at(4, 0))
  })

  it('keeps the column from the line end when text before it changed', () => {
    const from = 'Some *emph* tail\n'
    const to = 'Some _emph_ tail\n'
    expect(mapIndexCursor(at(0, 14), from, to)).toEqual(at(0, 14))
    expect(mapIndexCursor(at(0, 2), from, to)).toEqual(at(0, 2))
  })

  it('passes through identical texts and non-index cursors', () => {
    const cursor = at(3, 1)
    expect(mapIndexCursor(cursor, engine, engine)).toBe(cursor)
    const blockCursor = { anchorPath: [0, 'text'], focusPath: [0, 'text'] }
    expect(mapIndexCursor(blockCursor, engine, original)).toBe(blockCursor)
  })

  it('maps a selection endpoint by endpoint', () => {
    const selection = { anchor: { line: 2, ch: 0 }, focus: { line: 5, ch: 4 } }
    expect(mapIndexCursor(selection, engine, original)).toEqual({
      anchor: { line: 4, ch: 0 },
      focus: { line: 9, ch: 4 }
    })
  })
})
