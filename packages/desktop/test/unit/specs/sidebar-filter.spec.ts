import { describe, expect, it } from 'vitest'
import { filterFilesTree, filterOpenedFiles, parseFilesQuery } from '@/util/sidebarFilter'
import type { TreeFileNode, TreeFolderNode, TreeNode } from '@/components/sideBar/types'
import type { IFileState } from '@shared/types/files'

const file = (name: string, parent = '/root'): TreeFileNode => ({
  id: `${parent}/${name}`,
  pathname: `${parent}/${name}`,
  name,
  isDirectory: false,
  isFile: true,
  isMarkdown: name.endsWith('.md')
})

const folder = (
  name: string,
  folders: TreeFolderNode[] = [],
  files: TreeFileNode[] = [],
  parent = '/root'
): TreeFolderNode => ({
  id: `${parent}/${name}`,
  pathname: `${parent}/${name}`,
  name,
  isDirectory: true,
  isFile: false,
  isMarkdown: false,
  folders,
  files
})

const root: TreeNode = folder(
  'root',
  [
    folder(
      'guide',
      [folder('empty')],
      [file('guide-notes.md', '/root/guide'), file('other.md', '/root/guide')]
    ),
    folder('archive', [], [file('Guide.md', '/root/archive')]),
    folder('empty')
  ],
  [file('README.md'), file('plain.txt')],
  ''
)

describe('Files sidebar filtering', () => {
  it('parses only leading case-insensitive stable prefixes', () => {
    expect(parseFilesQuery('FiLe:  GUIDE ')).toEqual({ active: true, mode: 'file', term: 'guide' })
    expect(parseFilesQuery('FOLDER:   ')).toEqual({ active: true, mode: 'folder', term: '' })
    expect(parseFilesQuery('kind:guide')).toEqual({ active: true, mode: 'all', term: 'kind:guide' })
    expect(parseFilesQuery(' file:guide')).toEqual({
      active: true,
      mode: 'all',
      term: ' file:guide'
    })
    expect(parseFilesQuery('')).toEqual({ active: false, mode: 'all', term: '' })
  })

  it('gives descendant file matches priority over the same directory match', () => {
    const result = filterFilesTree(root, 'guide')
    expect(result.folders.map((node) => node.name)).toEqual(['guide', 'archive'])
    expect(result.folders[0].files.map((node) => node.name)).toEqual(['guide-notes.md'])
    expect(result.folders[0].folders).toEqual([])
    expect(result.autoExpandedKeys).toContain('/root/guide')
    expect(result.folders[1].files.map((node) => node.name)).toEqual(['Guide.md'])
  })

  it('keeps a directory-only match collapsed until manually expanded, then shows original contents', () => {
    const collapsed = filterFilesTree(root, 'archive')
    expect(collapsed.folders[0]).toMatchObject({ name: 'archive', folders: [], files: [] })
    expect(collapsed.autoExpandedKeys).not.toContain('/root/archive')

    const expanded = filterFilesTree(root, 'archive', new Set(['/root/archive']))
    expect(expanded.folders[0].files.map((node) => node.name)).toEqual(['Guide.md'])
  })

  it('supports empty file and folder terms without treating a truly empty query as filtered', () => {
    const allFiles = filterFilesTree(root, 'file:')
    expect(allFiles.files.map((node) => node.name)).toEqual(['README.md', 'plain.txt'])
    expect(allFiles.folders.map((node) => node.name)).toEqual(['guide', 'archive'])
    expect(allFiles.folders[0].folders).toEqual([])

    const allFolders = filterFilesTree(root, 'FoLdEr: ')
    expect(allFolders.files).toEqual([])
    expect(allFolders.folders.map((node) => node.name)).toEqual(['guide', 'archive', 'empty'])
    expect(allFolders.folders[0].folders.map((node) => node.name)).toEqual(['empty'])
    expect(allFolders.autoExpandedKeys).toEqual(new Set())

    const unfiltered = filterFilesTree(root, '')
    expect(unfiltered.active).toBe(false)
    expect(unfiltered.folders).toBe(root.folders)
    expect(unfiltered.files).toBe(root.files)
  })

  it('filters focused-pane Opened Files without requiring a Folder root', () => {
    const tabs = [
      { id: '1', filename: 'Guide.md', pathname: '/tmp/Guide.md' },
      { id: '2', filename: 'New Tab', pathname: '' }
    ] as IFileState[]
    expect(filterOpenedFiles(tabs, 'guide')).toEqual([tabs[0]])
    expect(filterOpenedFiles(tabs, 'file:new')).toEqual([tabs[1]])
    expect(filterOpenedFiles(tabs, 'folder:')).toEqual([])
  })
})
