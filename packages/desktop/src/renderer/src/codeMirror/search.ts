import { buildRegexValue, matchString } from '@muyajs/core'
import type { ISearchOption } from '@muyajs/core'
import type CodeMirror from 'codemirror'

export interface SourceSearchMatch {
  /** 0-based line number. */
  line: number
  /** UTF-16 offsets within the line, the same unit as CodeMirror's `ch`. */
  start: number
  end: number
  match: string
  subMatches: (string | undefined)[]
}

/** Structurally the search bar's `PaneSearchMatches`. */
export interface SourceSearchResult {
  index: number
  matches: Array<{ start: number; end: number; match: string }>
  value: string
}

export interface SourceSearchOptions extends ISearchOption {
  /** Leave CodeMirror's selection on the active match, as the bar does when it closes. */
  selectHighlight?: boolean
  /** Match to make active instead of the first one; -1 for the first. */
  highlightIndex?: number
}

/**
 * Matches `value` in every line separately with muya's matcher, so `^` and `$`
 * anchor at line edges and no match crosses a line break.
 */
export const findLineMatches = (
  lines: readonly string[],
  value: string,
  options: ISearchOption
): SourceSearchMatch[] => {
  const matches: SourceSearchMatch[] = []
  if (!value) return matches
  lines.forEach((text, line) => {
    // The bar refuses patterns that match the empty string, so a blank line
    // cannot hold a match.
    if (!text) return
    for (const { index, match, subMatches } of matchString(text, value, options)) {
      matches.push({ line, start: index, end: index + match.length, match, subMatches })
    }
  })
  return matches
}

export const replacementFor = (match: SourceSearchMatch, value: string, isRegexp: boolean): string =>
  isRegexp ? buildRegexValue(match, value) : value

/**
 * The match to activate after replacing the active one, as muya's
 * `Search.replace` picks it: the one now at the same position, or the previous
 * one when the last match was replaced.
 */
export const indexAfterSingleReplace = (index: number, count: number): number =>
  index < count - 1 ? index : index - 1

export const MATCH_CLASS = 'mt-source-search-match'
export const ACTIVE_MATCH_CLASS = 'mt-source-search-active'

type Editor = CodeMirror.Editor
type Range = { from: CodeMirror.Position; to: CodeMirror.Position }

const rangeOf = ({ line, start, end }: SourceSearchMatch): Range => ({
  from: { line, ch: start },
  to: { line, ch: end }
})

export interface SourceSearchHost {
  /** Receives the recount made after an edit the search did not make. */
  onRefresh(result: SourceSearchResult): void
  /** The lines on screen; every line is marked when absent. */
  visibleLines?(): { from: number; to: number }
  /** Brings the active match into view before the marks are drawn. */
  reveal?(match: SourceSearchMatch): void
}

interface IPlacedMarker {
  marker: CodeMirror.TextMarker
  active: boolean
}

/**
 * Find and replace over one CodeMirror document. Every match is counted, but
 * only those on and near the lines on screen carry a text marker (plus the
 * active one): a common letter can match tens of thousands of times, and
 * marking them all blocks for seconds on a long document. The host calls
 * `paint` when the view scrolls. Any edit the search did not make itself
 * re-runs the current query, so the count never describes a document that has
 * since changed.
 */
export class SourceSearch {
  private matches: SourceSearchMatch[] = []
  private index = -1
  private value = ''
  private options: ISearchOption = {}
  /** Keyed by match index. */
  private markers = new Map<number, IPlacedMarker>()
  /** The lines the markers cover, and the active match they show. */
  private painted: { from: number; to: number; index: number } | null = null
  private replacing = false

  constructor(
    private readonly cm: Editor,
    private readonly host: SourceSearchHost
  ) {
    cm.on('changes', this.handleChanges)
  }

  dispose(): void {
    this.cm.off('changes', this.handleChanges)
    this.clearMarkers()
  }

  get active(): boolean {
    return this.value !== ''
  }

  get activeMatch(): SourceSearchMatch | undefined {
    return this.matches[this.index]
  }

  search(value: string, opt: SourceSearchOptions = {}): SourceSearchResult {
    return this.runSearch(value, opt, true)
  }

  find(action: 'prev' | 'next'): SourceSearchResult {
    const count = this.matches.length
    if (!count) return this.result()
    let index = action === 'next' ? this.index + 1 : this.index - 1
    if (index < 0) index = count - 1
    if (index >= count) index = 0
    this.index = index
    // One operation: each costs a full re-render check on a long document.
    this.cm.operation(() => {
      this.host.reveal?.(this.matches[index])
      this.paint()
    })
    return this.result()
  }

