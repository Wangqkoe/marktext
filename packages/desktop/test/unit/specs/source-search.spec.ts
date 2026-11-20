import { beforeAll, describe, expect, it } from 'vitest'
import codeMirror from 'codemirror'
import {
  ACTIVE_MATCH_CLASS,
  MATCH_CLASS,
  SourceSearch,
  findLineMatches,
  indexAfterSingleReplace,
  replacementFor
} from '../../../src/renderer/src/codeMirror/search'

const positions = (lines: string[], value: string, options = {}) =>
  findLineMatches(lines, value, options).map(({ line, start, end, match }) => ({ line, start, end, match }))

describe('source-mode find: findLineMatches', () => {
  it('matches case-insensitively by default and case-sensitively on request', () => {
    const lines = ['Foo foo', 'bar FOO']
    expect(positions(lines, 'foo')).toEqual([
      { line: 0, start: 0, end: 3, match: 'Foo' },
      { line: 0, start: 4, end: 7, match: 'foo' },
      { line: 1, start: 4, end: 7, match: 'FOO' }
    ])
    expect(positions(lines, 'foo', { isCaseSensitive: true })).toEqual([
      { line: 0, start: 4, end: 7, match: 'foo' }
    ])
  })

  it('matches whole words only on request', () => {
    const lines = ['cat concat cats cat']
    expect(positions(lines, 'cat')).toHaveLength(4)
    expect(positions(lines, 'cat', { isWholeWord: true })).toEqual([
      { line: 0, start: 0, end: 3, match: 'cat' },
      { line: 0, start: 16, end: 19, match: 'cat' }
    ])
  })

  it('treats the query as literal text unless it is a regexp', () => {
    expect(positions(['a.c abc a.c'], 'a.c')).toEqual([
      { line: 0, start: 0, end: 3, match: 'a.c' },
      { line: 0, start: 8, end: 11, match: 'a.c' }
    ])
    expect(positions(['a.c abc a.c'], 'a.c', { isRegexp: true })).toHaveLength(3)
  })

  it('anchors ^ and $ at each line and never matches across a line break', () => {
    const lines = ['ab ab', 'ab', 'xab']
    expect(positions(lines, '^ab', { isRegexp: true })).toEqual([
      { line: 0, start: 0, end: 2, match: 'ab' },
      { line: 1, start: 0, end: 2, match: 'ab' }
    ])
    expect(positions(lines, 'ab$', { isRegexp: true }).map(m => m.line)).toEqual([0, 1, 2])
    expect(positions(['foo', 'bar'], 'foo\\s*bar', { isRegexp: true })).toEqual([])
  })

  it('returns nothing for an empty query or no match', () => {
    expect(findLineMatches(['abc'], '', {})).toEqual([])
    expect(findLineMatches(['abc', ''], 'zzz', {})).toEqual([])
  })

  it('reports UTF-16 offsets on lines with emoji and keeps clusters whole', () => {
    expect(positions(['a 😀 b 😀'], '😀')).toEqual([
      { line: 0, start: 2, end: 4, match: '😀' },
      { line: 0, start: 7, end: 9, match: '😀' }
    ])
    // A regexp reaching into an emoji takes all of it.
    expect(positions(['b😀c'], 'b.', { isRegexp: true })).toEqual([
      { line: 0, start: 0, end: 3, match: 'b😀' }
    ])
    // Part of a ZWJ sequence is not a match of its own.
    expect(positions(['👨‍👩‍👧 family'], '👩')).toEqual([])
  })
})

describe('source-mode find: replacementFor', () => {
  it('expands group references only for a regexp query', () => {
    const [match] = findLineMatches(['John Smith'], '(\\w+) (\\w+)', { isRegexp: true })
    expect(replacementFor(match, '$2, $1', true)).toBe('Smith, John')
    expect(replacementFor(match, '$0!', true)).toBe('John Smith!')

    const [literal] = findLineMatches(['John Smith'], 'John', {})
    expect(replacementFor(literal, '$1 $&', false)).toBe('$1 $&')
  })
})

describe('source-mode find: indexAfterSingleReplace', () => {
  it('keeps the position, or steps back after the last match', () => {
    expect(indexAfterSingleReplace(0, 3)).toBe(0)
    expect(indexAfterSingleReplace(1, 3)).toBe(1)
    expect(indexAfterSingleReplace(2, 3)).toBe(1)
    expect(indexAfterSingleReplace(0, 1)).toBe(-1)
  })
})

