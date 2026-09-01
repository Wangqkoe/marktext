export interface FolderMenuTarget {
  readonly kind: 'open' | 'close'
  readonly directoryPath?: string
  readonly enabled: boolean
}

export interface FolderPathOperations {
  dirname(pathname: string): string
  normalize(pathname: string): string
  isSamePath(pathA: string, pathB: string): boolean
}

const rendererPathOperations = (): FolderPathOperations => ({
  dirname: (pathname) => window.path.dirname(pathname),
  normalize: (pathname) => window.path.normalize(pathname),
  isSamePath: (pathA, pathB) => window.fileUtils.isSamePathSync(pathA, pathB)
})

export const resolveFolderMenuTarget = (
  fileKey?: string,
  folderRoot?: string,
  paths: FolderPathOperations = rendererPathOperations()
): FolderMenuTarget => {
  if (!fileKey) return { kind: 'open', enabled: false }

  const directoryPath = paths.normalize(paths.dirname(fileKey))
  const normalizedRoot = folderRoot ? paths.normalize(folderRoot) : undefined
  if (normalizedRoot && paths.isSamePath(directoryPath, normalizedRoot)) {
    return { kind: 'close', directoryPath, enabled: true }
  }
  return { kind: 'open', directoryPath, enabled: true }
}
