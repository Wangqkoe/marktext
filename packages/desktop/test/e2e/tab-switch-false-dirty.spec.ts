import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  launchElectron,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const makeDocument = (name: string): string => `${name}\n\n\nsecond paragraph\n`

const openFile = async(app: ElectronApplication, filePath: string): Promise<void> => {
  await app.evaluate(({ BrowserWindow }, pathname) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.webContents.executeJavaScript(
      `window.electron.ipcRenderer.send('mt::open-file', ${JSON.stringify(pathname)})`
    )
  }, filePath)
}

const readDirtyState = async(page: Page, app: ElectronApplication) => {
  const renderer = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.tabs-container > li')).map((tab) => ({
      title: tab.textContent?.trim() ?? '',
      active: tab.classList.contains('active'),
      unsaved: tab.classList.contains('unsaved')
    }))
    const root = document.querySelector('#app') as
      | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
      | null
    const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, { tabs?: Array<{ filename?: string; isSaved?: boolean }> }> }
      | undefined
    const storeTabs = (pinia?._s?.get('editor')?.tabs ?? []).map((tab) => ({
      filename: tab.filename,
      isSaved: tab.isSaved
    }))
    return { tabs, storeTabs }
  })
  const documentEdited = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isDocumentEdited() ?? false
  )
  return { ...renderer, documentEdited }
}

test('switching a file whose WYSIWYG form normalizes blank lines keeps both documents clean', async() => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-tab-switch-dirty-'))
  const profile = path.join(tempRoot, 'profile')
  const first = path.join(tempRoot, '2026-09-07.md')
  const second = path.join(tempRoot, '2026-09-05.md')
  const firstSource = makeDocument('first')
  const secondSource = makeDocument('second')
  fs.writeFileSync(first, firstSource, 'utf8')
  fs.writeFileSync(second, secondSource, 'utf8')

  let app: ElectronApplication | undefined
  try {
    const launched = await launchElectron([first], {
      userDataDir: profile,
      userDataDirOwnership: 'caller'
    })
    const electronApp = launched.app
    app = electronApp
    const { page } = launched
    await waitForEditor(page)
    await waitForMenuReady(electronApp)

    await page.locator('.editor-component').click()
    await page.waitForTimeout(1_000)
    expect(await readDirtyState(page, electronApp)).toMatchObject({
      tabs: [{ active: true, unsaved: false }],
      storeTabs: [{ isSaved: true }],
      documentEdited: false
    })

    await openFile(electronApp, second)
    await expect(page.locator('.tabs-container > li')).toHaveCount(2)
    await page.waitForTimeout(1_000)
    expect(await readDirtyState(page, electronApp)).toMatchObject({
      tabs: [
        { unsaved: false },
        { active: true, unsaved: false }
      ],
      storeTabs: [{ isSaved: true }, { isSaved: true }],
      documentEdited: false
    })

    await page.locator('.tabs-container > li').first().click()
    await page.waitForTimeout(500)
    expect(await readDirtyState(page, electronApp)).toMatchObject({
      tabs: [
        { active: true, unsaved: false },
        { unsaved: false }
      ],
      storeTabs: [{ isSaved: true }, { isSaved: true }],
      documentEdited: false
    })

    await page.locator('.tabs-container > li').nth(1).click()
    await page.waitForTimeout(500)
    expect(await readDirtyState(page, electronApp)).toMatchObject({
      tabs: [
        { unsaved: false },
        { active: true, unsaved: false }
      ],
      storeTabs: [{ isSaved: true }, { isSaved: true }],
      documentEdited: false
    })

    expect(fs.readFileSync(first, 'utf8')).toBe(firstSource)
    expect(fs.readFileSync(second, 'utf8')).toBe(secondSource)
  } finally {
    if (app) await app.close().catch(() => {})
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})
