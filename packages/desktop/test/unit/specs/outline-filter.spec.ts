import { describe, expect, it } from 'vitest'
import { filterOutline } from '@/util/sidebarFilter'
import type { KeyedTocNode } from '@/util/tocKeys'

const toc: KeyedTocNode[] = [
  {
    key: 'intro',
    label: 'Intro',
    slug: 'slug-intro',
    labelHtml: undefined,
    children: [
      { key: 'details', label: 'Details', slug: 'slug-details', labelHtml: undefined, children: [] },
      { key: 'details-1', label: 'DETAILS', slug: 'slug-details-2', labelHtml: undefined, children: [] }
    ]
  },
  { key: 'other', label: 'Other', slug: 'slug-other', labelHtml: undefined, children: [] }
]

describe('Outline sidebar filtering', () => {
  it('matches heading text case-insensitively and keeps every ancestor', () => {
    const result = filterOutline(toc, 'detail')
    expect(result.nodes).toEqual([
      {
        ...toc[0],
        children: toc[0].children
      }
    ])
    expect(result.autoExpandedKeys).toEqual(new Set(['intro']))
  })

  it('preserves duplicate heading stable keys and click slugs', () => {
    const result = filterOutline(toc, 'details')
    expect(result.nodes[0].children.map((node) => [node.key, node.slug])).toEqual([
      ['details', 'slug-details'],
      ['details-1', 'slug-details-2']
    ])
  })

  it('does not interpret Files prefixes and leaves an empty query unfiltered', () => {
    expect(filterOutline(toc, 'file:details').nodes).toEqual([])
    const empty = filterOutline(toc, '')
    expect(empty.active).toBe(false)
    expect(empty.nodes).toBe(toc)
  })
})
