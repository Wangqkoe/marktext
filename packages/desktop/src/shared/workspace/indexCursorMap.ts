// Source mode shows a document's own text, while the WYSIWYG engine reads and
// writes the engine's re-serialization of it (collapsed blank lines, `-`
// bullets, trimmed trailing spaces). A `{ line, ch }` caret handed between the
// two must be translated from one text to the other, or it lands on whatever
// sits at the same line number in the other text.

interface IndexPosition {
  line: number
  ch: number
}

interface IndexCursor {
  anchor: IndexPosition
  focus: IndexPosition
}

const isIndexPosition = (pos: unknown): pos is IndexPosition => {
  const p = pos as { line?: unknown; ch?: unknown } | null
  return !!p && typeof p.line === 'number' && typeof p.ch === 'number'
}

const isIndexCursor = (cursor: unknown): cursor is IndexCursor => {
  const c = cursor as { anchor?: unknown; focus?: unknown } | null
  return !!c && isIndexPosition(c.anchor) && isIndexPosition(c.focus)
}

// How far ahead to look for a matching line before treating two lines as one
// rewritten line. Engine rewrites are local, so a match is normally close.
const RESYNC_WINDOW = 200

const lineKey = (line: string): string =>
  line.replace(/\r$/, '').trimEnd().replace(/^(\s*)[*+](\s)/, '$1-$2')

interface LinePair {
  from: number
  to: number
  same: boolean
}

const alignLines = (from: string[], to: string[]): LinePair[] => {
  const fromKeys = from.map(lineKey)
  const toKeys = to.map(lineKey)
  const pairs: LinePair[] = []
  let i = 0
  let j = 0
  while (i < from.length && j < to.length) {
    if (fromKeys[i] === toKeys[j]) {
      pairs.push({ from: i, to: j, same: true })
      i += 1
      j += 1
      continue
    }
    // Blank lines are what the engine adds and drops most, and they match
    // each other too easily to resynchronize on.
    if (fromKeys[i] === '') {
      i += 1
      continue
    }
    if (toKeys[j] === '') {
      j += 1
      continue
    }
    let skipTo = -1
    let skipFrom = -1
    for (let k = 1; k <= RESYNC_WINDOW && skipTo < 0 && skipFrom < 0; k += 1) {
      if (j + k < to.length && toKeys[j + k] === fromKeys[i]) skipTo = k
      else if (i + k < from.length && fromKeys[i + k] === toKeys[j]) skipFrom = k
    }
    if (skipTo > 0) j += skipTo
    else if (skipFrom > 0) i += skipFrom
    else {
      pairs.push({ from: i, to: j, same: false })
      i += 1
      j += 1
    }
  }
  return pairs
}

const commonPrefix = (a: string, b: string): number => {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1
  return n
}

const commonSuffix = (a: string, b: string, prefix: number): number => {
  let n = 0
  while (
    n < a.length - prefix &&
    n < b.length - prefix &&
    a[a.length - 1 - n] === b[b.length - 1 - n]
  ) n += 1
  return n
}

const mapColumn = (ch: number, fromLine: string, toLine: string): number => {
  const prefix = commonPrefix(fromLine, toLine)
  if (ch <= prefix) return Math.min(ch, toLine.length)
  const suffix = commonSuffix(fromLine, toLine, prefix)
  const fromEnd = fromLine.length - ch
  if (fromEnd <= suffix) return Math.max(0, toLine.length - fromEnd)
  return Math.min(ch, toLine.length)
}

const mapPosition = (
  pos: IndexPosition,
  from: string[],
  to: string[],
  pairs: LinePair[]
): IndexPosition => {
  if (to.length === 0) return { line: 0, ch: 0 }
  // A line the other text dropped (typically an extra blank line) maps to the
  // start of the next line both texts share.
  const pair = pairs.find((p) => p.from >= pos.line)
  if (!pair) return { line: to.length - 1, ch: to[to.length - 1].length }
  if (pair.from !== pos.line) return { line: pair.to, ch: 0 }
  const fromLine = (from[pos.line] ?? '').replace(/\r$/, '')
  const toLine = to[pair.to].replace(/\r$/, '')
  const ch = pair.same ? Math.min(pos.ch, toLine.length) : mapColumn(pos.ch, fromLine, toLine)
  return { line: pair.to, ch }
}

/**
 * Translate a `{ line, ch }` caret from `fromText` to the same content in
 * `toText`. Any other cursor shape, or identical texts, pass through unchanged.
 */
export const mapIndexCursor = <T>(cursor: T, fromText: string, toText: string): T => {
  if (!isIndexCursor(cursor) || fromText === toText) return cursor
  const from = fromText.split('\n')
  const to = toText.split('\n')
  const pairs = alignLines(from, to)
  return {
    ...cursor,
    anchor: mapPosition(cursor.anchor, from, to, pairs),
    focus: mapPosition(cursor.focus, from, to, pairs)
  }
}
