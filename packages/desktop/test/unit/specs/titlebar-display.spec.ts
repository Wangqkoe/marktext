import { describe, expect, it } from 'vitest'
import {
  truncateTitleMiddle,
  withoutMenuMnemonic
} from '@/components/titleBar/display'
import { APPLICATION_MENU_SECTIONS } from '@shared/types/menu'

const measure = (value: string): number => Array.from(value).length

describe('truncateTitleMiddle', () => {
  it.each(['123.md', '2026-08-30.md', '1.2.3.md', '中文.md', 'document.md', 'ملف.md', 'LTR-ملف-2026.md'])(
    'does not reorder a fitting title: %s',
    (title) => {
      expect(truncateTitleMiddle(title, measure(title), measure)).toBe(title)
    }
  )

  it('removes the middle while retaining both the leading text and extension', () => {
    const result = truncateTitleMiddle('a-very-long-document-name.md', 12, measure)
    expect(result).toMatch(/^a.*….*\.md$/)
    expect(measure(result)).toBeLessThanOrEqual(12)
  })

  it('returns no visible text when even an ellipsis and extension are unsafe', () => {
    expect(truncateTitleMiddle('document.markdown', 4, measure)).toBe('')
  })
})

describe('withoutMenuMnemonic', () => {
  it.each([
    ['&Theme', 'Theme'],
    ['Theme (&T)', 'Theme'],
    ['主题(&T)', '主题']
  ])('renders %s as %s', (label, expected) => {
    expect(withoutMenuMnemonic(label)).toBe(expected)
  })
})

describe('concise application menu order', () => {
  it('matches the non-macOS Electron editor menu order', () => {
    expect(APPLICATION_MENU_SECTIONS).toEqual([
      'file',
      'edit',
      'paragraph',
      'format',
      'window',
      'theme',
      'view',
      'help'
    ])
  })
})