  replace(replaceValue: string, opt: SourceSearchOptions & { isSingle: boolean }): SourceSearchResult {
    const { isSingle, ...options } = opt
    const { matches, index, value } = this
    if (!matches.length || index < 0) return this.result()
    const targets = isSingle ? [matches[index]] : matches

    this.replacing = true
    try {
      // One operation is one undo step for CodeMirror.
      this.cm.operation(() => {
        this.clearMarkers()
        // Back to front, so each replacement leaves the earlier matches' offsets intact.
        for (let i = targets.length - 1; i >= 0; i--) {
          const { from, to } = rangeOf(targets[i])
          this.cm.replaceRange(replacementFor(targets[i], replaceValue, !!options.isRegexp), from, to, 'replace')
        }
      })
    } finally {
      this.replacing = false
    }

    return this.search(value, {
      ...options,
      selectHighlight: false,
      highlightIndex: isSingle ? indexAfterSingleReplace(index, matches.length) : -1
    })
  }

  /** Marks the matches around the lines on screen, unless they already are. */
  paint(): void {
    const visible = this.host.visibleLines?.()
    const { painted } = this
    if (
      visible &&
      painted &&
      painted.index === this.index &&
      visible.from >= painted.from &&
      visible.to <= painted.to
    ) return

    // Every repaint costs CodeMirror a pass over the whole rendered document,
    // however few markers change. Covering two screens either side makes
    // scrolling repaint once every couple of screens, not on every frame.
    const span = visible ? visible.to - visible.from + 1 : 0
    const range = visible
      ? { from: Math.max(0, visible.from - 2 * span), to: visible.to + 2 * span }
      : { from: 0, to: Number.MAX_SAFE_INTEGER }
    this.painted = { ...range, index: this.index }

    const wanted = new Map<number, boolean>()
    if (this.matches.length) {
      for (let i = this.firstMatchOnOrAfter(range.from); i < this.matches.length; i++) {
        if (this.matches[i].line > range.to) break
        wanted.set(i, false)
      }
      if (this.index >= 0) wanted.set(this.index, true)
    }

    const stale = [...this.markers].filter(([i, placed]) => wanted.get(i) !== placed.active)
    const missing = [...wanted].filter(([i]) => !this.markers.has(i))
    if (!stale.length && !missing.length) return
    this.cm.operation(() => {
      for (const [i, placed] of stale) {
        placed.marker.clear()
        this.markers.delete(i)
        const active = wanted.get(i)
        if (active !== undefined) missing.push([i, active])
      }
      for (const [i, active] of missing) {
        const { from, to } = rangeOf(this.matches[i])
        const marker = this.cm.markText(from, to, { className: active ? ACTIVE_MATCH_CLASS : MATCH_CLASS })
        this.markers.set(i, { marker, active })
      }
    })
  }

  private runSearch(value: string, opt: SourceSearchOptions, reveal: boolean): SourceSearchResult {
    const { selectHighlight = false, highlightIndex = -1, ...options } = opt
    const previousActive = this.markers.get(this.index)?.marker.find() as Range | undefined
    const lines: string[] = []
    this.cm.eachLine((handle) => {
      lines.push(handle.text)
    })
    const matches = findLineMatches(lines, value, options)
    let index = -1
    if (matches.length) index = highlightIndex !== -1 ? Math.min(highlightIndex, matches.length - 1) : 0

    this.matches = matches
    this.index = index
    this.value = value
    this.options = options
    this.cm.operation(() => {
      this.clearMarkers()
      if (reveal && this.activeMatch) this.host.reveal?.(this.activeMatch)
      this.paint()
    })

    if (selectHighlight) {
      const target = this.activeMatch ? rangeOf(this.activeMatch) : previousActive
      if (target) {
        this.cm.setSelection(target.from, target.to, { scroll: false })
        this.cm.focus()
      }
    }
    return this.result()
  }

  private readonly handleChanges = (): void => {
    if (this.replacing || !this.active) return
    const result = this.runSearch(this.value, { ...this.options, highlightIndex: this.index }, false)
    this.host.onRefresh(result)
  }

  private firstMatchOnOrAfter(line: number): number {
    let low = 0
    let high = this.matches.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (this.matches[mid].line < line) low = mid + 1
      else high = mid
    }
    return low
  }

  private result(): SourceSearchResult {
    return {
      index: this.index,
      matches: this.matches.map(({ start, end, match }) => ({ start, end, match })),
      value: this.value
    }
  }

  private clearMarkers(): void {
    this.painted = null
    if (!this.markers.size) return
    this.cm.operation(() => {
      for (const { marker } of this.markers.values()) marker.clear()
    })
    this.markers.clear()
  }
}

/**
 * Scroll `container`, the element that scrolls the full-height CodeMirror, so
 * the match is visible and not under the top `obscuredTop` pixels, where the
 * search bar sits. CodeMirror's own scrolling cannot do this: its scroller never
 * scrolls. A match already in the clear stays put.
 */
export const scrollMatchIntoView = (
  cm: Editor,
  match: SourceSearchMatch,
  container: HTMLElement,
  obscuredTop: number
): void => {
  const box = container.getBoundingClientRect()
  const { top, bottom } = cm.charCoords({ line: match.line, ch: match.start }, 'window')
  if (top >= box.top + obscuredTop && bottom <= box.bottom) return
  // A third of the way down leaves context above the match, as the WYSIWYG
  // editor's fixed offset does.
  const offset = Math.max(obscuredTop, box.height / 3)
  container.scrollTop += top - box.top - offset
}
