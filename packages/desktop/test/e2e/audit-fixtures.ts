import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { LaunchOptions } from './helpers'

const canonicalAllBlocksPath = path.resolve(__dirname, 'data', 'all-blocks.md')
const repositoryRoot = fs.realpathSync.native(path.resolve(__dirname, '../../../..'))

export const AUDIT_TRIAGE_DISPOSITIONS = [
  'confirmed deterministic',
  'confirmed intermittent',
  'high-severity pending',
  'inconclusive',
  'expected behavior',
  'environment failure',
  'automation/capture artifact',
  'product decision',
  'duplicate/baseline regression'
] as const

export type AuditTriageDisposition = (typeof AUDIT_TRIAGE_DISPOSITIONS)[number]
export type AuditFixtureId = 'F1' | 'F2' | 'F3' | 'F4'

export interface AuditFixture {
  id: AuditFixtureId
  /** Undefined for F1, which deliberately represents a new unsaved tab. */
  documentPath?: string
  rootDir: string
}

export interface AuditRun {
  rootDir: string
  fixtures: Record<AuditFixtureId, AuditFixture>
  /** One profile intentionally retained for a restart or persistence flow. */
  sharedUserDataDir: string
  createIsolatedUserDataDir: (flowName: string) => string
  /**
   * Audit profiles are caller-owned. Pass these options to launchElectron so
   * its process-exit cleanup cannot delete retained evidence.
   */
  launchOptionsForUserDataDir: (userDataDir: string) => LaunchOptions
  /** Retained runs preserve their root; disposable runs remove it. */
  artifactRetention: 'disposable' | 'retained'
  cleanup: () => void
}

const sanitizePathSegment = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '-')

const isRepositoryPath = (candidate: string): boolean => {
  const relative = path.relative(repositoryRoot, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

const getRetainedArtifactParent = (): string | undefined => {
  const configuredRoot = process.env.MARKTEXT_AUDIT_ARTIFACT_DIR
  if (!configuredRoot) return undefined
  // The documented contract requires an existing parent. realpath both
  // resolves Windows casing/junctions and prevents a relative path from
  // bypassing the repository containment guard.
  const canonicalRoot = fs.realpathSync.native(path.resolve(configuredRoot))
  if (isRepositoryPath(canonicalRoot)) {
    throw new Error(
      'MARKTEXT_AUDIT_ARTIFACT_DIR must be outside the repository to protect tracked and user-owned files.'
    )
  }
  return canonicalRoot
}

const writeTinyPng = (filePath: string): void => {
  // A valid 1x1 transparent PNG. Its only purpose is to make F3's relative
  // image reference resolvable without depending on a user-owned image.
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  fs.writeFileSync(filePath, Buffer.from(png, 'base64'))
}

const createF3 = (rootDir: string): AuditFixture => {
  const fixtureDir = path.join(rootDir, 'F3 path with spaces 中文')
  const assetsDir = path.join(fixtureDir, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  writeTinyPng(path.join(assetsDir, 'audit-image.png'))

  const documentPath = path.join(fixtureDir, 'CJK 中文 emoji 😀.md')
  const markdown = [
    '# F3 路径与编码',
    '',
    '中文内容、English words 和 emoji 😀 🚀。',
    '',
    '![相对图片](assets/audit-image.png)',
    ''
  ].join('\r\n')
  fs.writeFileSync(documentPath, markdown, 'utf8')
  return { id: 'F3', documentPath, rootDir: fixtureDir }
}

const createF4 = (rootDir: string, sections = 240): AuditFixture => {
  const fixtureDir = path.join(rootDir, 'F4-medium-large')
  fs.mkdirSync(fixtureDir, { recursive: true })
  const lines: string[] = ['# F4 generated stability document', '']
  for (let index = 1; index <= sections; index++) {
    lines.push(`## Section ${index}`)
    lines.push(
      `Generated audit paragraph ${index}: stable input scrolling source-mode and save coverage. 中文 ${index} 😀.`
    )
    lines.push('')
    lines.push('| Column A | Column B |')
    lines.push('| --- | --- |')
    lines.push(`| ${index} | audit fixture row ${index} |`)
    lines.push('')
  }
  const documentPath = path.join(fixtureDir, 'generated-medium-large.md')
  fs.writeFileSync(documentPath, lines.join('\n'), 'utf8')
  return { id: 'F4', documentPath, rootDir: fixtureDir }
}

/**
 * Creates a complete, disposable audit input set. The root can be preserved
 * with MARKTEXT_AUDIT_ARTIFACT_DIR when a manual run needs retained evidence;
 * callers otherwise receive a unique OS-temp directory and must call cleanup.
 */
export const createAuditRun = (): AuditRun => {
  const retainedArtifactParent = getRetainedArtifactParent()
  const rootDir = retainedArtifactParent
    ? fs.mkdtempSync(path.join(retainedArtifactParent, 'marktext-audit-'))
    : fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-audit-'))
  const fixturesRoot = path.join(rootDir, 'fixtures')
  const profilesRoot = path.join(rootDir, 'user-data')
  fs.mkdirSync(fixturesRoot, { recursive: true })
  fs.mkdirSync(profilesRoot, { recursive: true })

  const f2Dir = path.join(fixturesRoot, 'F2-canonical-all-blocks-copy')
  fs.mkdirSync(f2Dir, { recursive: true })
  const f2DocumentPath = path.join(f2Dir, 'all-blocks.md')
  fs.copyFileSync(canonicalAllBlocksPath, f2DocumentPath)

  const fixtures: Record<AuditFixtureId, AuditFixture> = {
    F1: { id: 'F1', rootDir: path.join(fixturesRoot, 'F1-blank-unsaved') },
    F2: { id: 'F2', documentPath: f2DocumentPath, rootDir: f2Dir },
    F3: createF3(fixturesRoot),
    F4: createF4(fixturesRoot)
  }
  fs.mkdirSync(fixtures.F1.rootDir, { recursive: true })

  const sharedUserDataDir = path.join(profilesRoot, 'shared-restart-persistence')
  fs.mkdirSync(sharedUserDataDir, { recursive: true })

  return {
    rootDir,
    fixtures,
    sharedUserDataDir,
    createIsolatedUserDataDir: (flowName: string): string => {
      const name = sanitizePathSegment(flowName) || 'unnamed-flow'
      return fs.mkdtempSync(path.join(profilesRoot, `isolated-${name}-`))
    },
    launchOptionsForUserDataDir: (userDataDir: string): LaunchOptions => ({
      userDataDir,
      userDataDirOwnership: 'caller'
    }),
    artifactRetention: retainedArtifactParent ? 'retained' : 'disposable',
    cleanup: () => {
      if (!retainedArtifactParent) fs.rmSync(rootDir, { recursive: true, force: true })
    }
  }
}
