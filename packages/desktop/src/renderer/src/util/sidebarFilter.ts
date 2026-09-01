import type {
  TabDescriptor,
  TreeFileNode,
  TreeFolderNode,
  TreeNode
} from '@/components/sideBar/types'
import type { KeyedTocNode } from '@/util/tocKeys'

export type FilesFilterMode = 'all' | 'file' | 'folder'

export interface ParsedFilesQuery {
  active: boolean
  mode: FilesFilterMode
  term: string
}

export interface FilesTreeFilterResult {
  active: boolean
  mode: FilesFilterMode
  folders: TreeFolderNode[]
  files: TreeFileNode[]
  autoExpandedKeys: Set<string>
  matchedFolderKeys: Set<string>
}

export interface OutlineFilterResult {
  active: boolean
  nodes: KeyedTocNode[]
  autoExpandedKeys: Set<string>
}

const nodeKey = (node: Pick<TreeFolderNode, 'id' | 'pathname'>): string => node.id || node.pathname

const includesTerm = (value: unknown, term: string): boolean =>
  typeof value === 'string' && value.toLocaleLowerCase().includes(term)

export function parseFilesQuery(query: string): ParsedFilesQuery {
  if (query.length === 0) return { active: false, mode: 'all', term: '' }

  const prefix = /^(file|folder):/i.exec(query)
  if (!prefix) {
    return { active: true, mode: 'all', term: query.toLocaleLowerCase() }
  }

  return {
    active: true,
    mode: prefix[1].toLocaleLowerCase() as Exclude<FilesFilterMode, 'all'>,
    term: query.slice(prefix[0].length).trim().toLocaleLowerCase()
  }
}

export function filterOpenedFiles(tabs: TabDescriptor[], query: string): TabDescriptor[] {
  const parsed = parseFilesQuery(query)
  if (!parsed.active) return tabs
  if (parsed.mode === 'folder') return []
  return tabs.filter((tab) => includesTerm(tab.filename, parsed.term))
}

const copyFolder = (folder: TreeFolderNode): TreeFolderNode => ({
  ...folder,
  folders: folder.folders,
  files: folder.files
})

export function filterFilesTree(
  root: TreeNode | null,
  query: string,
  manuallyExpandedKeys: ReadonlySet<string> = new Set()
): FilesTreeFilterResult {
  const parsed = parseFilesQuery(query)
  const autoExpandedKeys = new Set<string>()
  const matchedFolderKeys = new Set<string>()
  if (!parsed.active || !root) {
    return {
      active: parsed.active,
      mode: parsed.mode,
      folders: root?.folders ?? [],
      files: root?.files ?? [],
      autoExpandedKeys,
      matchedFolderKeys
    }
  }

  interface FolderProjection {
    node: TreeFolderNode
    containsFileMatch: boolean
    containsResult: boolean
  }

  const visitFolder = (folder: TreeFolderNode): FolderProjection => {
    const key = nodeKey(folder)
    const folderMatches = parsed.mode !== 'file' && includesTerm(folder.name, parsed.term)
    if (folderMatches) matchedFolderKeys.add(key)

    const directFiles =
      parsed.mode === 'folder'
        ? []
        : folder.files.filter((file) => includesTerm(file.name, parsed.term))
    const childResults = folder.folders.map(visitFolder).filter((result) => result.containsResult)
    const containsFileMatch =
      directFiles.length > 0 || childResults.some((result) => result.containsFileMatch)

    if (
      parsed.mode === 'all' &&
      folderMatches &&
      !containsFileMatch &&
      manuallyExpandedKeys.has(key)
    ) {
      return { node: copyFolder(folder), containsFileMatch: false, containsResult: true }
    }

    const containsDescendantResult = childResults.length > 0
    const containsResult = folderMatches || containsFileMatch || containsDescendantResult
    if (!containsResult) {
      return { node: { ...folder, folders: [], files: [] }, containsFileMatch, containsResult }
    }

    // A directory-only match is a collapsed result. A file match wins when the
    // same directory also matches, so the matching file path remains visible.
    const directoryOnlyMatch = parsed.mode === 'all' && folderMatches && !containsFileMatch
    const folders = directoryOnlyMatch ? [] : childResults.map((result) => result.node)
    const files = directoryOnlyMatch ? [] : directFiles
    const shouldAutoExpand =
      parsed.mode === 'folder'
        ? !folderMatches && containsDescendantResult
        : !directoryOnlyMatch && (containsFileMatch || containsDescendantResult)
    if (shouldAutoExpand) {
      autoExpandedKeys.add(key)
    }

    return {
      node: { ...folder, folders, files },
      containsFileMatch,
      containsResult: true
    }
  }

  const folders = root.folders.map(visitFolder).filter((result) => result.containsResult)
  const files =
    parsed.mode === 'folder'
      ? []
      : root.files.filter((file) => includesTerm(file.name, parsed.term))

  return {
    active: true,
    mode: parsed.mode,
    folders: folders.map((result) => result.node),
    files,
    autoExpandedKeys,
    matchedFolderKeys
  }
}

export function filterOutline(nodes: KeyedTocNode[], query: string): OutlineFilterResult {
  if (query.length === 0) {
    return { active: false, nodes, autoExpandedKeys: new Set() }
  }

  const term = query.toLocaleLowerCase()
  const autoExpandedKeys = new Set<string>()

  const visit = (node: KeyedTocNode): KeyedTocNode | null => {
    const children = node.children.map(visit).filter((child): child is KeyedTocNode => !!child)
    const matches = includesTerm(node.label, term)
    if (!matches && children.length === 0) return null
    if (children.length > 0) autoExpandedKeys.add(node.key)
    return { ...node, children }
  }

  return {
    active: true,
    nodes: nodes.map(visit).filter((node): node is KeyedTocNode => !!node),
    autoExpandedKeys
  }
}
