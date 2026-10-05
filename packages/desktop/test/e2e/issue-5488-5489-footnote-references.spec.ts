import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  closeDiscardingChanges,
  expectNoRendererErrors,
  getMarkdownContent,
  launchElectron,
  launchWithMarkdown,
  sendIpcToRenderer,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const PROBE_DOC = 'probe[^a]\n\n[^a]: probe definition\n'
const DOC = [
  'Escaped \\[^1]. Real first[^1], second[^1], third[^1]. Code `[^1]`.',
  '',
  '```text',
  '[^1]',
  '```',
  '',
  '[^1]: full definition',
  ''
].join('\n')

interface FootnoteSnapshot {
  identifier: string | null
  body: string | null
}

const footnoteSnapshot = (page: Page): Promise<FootnoteSnapshot[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('figure.mu-footnote')].map((figure) => ({
      identifier: figure.querySelector(':scope > .mu-footnote-input')?.textContent ?? null,
      body: [...figure.children].find((child) => child.matches('p.mu-paragraph'))?.textContent?.trim() ?? null
    }))
  )

test.describe('Footnote reference export and persistence (#5488, #5489)', () => {
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let docPath: string
  let exportPath: string
  let tempRoot: string
  let userDataDir: string
  const ownedPids: number[] = []

  test.beforeAll(async() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-e2e-footnote-refs-'))
    userDataDir = path.join(tempRoot, 'profile')
    fs.mkdirSync(userDataDir)
    docPath = path.join(tempRoot, 'footnote-references.md')
    exportPath = path.join(tempRoot, 'footnote-references.html')
    fs.writeFileSync(docPath, DOC, 'utf-8')

    const launched = await launchWithMarkdown(PROBE_DOC, {
      suppressErrorDialog: true,
      userDataDir,
      userDataDirOwnership: 'caller'
    })
    app = launched.app
    page = launched.page
    ownedPids.push(app.process().pid!)

    await page.evaluate(() => {
      window.electron.ipcRenderer.send('mt::set-user-preference', { footnote: true })
    })
    await expect.poll(() => page.locator('figure.mu-footnote').count(), {
      timeout: 15000
    }).toBe(1)

    await app.evaluate(({ BrowserWindow, ipcMain }, target) => {
      const win = BrowserWindow.getAllWindows()[0]
      ipcMain.emit('app-open-file-by-id', win.id, target)
    }, docPath)
    await waitForEditor(page)
    await waitForMenuReady(app)
    await expect.poll(() => page.locator('sup.mu-inline-footnote-identifier').count(), {
      timeout: 15000
    }).toBe(3)
  })

  test.afterAll(async() => {
    if (app) await closeDiscardingChanges(app).catch(() => undefined)
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('saves, reopens and exports escaped and repeated references', async() => {
    test.setTimeout(120_000)
    const initialProcess = app.process()
    const ownedProcessExits: Array<{
      pid: number | undefined
      exitCode: number | null
      signalCode: NodeJS.Signals | null
    }> = []

    expect(await footnoteSnapshot(page)).toEqual([
      { identifier: '1', body: 'full definition' }
    ])
    expect(await getMarkdownContent(page, app)).toBe(DOC)

    await page.locator('p.mu-paragraph').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('!')
    const edited = await getMarkdownContent(page, app)
    expect(edited).toContain(
      'Escaped \\[^1]. Real first[^1], second[^1], third[^1]. Code `[^1]`.!'
    )
    expect(edited).toContain('```text\n[^1]\n```')
    expect(edited).toContain('[^1]: full definition')

    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => fs.readFileSync(docPath, 'utf-8'), { timeout: 15000 })
      .toBe(edited)
    const saved = fs.readFileSync(docPath, 'utf-8')
    expect(saved).toContain('Escaped \\[^1].')
    await expectNoRendererErrors(app)

    await app.close()
    expect(initialProcess.exitCode !== null || initialProcess.signalCode !== null).toBe(true)
    ownedProcessExits.push({
      pid: initialProcess.pid,
      exitCode: initialProcess.exitCode,
      signalCode: initialProcess.signalCode
    })
    const reopened = await launchElectron([docPath], {
      suppressErrorDialog: true,
      userDataDir,
      userDataDirOwnership: 'caller'
    })
    app = reopened.app
    page = reopened.page
    const reopenedProcess = app.process()
    ownedPids.push(reopenedProcess.pid!)
    await waitForEditor(page)
    await waitForMenuReady(app)
    await expect.poll(() => page.locator('sup.mu-inline-footnote-identifier').count(), {
      timeout: 15000
    }).toBe(3)

    const reopenedMarkdown = await getMarkdownContent(page, app)
    expect(reopenedMarkdown).toBe(saved)
    expect(fs.readFileSync(docPath, 'utf-8')).toBe(saved)
    expect(await footnoteSnapshot(page)).toEqual([
      { identifier: '1', body: 'full definition' }
    ])

    await app.evaluate(({ BrowserWindow, dialog }, targetPath) => {
      const win = BrowserWindow.getAllWindows()[0]
      dialog.showSaveDialog = async() => ({ canceled: false, filePath: targetPath })
      win.webContents.send('mt::show-export-dialog', 'styledHtml')
    }, exportPath)
    await page.locator('.print-settings-dialog .button-primary').click()
    await expect.poll(() => fs.existsSync(exportPath), { timeout: 30000 }).toBe(true)

    const exported = fs.readFileSync(exportPath, 'utf-8')
    expect(exported).toContain('Escaped [^1].')
    expect(exported).toContain('<code>[^1]</code>')
    expect(exported).toContain('<code class="language-text">[^1]')
    expect([...exported.matchAll(/id="(fnref-[^"]+)"/g)].map(match => match[1])).toEqual([
      'fnref-1',
      'fnref-1-2',
      'fnref-1-3'
    ])
    expect([...exported.matchAll(/href="#(fnref-[^"]+)" class="footnote-backref"/g)]
      .map(match => match[1])).toEqual(['fnref-1', 'fnref-1-2', 'fnref-1-3'])
    expect(exported.match(/<li id="fn-1">/g)).toHaveLength(1)
    expect(exported).not.toContain('data-identifier')
    expect(exported).not.toContain('<div class="footnote-block"')
    expect(exported).not.toMatch(/<span class="footnote-ref"/)
    await expectNoRendererErrors(app)

    await app.close()
    expect(reopenedProcess.exitCode !== null || reopenedProcess.signalCode !== null).toBe(true)
    ownedProcessExits.push({
      pid: reopenedProcess.pid,
      exitCode: reopenedProcess.exitCode,
      signalCode: reopenedProcess.signalCode
    })

    const evidenceDir = process.env.MARKTEXT_FOOTNOTE_REFERENCE_EVIDENCE_DIR
    if (evidenceDir) {
      fs.mkdirSync(evidenceDir, { recursive: true })
      fs.writeFileSync(path.join(evidenceDir, 'electron-saved-footnote-references.md'), saved, 'utf-8')
      fs.writeFileSync(path.join(evidenceDir, 'electron-exported-footnote-references.html'), exported, 'utf-8')
      fs.writeFileSync(
        path.join(evidenceDir, 'electron-reopen-evidence.json'),
        JSON.stringify({ ownedPids, ownedProcessExits, savedMarkdown: saved, reopenedMarkdown }, null, 2),
        'utf-8'
      )
    }
  })
})
