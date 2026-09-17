import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  AUDIT_TRIAGE_DISPOSITIONS,
  createAuditRun,
  parseFinalDispositionList,
  validateCandidateTemplateDispositions
} from './audit-fixtures'
import {
  getMarkdownContent,
  isLauncherManagedUserDataDir,
  launchElectron,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const candidateTemplatePath = path.resolve(
  __dirname,
  '../../../../.scratch/marktext-bug-audit-execution/candidate-record-template.md'
)

test.describe('First-batch audit fixture baseline', () => {
  test('F1-F4 are generated independently and preserve the canonical fixture', async() => {
    const run = createAuditRun()
    let app: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
    try {
      // F1 has no disk path: a fresh profile launches the application's blank,
      // unsaved document rather than recovering state from an earlier audit.
      const f1Profile = run.createIsolatedUserDataDir('f1-blank')
      const f1 = await launchElectron([], run.launchOptionsForUserDataDir(f1Profile))
      app = f1.app
      await waitForEditor(f1.page)
      await waitForMenuReady(f1.app)
      // A blank document serializes to at most its trailing newline.
      expect((await getMarkdownContent(f1.page, f1.app)).trim()).toBe('')
      await f1.app.close()
      app = undefined

      const canonical = path.resolve(__dirname, 'data', 'all-blocks.md')
      const canonicalBefore = fs.readFileSync(canonical)
      // F2 is a byte-for-byte temporary copy. Its source fixture is never a
      // target of an audit launch or save operation.
      expect(fs.readFileSync(run.fixtures.F2.documentPath as string)).toEqual(canonicalBefore)
      expect(run.fixtures.F2.documentPath).not.toBe(canonical)

      const f3Path = run.fixtures.F3.documentPath as string
      const f3Bytes = fs.readFileSync(f3Path)
      expect(f3Path).toContain('F3 path with spaces 中文')
      const f3Text = f3Bytes.toString('utf8')
      expect(f3Text).toContain('中文内容')
      expect(f3Text).toContain('😀')
      expect(f3Text).toContain('assets/audit-image.png')
      // F3's bytes are entirely CRLF-delimited. A single CRLF occurrence
      // could otherwise mask bare-LF line endings elsewhere in the fixture.
      const lfOffsets = Array.from(f3Bytes.entries())
        .filter(([, byte]) => byte === 0x0a)
        .map(([offset]) => offset)
      const crOffsets = Array.from(f3Bytes.entries())
        .filter(([, byte]) => byte === 0x0d)
        .map(([offset]) => offset)
      expect(lfOffsets.length).toBeGreaterThan(0)
      expect(crOffsets).toHaveLength(lfOffsets.length)
      expect(lfOffsets.every((offset) => offset > 0 && f3Bytes[offset - 1] === 0x0d)).toBe(true)
      expect(crOffsets.every((offset) => f3Bytes[offset + 1] === 0x0a)).toBe(true)
      expect(fs.existsSync(path.join(run.fixtures.F3.rootDir, 'assets', 'audit-image.png'))).toBe(true)

      const f4Path = run.fixtures.F4.documentPath as string
      const f4 = fs.readFileSync(f4Path, 'utf8')
      expect(f4.length).toBeGreaterThan(30000)
      expect(f4.match(/^## Section /gm)?.length).toBe(240)

      const independentOne = run.createIsolatedUserDataDir('document-integrity')
      const independentTwo = run.createIsolatedUserDataDir('tabs')
      expect(independentOne).not.toBe(independentTwo)
      expect(independentOne).not.toBe(run.sharedUserDataDir)
      expect(fs.existsSync(run.sharedUserDataDir)).toBe(true)

      const template = fs.readFileSync(candidateTemplatePath, 'utf8')
      expect(parseFinalDispositionList(template)).toEqual(AUDIT_TRIAGE_DISPOSITIONS)
      expect(() => validateCandidateTemplateDispositions(template)).not.toThrow()
    } finally {
      if (app) await app.close()
      run.cleanup()
    }
  })

  test('candidate disposition validation ignores unrelated prose and rejects duplicate list items', () => {
    const template = fs.readFileSync(candidateTemplatePath, 'utf8').replace(/\r\n/g, '\n')
    const missingButElsewhere = template.replace(
      '  - expected behavior\n',
      'The unrelated expected behavior prose remains elsewhere in the template.\n'
    )
    expect(missingButElsewhere).toContain('expected behavior')
    expect(() => validateCandidateTemplateDispositions(missingButElsewhere)).toThrow(
      /must exactly match/
    )

    const withDuplicate = template.replace(
      '  - expected behavior\n',
      '  - expected behavior\n  - expected behavior\n'
    )
    expect(() => validateCandidateTemplateDispositions(withDuplicate)).toThrow(
      /duplicate final dispositions/
    )
  })

  test('retained artifact runs retain caller-owned profiles and reject repository targets', async() => {
    const artifactParent = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-audit-retained-'))
    const priorArtifactDir = process.env.MARKTEXT_AUDIT_ARTIFACT_DIR
    let app: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
    let run: ReturnType<typeof createAuditRun> | undefined
    try {
      process.env.MARKTEXT_AUDIT_ARTIFACT_DIR = artifactParent
      run = createAuditRun()
      expect(run.artifactRetention).toBe('retained')

      const launched = await launchElectron([], run.launchOptionsForUserDataDir(run.sharedUserDataDir))
      app = launched.app
      await waitForEditor(launched.page)
      await waitForMenuReady(launched.app)
      expect(isLauncherManagedUserDataDir(run.sharedUserDataDir)).toBe(false)
      await app.close()
      app = undefined

      run.cleanup()
      expect(fs.existsSync(run.rootDir)).toBe(true)
      expect(fs.existsSync(run.sharedUserDataDir)).toBe(true)

      // The root itself and descendants are both rejected before mkdtemp can
      // write anything under the repository. This path is platform-neutral
      // and realpath-safe on Windows.
      process.env.MARKTEXT_AUDIT_ARTIFACT_DIR = path.resolve(__dirname, '../../../..')
      expect(() => createAuditRun()).toThrow(/outside the repository/)
      process.env.MARKTEXT_AUDIT_ARTIFACT_DIR = path.join(
        path.resolve(__dirname, '../../../..'),
        'packages'
      )
      expect(() => createAuditRun()).toThrow(/outside the repository/)
    } finally {
      if (app) await app.close()
      if (priorArtifactDir === undefined) delete process.env.MARKTEXT_AUDIT_ARTIFACT_DIR
      else process.env.MARKTEXT_AUDIT_ARTIFACT_DIR = priorArtifactDir
      fs.rmSync(artifactParent, { recursive: true, force: true })
    }
  })
})
