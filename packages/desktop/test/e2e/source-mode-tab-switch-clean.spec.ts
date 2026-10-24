import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { enterSourceMode, launchElectron, waitForEditor, waitForMenuReady } from './helpers'

// Muya serializes this text differently from the bytes on disk (it drops the
// extra blank line after </details> and adds one after the comment). Leaving
// a Source mode tab untouched used to report Muya's serialization as a Source
// edit, so the document turned dirty and quitting stopped at a save prompt.
const UNNORMALIZED = [
  '# Untouched in Source mode',
  '',
  '<details>',
  '<summary>More</summary>',
  '',
  'Body.',
  '',
  '</details>',
  '',
  '',
  '<!-- note:start -->',
  '**Evidence:** abstract  ',
  '<!-- note:end -->',
  ''
].join('\n')

const tabStates = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('.tabs-container > li')].map((li) =>
      (li.classList.contains('unsaved') ? '*' : '') +
      (li.querySelector('.tab-filename')?.textContent?.trim() ?? '')
    )
  )

const selectTab = (page: Page, filename: string): Promise<void> =>
  page.evaluate((name) => {
    const tab = [...document.querySelectorAll('.tabs-container > li')].find(
      (li) => li.querySelector('.tab-filename')?.textContent?.trim() === name
    )
    const button = tab?.querySelector('.tab-select') as HTMLButtonElement | null
    if (!button) throw new Error('tab not found: ' + name)
    button.click()
  }, filename)

const quitsWithin = async(app: ElectronApplication, ms: number): Promise<boolean> => {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), ms) })
  const closed = await Promise.race([app.close().then(() => true), timeout])
  clearTimeout(timer)
  if (!closed) app.process().kill()
  return closed
}

test('leaving an untouched Source mode tab keeps the document clean and lets the app quit', async() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-source-clean-'))
  const untouched = path.join(dir, 'untouched.md')
  const other = path.join(dir, 'other.md')
  fs.writeFileSync(untouched, UNNORMALIZED, 'utf-8')
  fs.writeFileSync(other, '# Other tab\n\nShort.\n', 'utf-8')
  try {
    const { app, page } = await launchElectron([other])
    await waitForEditor(page)
    await waitForMenuReady(app)
    await page.evaluate((p) => window.electron.ipcRenderer.send('mt::open-file', p, {}), untouched)
    await expect(page.locator('.editor-component h1')).toContainText('Untouched in Source mode')

    await enterSourceMode(page, app)
    await selectTab(page, 'other.md')
    await expect.poll(() => tabStates(page)).toContain('other.md')
    await selectTab(page, 'untouched.md')
    await page.waitForSelector('.source-code .CodeMirror', { state: 'attached' })
    await selectTab(page, 'other.md')
    // Let any late flush land before reading the tab state.
    await page.waitForTimeout(1000)

    expect(await tabStates(page)).toEqual(['other.md', 'untouched.md'])
    expect(fs.readFileSync(untouched, 'utf-8')).toBe(UNNORMALIZED)
    expect(await quitsWithin(app, 15000)).toBe(true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
