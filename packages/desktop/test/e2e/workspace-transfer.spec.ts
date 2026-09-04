import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { launchElectron, sendIpcToRenderer } from './helpers'

const tabSelector = '.tabs-container > li'

const workspaceBox = async(page: Page) => {
  const box = await page.locator('.editor-with-tabs').boundingBox()
  if (!box) throw new Error('workspace is not visible')
  return box
}

const moveToLeftEdge = async(page: Page, tab: ReturnType<Page['locator']>): Promise<void> => {
  const tabBox = await tab.boundingBox()
  const workspace = await workspaceBox(page)
  if (!tabBox) throw new Error('tab is not visible')
  await page.mouse.move(tabBox.x + Math.min(12, tabBox.width / 2), tabBox.y + tabBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(workspace.x + 4, workspace.y + workspace.height * 0.55, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.workspace-pane')).toHaveCount(2)
}

const appendInPane = async(page: Page, index: number, text: string): Promise<void> => {
  expect(await page.evaluate((paneIndex) => {
    const root = document.querySelectorAll<HTMLElement>('.workspace-pane .editor-component')[paneIndex]
    const target = root?.querySelector('span.mu-paragraph-content')
    if (!root || !target) return false
    root.focus()
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(false)
    const selection = window.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true }))
    return true
  }, index)).toBe(true)
  await page.keyboard.type(text)
}

const paneText = (page: Page, index: number): Promise<string> =>
  page.locator('.workspace-pane').nth(index).locator('.editor-component').innerText()

const moveTab = async(page: Page, tabId: string): Promise<void> => {
  await expect(page.evaluate(async(id) => {
    const driver = window as unknown as {
      __mtMoveTabToNewWindow?: (input: { tabId: string; paneId: 'left' | 'right' }) => Promise<unknown>
    }
    return driver.__mtMoveTabToNewWindow?.({ tabId: id, paneId: 'left' })
  }, tabId)).resolves.toMatchObject({ status: 'applied' })
}

const textAcrossWindows = async(app: ElectronApplication): Promise<string> =>
  (await Promise.all((await app.windows()).map(window => window.locator('body').innerText()))).join('\n')

const forceTerminate = async(app: ElectronApplication | undefined): Promise<void> => {
  if (!app || app.process().exitCode !== null) return
  const child = app.process()
  const exited = new Promise<void>(resolve => child.once('exit', resolve))
  const mainPid = await app.evaluate(() => process.pid).catch(() => undefined)
  if (mainPid === undefined || child.exitCode !== null) return
  try {
    execFileSync('taskkill', ['/PID', String(mainPid), '/T', '/F'])
  } catch {
    if (child.exitCode === null) throw new Error('could not terminate the Electron process tree')
  }
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
}

test('composes focused-pane routing, typed save transport, Move history, last-tab replacement, and Open', async() => {
  test.setTimeout(90_000)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-t11-transfer-'))
  const saved = path.join(userDataDir, 'saved.md')
  const opened = path.join(userDataDir, 'opened.md')
  fs.writeFileSync(saved, '# Saved source\n')
  fs.writeFileSync(opened, '# Opened after transfer\n')
  const { app, page } = await launchElectron([saved], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'Untitled pane\n')
    await expect(page.locator(tabSelector)).toHaveCount(2)
    await moveToLeftEdge(page, page.locator(tabSelector).nth(1))

    await appendInPane(page, 0, ' LEFT_STAYS')
    await expect.poll(() => paneText(page, 0)).toContain('LEFT_STAYS')
    await page.locator('.workspace-pane').nth(1).click()
    await appendInPane(page, 1, ' SAVED_THROUGH_TYPED_TRANSPORT')
    await expect.poll(() => paneText(page, 1)).toContain('SAVED_THROUGH_TYPED_TRANSPORT')
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => fs.readFileSync(saved, 'utf8')).toContain('SAVED_THROUGH_TYPED_TRANSPORT')

    await appendInPane(page, 1, ' RIGHT_UNDONE')
    await expect.poll(() => paneText(page, 1)).toContain('RIGHT_UNDONE')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => paneText(page, 1)).not.toContain('RIGHT_UNDONE')
    await expect.poll(() => paneText(page, 0)).toContain('LEFT_STAYS')

    const untitledTabId = await page.locator('.workspace-pane').nth(0).locator(tabSelector).first().getAttribute('data-id')
    if (!untitledTabId) throw new Error('untitled pane tab is missing its id')
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await moveTab(page, untitledTabId)
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2)
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    await expect(page.locator(tabSelector)).toHaveCount(1)
    await expect(page.locator('body')).toContainText('Saved source')
    await expect.poll(() => textAcrossWindows(app)).toContain('LEFT_STAYS')

    await appendInPane(page, 0, ' LAST_TAB_HISTORY')
    const savedTabId = await page.locator(tabSelector).first().getAttribute('data-id')
    if (!savedTabId) throw new Error('saved last tab is missing its id')
    await moveTab(page, savedTabId)
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(3)
    await expect(page.locator(tabSelector)).toHaveCount(1)
    await expect(page.locator(tabSelector)).toContainText('New Tab')

    let movedSaved: Page | undefined
    await expect.poll(async() => {
      movedSaved = undefined
      for (const candidate of await app.windows()) {
        if (candidate !== page && (await candidate.locator('body').innerText()).includes('LAST_TAB_HISTORY')) {
          movedSaved = candidate
          return true
        }
      }
      return false
    }).toBe(true)
    if (!movedSaved) throw new Error('moved saved window was not found')
    const movedSavedPage = movedSaved
    await expect(movedSavedPage.locator('.editor-component')).toContainText('LAST_TAB_HISTORY')
    const movedWindowId = await app.evaluate(async({ BrowserWindow }, marker) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (await window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(marker)})`)) return window.id
      }
      return undefined
    }, 'LAST_TAB_HISTORY')
    if (!movedWindowId) throw new Error('moved saved BrowserWindow was not found')
    await app.evaluate(({ BrowserWindow }, windowId) => {
      BrowserWindow.fromId(windowId)?.webContents.send('mt::editor-edit-action', 'undo')
    }, movedWindowId)
    await expect.poll(() => movedSavedPage.locator('.editor-component').innerText()).not.toContain('LAST_TAB_HISTORY')
    await app.evaluate(({ BrowserWindow }, windowId) => {
      BrowserWindow.fromId(windowId)?.webContents.send('mt::editor-edit-action', 'redo')
    }, movedWindowId)
    await expect.poll(() => movedSavedPage.locator('.editor-component').innerText()).toContain('LAST_TAB_HISTORY')

    await movedSavedPage.evaluate((filePath) => window.electron.ipcRenderer.send('mt::open-file', filePath, {}), opened)
    await expect(movedSavedPage.locator('body')).toContainText('Opened after transfer')
  } finally {
    await forceTerminate(app)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
