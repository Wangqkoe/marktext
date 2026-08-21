import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createAuditRun } from './audit-fixtures'
import { getMarkdownContent, launchElectron, waitForEditor, waitForMenuReady } from './helpers'

test.describe('First-batch audit fixture baseline', () => {
  test('F1-F4 are generated independently and preserve the canonical fixture', async() => {
    const run = createAuditRun()
    let app: Awaited<ReturnType<typeof launchElectron>>['app'] | undefined
    try {
      // F1 has no disk path: a fresh profile launches the application's blank,
      // unsaved document rather than recovering state from an earlier audit.
      const f1Profile = run.createIsolatedUserDataDir('f1-blank')
      const f1 = await launchElectron([], { userDataDir: f1Profile })
      app = f1.app
      await waitForEditor(f1.page)
      await waitForMenuReady(f1.app)
      expect(await getMarkdownContent(f1.page, f1.app)).toBe('')
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
      expect(f3Bytes.toString('utf8')).toContain('中文内容')
      expect(f3Bytes.toString('utf8')).toContain('😀')
      expect(f3Bytes.toString('utf8')).toContain('assets/audit-image.png')
      expect(f3Bytes.toString('utf8')).toContain('\r\n')
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
    } finally {
      if (app) await app.close()
      run.cleanup()
    }
  })
})
