import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchElectron } from './helpers'

test('moves an explicit saved tab through the production renderer action seam', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-transfer-action-'))
  const file = path.join(profile, 'move.md')
  fs.writeFileSync(file, '# Move action content\n')
  const { app, page } = await launchElectron([file], { userDataDir: profile, userDataDirOwnership: 'caller' })
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    const tabId = await page.locator('.tabs-container li').first().getAttribute('data-id')
    expect(tabId).toBeTruthy()
    const result = await page.evaluate(async (id) => {
      const driver = window as unknown as {
        __mtMoveTabToNewWindow?: (input: { tabId: string; paneId: 'left' | 'right' }) => Promise<unknown>
      }
      return driver.__mtMoveTabToNewWindow?.({ tabId: id!, paneId: 'left' })
    }, tabId)
    expect(result).toMatchObject({ status: 'applied' })
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2)
    const target = (await app.windows()).find(candidate => candidate !== page)
    expect(target).toBeTruthy()
    await expect(target!.locator('.editor-with-tabs')).toBeVisible()
    await expect(target!.locator('body')).toContainText('Move action content')
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(profile, { recursive: true, force: true })
  }
})

test('rebinds the crash-draft endpoint after renderer reload', async() => {
  const { app, page } = await launchElectron()
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    const receipt = await page.evaluate(() => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', {
      kind: 'checkpoint',
      checkpoint: {
        documentId: 'electron-endpoint-test',
        documentRevision: 1,
        markdown: 'draft',
        view: { cursor: { line: 0, column: 0 }, selection: null }
      }
    })) as { durable: boolean; receipt?: string }
    expect(receipt).toMatchObject({ durable: true, receipt: expect.any(String) })
    await page.reload({ waitUntil: 'commit', timeout: 5000 })
    await page.waitForSelector('.editor-with-tabs', { timeout: 5000 })
    // A receipt issued to the pre-navigation endpoint is inert after reload;
    // the freshly bound renderer can checkpoint again with a new receipt.
    await expect(page.evaluate((staleReceipt) => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', {
      kind: 'saved', receipt: staleReceipt
    }), receipt.receipt)).resolves.toMatchObject({ durable: false })
    await expect(page.evaluate(() => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', {
      kind: 'checkpoint',
      checkpoint: {
        documentId: 'electron-endpoint-test',
        documentRevision: 2,
        markdown: 'after reload',
        view: { cursor: { line: 0, column: 0 }, selection: null }
      }
    }))).resolves.toMatchObject({ durable: true, receipt: expect.any(String) })
  } finally {
    await app.close().catch(() => {})
  }
})