describe('source-mode find: SourceSearch over CodeMirror', () => {
  // jsdom has no layout; CodeMirror only needs these to exist when it measures.
  beforeAll(() => {
    const emptyRect = () => new DOMRect(0, 0, 0, 0)
    const emptyRects = () => [] as unknown as DOMRectList
    Range.prototype.getBoundingClientRect ??= emptyRect
    Range.prototype.getClientRects ??= emptyRects
  })

  const createEditor = (value: string) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    return codeMirror(host, { value })
  }
  const classesOf = (cm: ReturnType<typeof createEditor>) =>
    cm.getAllMarks().map(mark => (mark as unknown as { className: string }).className)

  it('marks every match and only the active one differently', () => {
    const cm = createEditor('one needle\nneedle two needle')
    const search = new SourceSearch(cm, { onRefresh: () => {} })
    const result = search.search('needle')
    expect(result.index).toBe(0)
    expect(result.matches).toHaveLength(3)
    expect(classesOf(cm).filter(c => c === ACTIVE_MATCH_CLASS)).toHaveLength(1)
    expect(classesOf(cm).filter(c => c === MATCH_CLASS)).toHaveLength(2)

    expect(search.find('prev').index).toBe(2)
    expect(search.find('next').index).toBe(0)
    expect(cm.getAllMarks()).toHaveLength(3)

    search.search('')
    expect(cm.getAllMarks()).toHaveLength(0)
  })

  it('replaces one match, then all of them in a single undo step', () => {
    const cm = createEditor('a1 a2\na3')
    const search = new SourceSearch(cm, { onRefresh: () => {} })
    search.search('a(\\d)', { isRegexp: true })
    search.find('next')
    let result = search.replace('b$1', { isSingle: true, isRegexp: true })
    expect(cm.getValue()).toBe('a1 b2\na3')
    expect(result.matches).toHaveLength(2)
    expect(result.index).toBe(1)

    result = search.replace('c$1', { isSingle: false, isRegexp: true })
    expect(cm.getValue()).toBe('c1 b2\nc3')
    expect(result.matches).toHaveLength(0)
    cm.undo()
    expect(cm.getValue()).toBe('a1 b2\na3')
  })

  it('recounts after an edit it did not make', () => {
    const cm = createEditor('x x')
    const refreshed: number[] = []
    const search = new SourceSearch(cm, { onRefresh: result => refreshed.push(result.matches.length) })
    search.search('x')
    cm.setValue('x x x')
    expect(refreshed).toEqual([3])
    search.search('')
    cm.setValue('x')
    expect(refreshed).toEqual([3])
  })

  it('marks matches near the visible lines plus the active one, repainting only when needed', () => {
    const cm = createEditor(Array.from({ length: 30 }, (_, i) => `line ${i} x`).join(String.fromCharCode(10)))
    let visible = { from: 10, to: 11 }
    const revealed: number[] = []
    const search = new SourceSearch(cm, {
      onRefresh: () => {},
      visibleLines: () => visible,
      reveal: match => revealed.push(match.line)
    })
    const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    const lines = () =>
      cm.getAllMarks().map(mark => (mark.find() as { from: { line: number } }).from.line).sort((a, b) => a - b)

    // Two screens (here two lines each) either side of the visible ones.
    expect(search.search('x').matches).toHaveLength(30)
    expect(lines()).toEqual([0, ...range(6, 15)])
    expect(revealed).toEqual([0])

    visible = { from: 12, to: 13 }
    search.paint()
    expect(lines()).toEqual([0, ...range(6, 15)])

    visible = { from: 20, to: 21 }
    search.paint()
    expect(lines()).toEqual([0, ...range(16, 25)])

    search.find('prev')
    expect(revealed).toEqual([0, 29])
    expect(lines()).toEqual([...range(16, 25), 29])
    expect(classesOf(cm).filter(c => c === ACTIVE_MATCH_CLASS)).toHaveLength(1)
  })

  it('selects the active match when asked to on close', () => {
    const cm = createEditor('foo bar foo')
    const search = new SourceSearch(cm, { onRefresh: () => {} })
    search.search('foo')
    search.find('next')
    search.search('', { selectHighlight: true })
    expect(cm.getSelection()).toBe('foo')
    expect(cm.getCursor('from')).toEqual(expect.objectContaining({ line: 0, ch: 8 }))
  })
})
