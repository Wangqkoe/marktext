export const DEFAULT_DOCUMENT_ZOOM = 1
export const MIN_DOCUMENT_ZOOM = 0.5
export const MAX_DOCUMENT_ZOOM = 2

export function normalizeDocumentZoom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_DOCUMENT_ZOOM
  return Math.min(MAX_DOCUMENT_ZOOM, Math.max(MIN_DOCUMENT_ZOOM, value))
}

/**
 * Capture the first visible document element so a zoom reflow can restore it
 * to the same viewport position. The returned callback is intentionally small:
 * callers decide when their framework/layout work has finished.
 */
export function captureScrollAnchor(
  scrollContainer: HTMLElement | null | undefined,
  selector: string
): () => void {
  if (!scrollContainer) return () => {}

  const previousScrollTop = scrollContainer.scrollTop
  if (previousScrollTop <= 0) {
    return () => {
      scrollContainer.scrollTop = 0
    }
  }

  const containerTop = scrollContainer.getBoundingClientRect().top
  const candidates = Array.from(scrollContainer.querySelectorAll<HTMLElement>(selector))
  const anchor = candidates.find((candidate) => candidate.getBoundingClientRect().bottom >= containerTop)
  const previousScrollHeight = scrollContainer.scrollHeight
  const previousOffset = anchor?.getBoundingClientRect().top

  return () => {
    if (anchor?.isConnected && previousOffset !== undefined) {
      const nextContainerTop = scrollContainer.getBoundingClientRect().top
      const nextOffset = anchor.getBoundingClientRect().top
      scrollContainer.scrollTop += nextOffset - nextContainerTop - (previousOffset - containerTop)
      return
    }

    if (previousScrollHeight > 0) {
      scrollContainer.scrollTop = previousScrollTop * scrollContainer.scrollHeight / previousScrollHeight
    }
  }
}
