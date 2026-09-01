const ELLIPSIS = '…'

const extensionLength = (value: string): number => {
  const lastSlash = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
  const lastDot = value.lastIndexOf('.')
  return lastDot > lastSlash + 1 ? Array.from(value.slice(lastDot)).length : 0
}

/**
 * Fits a title to a measured width by removing characters from its middle.
 * The suffix always includes the filename extension when one is present.
 */
export const truncateTitleMiddle = (
  value: string,
  maxWidth: number,
  measure: (candidate: string) => number
): string => {
  if (!value || maxWidth <= 0) return ''
  if (measure(value) <= maxWidth) return value
  if (measure(ELLIPSIS) > maxWidth) return ''

  const characters = Array.from(value)
  const minimumSuffix = extensionLength(value)
  const minimumCandidate = minimumSuffix
    ? `${ELLIPSIS}${characters.slice(-minimumSuffix).join('')}`
    : ELLIPSIS
  if (measure(minimumCandidate) > maxWidth) return ''

  let best = minimumCandidate
  let low = Math.max(1, minimumSuffix)
  let high = characters.length - 1

  while (low <= high) {
    const retained = Math.floor((low + high) / 2)
    let suffixCount = Math.max(minimumSuffix, Math.floor(retained / 2))
    if (retained > minimumSuffix) suffixCount = Math.min(suffixCount, retained - 1)
    const prefixCount = retained - suffixCount
    const candidate = `${characters.slice(0, prefixCount).join('')}${ELLIPSIS}${characters
      .slice(-suffixCount)
      .join('')}`

    if (measure(candidate) <= maxWidth) {
      best = candidate
      low = retained + 1
    } else {
      high = retained - 1
    }
  }

  return best
}

/** Remove Electron mnemonic markers from labels rendered as ordinary HTML. */
export const withoutMenuMnemonic = (label: string): string =>
  label.replace(/\s*\(&.\)\s*$/, '').replace(/&(.)/g, '$1')
