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

// #5076: footnote definitions written one per line — the shape pandoc and
// GFM both emit, and what a .md drafted outside MarkText normally looks
// like — used to nest inside their predecessor instead of standing as
// siblings. Only the first definition became a footnote; the rest were
// swallowed into its body, and saving re-indented them by four spaces per
// nesting level.
//
// The footnote extension is off by default, and flipping it re-parses the
// markdown the current state serialises to — by which point the three
// definitions are already blank-line separated paragraphs, which parse
// correctly either way. So the preference has to be on *before* the file is
// read: open a probe document first, flip the preference, wait for the probe
// to re-render as a footnote, and only then open the document under test.

const PROBE_DOC = 'probe[^a]\n\n[^a]: probe definition\n'
const DOC = 'Body a[^1] b[^2] c[^3].\n\n[^1]: one\n[^2]: two\n[^3]: three\n'

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

test.describe('Adjacent footnote definitions (#5076)', () => {
  test.describe.configure({ mode: 'serial' })

  let app: ElectronApplication
  let page: Page
  let docPath: string
  let tempRoot: string
  let userDataDir: string

  test.beforeAll(async() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-e2e-5076-'))
    userDataDir = path.join(tempRoot, 'profile')
    fs.mkdirSync(userDataDir)
    docPath = path.join(tempRoot, 'adjacent-footnotes.md')
    fs.writeFileSync(docPath, DOC, 'utf-8')

    const launched = await launchWithMarkdown(PROBE_DOC, {
      suppressErrorDialog: true,
      userDataDir,
      userDataDirOwnership: 'caller'
    })
    app = launched.app
    page = launched.page

    await page.evaluate(() => {
      window.electron.ipcRenderer.send('mt::set-user-preference', { footnote: true })
    })
    // The probe turning into a figure proves the preference reached the
    // renderer before we hand it the document under test.
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

  test('renders each definition as its own top-level footnote', async() => {
    expect(await page.locator('figure.mu-footnote').count()).toBe(3)
    // Swallowing showed up as a footnote figure inside another one.
    expect(await page.locator('figure.mu-footnote figure.mu-footnote').count()).toBe(0)

    const identifiers = await page.evaluate(() =>
      [...document.querySelectorAll('figure.mu-footnote .mu-footnote-input')].map(
        el => el.textContent
      )
    )
    expect(identifiers).toEqual(['1', '2', '3'])
    expect(await footnoteSnapshot(page)).toEqual([
      { identifier: '1', body: 'one' },
      { identifier: '2', body: 'two' },
      { identifier: '3', body: 'three' }
    ])
  })

  test('saves and reopens the definitions with the same isolated profile', async() => {
    test.setTimeout(90_000)
    await page.locator('p.mu-paragraph').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('!')
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => fs.readFileSync(docPath, 'utf-8'), { timeout: 15000 })
      .toContain('Body a[^1] b[^2] c[^3].!')

    const saved = fs.readFileSync(docPath, 'utf-8')
    expect(saved.match(/^\[\^(?:1|2|3)\]: .+$/gm)).toEqual([
      '[^1]: one',
      '[^2]: two',
      '[^3]: three'
    ])
    // Swallowed definitions were written back one continuation level deeper
    // for each level of nesting.
    expect(saved).not.toMatch(/^ +\[\^/m)

    await expectNoRendererErrors(app)
    await app.close()

    const reopened = await launchElectron([docPath], {
      suppressErrorDialog: true,
      userDataDir,
      userDataDirOwnership: 'caller'
    })
    app = reopened.app
    page = reopened.page
    await waitForEditor(page)
    await waitForMenuReady(app)
    await expect.poll(() => page.locator('sup.mu-inline-footnote-identifier').count(), {
      timeout: 15000
    }).toBe(3)

    const reopenedFootnotes = await footnoteSnapshot(page)
    expect(reopenedFootnotes).toEqual([
      { identifier: '1', body: 'one' },
      { identifier: '2', body: 'two' },
      { identifier: '3', body: 'three' }
    ])
    expect(await page.locator('figure.mu-footnote figure.mu-footnote').count()).toBe(0)
    expect(await getMarkdownContent(page, app)).toBe(saved)
    expect(fs.readFileSync(docPath, 'utf-8')).toBe(saved)
    await expectNoRendererErrors(app)

    const evidenceDir = process.env.MARKTEXT_ADJACENT_EVIDENCE_DIR
    if (evidenceDir) {
      fs.mkdirSync(evidenceDir, { recursive: true })
      fs.writeFileSync(path.join(evidenceDir, 'electron-saved-adjacent-footnotes.md'), saved, 'utf-8')
      fs.writeFileSync(
        path.join(evidenceDir, 'electron-reopen-evidence.json'),
        JSON.stringify({
          savedMarkdown: saved,
          reopenedMarkdown: await getMarkdownContent(page, app),
          footnotes: reopenedFootnotes
        }, null, 2),
        'utf-8'
      )
    }
  })
})
