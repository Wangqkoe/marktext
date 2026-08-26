import { expect, test } from '@playwright/test'
import { launchElectron } from './helpers'

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
