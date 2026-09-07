import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface RuntimeVersions {
  readonly electron: string
  readonly node: string
  readonly chromium: string
  readonly executablePath: string
}

const git = (projectRoot: string, args: readonly string[]): string =>
  execFileSync('git', [...args], { cwd: projectRoot, encoding: 'utf8' }).trim()

const gitStatus = (projectRoot: string): string =>
  execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: projectRoot,
    encoding: 'utf8'
  }).replace(/\r?\n$/, '')

const productionPaths = [
  'packages',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'electron-builder.yml',
  'electron.vite.config.ts'
]

const relativePath = (projectRoot: string, target: string): string =>
  path.relative(projectRoot, target).replaceAll(path.sep, '/')

const hashFile = (target: string): string =>
  createHash('sha256').update(fs.readFileSync(target)).digest('hex')

const hashDirectory = (root: string) => {
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (entry.isFile()) files.push(target)
    }
  }
  visit(root)
  files.sort((left, right) => relativePath(root, left).localeCompare(relativePath(root, right)))
  const digest = createHash('sha256')
  let totalBytes = 0
  for (const file of files) {
    const relative = relativePath(root, file)
    const contents = fs.readFileSync(file)
    totalBytes += contents.length
    digest.update(relative)
    digest.update('\0')
    digest.update(String(contents.length))
    digest.update('\0')
    digest.update(contents)
    digest.update('\0')
  }
  return {
    algorithm: 'sha256',
    format: 'sorted relative path, byte length, and file contents with NUL separators',
    sha256: digest.digest('hex'),
    fileCount: files.length,
    totalBytes
  }
}

export const captureMeasurementIdentity = (
  projectRoot: string,
  applicationSourceRevision: string,
  electronLauncherPath: string
) => {
  const applicationSourceSha = git(projectRoot, [
    'rev-parse',
    `${applicationSourceRevision}^{commit}`
  ])
  const harnessSha = git(projectRoot, ['rev-parse', 'HEAD'])
  const porcelain = gitStatus(projectRoot)
  const entries = porcelain ? porcelain.split(/\r?\n/) : []
  const committedProductionChanges = git(projectRoot, [
    'diff',
    '--name-only',
    `${applicationSourceSha}..HEAD`,
    '--',
    ...productionPaths
  ])
  const workingProductionChanges = git(projectRoot, [
    'diff',
    '--name-only',
    'HEAD',
    '--',
    ...productionPaths
  ])
  const productionChangedPaths = [committedProductionChanges, workingProductionChanges]
    .flatMap((value) => (value ? value.split(/\r?\n/) : []))
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
  const bundleRoot = path.join(projectRoot, 'packages', 'desktop', 'out')
  const electronPackageRoot = path.join(projectRoot, 'node_modules', 'electron')
  const electronPathFile = path.join(electronPackageRoot, 'path.txt')
  const electronExecutablePath = fs.existsSync(electronPathFile)
    ? path.join(
      electronPackageRoot,
      'dist',
      fs.readFileSync(electronPathFile, 'utf8').trim()
    )
    : electronLauncherPath
  if (!fs.statSync(bundleRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`application bundle is unavailable: ${bundleRoot}`)
  }
  if (!fs.statSync(electronExecutablePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Electron executable is unavailable: ${electronExecutablePath}`)
  }
  return {
    applicationSourceSha,
    harnessSha,
    applicationSourceWorkingTree: {
      isDirty: productionChangedPaths.length > 0,
      comparison: `${applicationSourceSha}..HEAD plus uncommitted production paths`,
      productionPaths,
      changedPaths: productionChangedPaths
    },
    harnessWorkingTree: {
      isDirty: entries.length > 0,
      porcelainEntries: entries
    },
    workingTree: {
      isDirty: entries.length > 0,
      porcelainEntries: entries
    },
    applicationBundle: {
      path: relativePath(projectRoot, bundleRoot),
      ...hashDirectory(bundleRoot)
    },
    electronLauncher: {
      path: relativePath(projectRoot, electronLauncherPath),
      algorithm: 'sha256',
      sha256: hashFile(electronLauncherPath),
      bytes: fs.statSync(electronLauncherPath).size
    },
    electronExecutable: {
      path: relativePath(projectRoot, electronExecutablePath),
      algorithm: 'sha256',
      sha256: hashFile(electronExecutablePath),
      bytes: fs.statSync(electronExecutablePath).size
    },
    runtimeVersions: null as RuntimeVersions | null
  }
}

const quotePowerShell = (value: string): string => `'${value.replaceAll("'", "''")}'`

export const buildPowerShellReproduction = (
  projectRoot: string,
  scriptPath: string,
  environment: Readonly<Record<string, string>>
) => ({
  shell: 'PowerShell',
  workingDirectory: projectRoot,
  environment,
  command: [
    ...Object.entries(environment).map(
      ([key, value]) => `$env:${key}=${quotePowerShell(value)}`
    ),
    `pnpm exec tsx ${quotePowerShell(scriptPath)}`
  ].join('; ')
})
