import { expect, test } from '@playwright/test'
import { launchElectron } from './helpers'

test('rebinds the crash-draft endpoint after renderer reload', async() => {
  const { app, page } = await launchElectron()
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    await expect(page.evaluate(() => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', {
      kind: 'checkpoint',
      checkpoint: {
        documentId: 'electron-endpoint-test',
        documentRevision: 1,
        markdown: 'draft',
        view: { cursor: { line: 0, column: 0 }, selection: null }
      }
    }))).resolves.toEqual({ durable: true })
    await page.reload({ waitUntil: 'commit', timeout: 5000 })
    await page.waitForSelector('.editor-with-tabs', { timeout: 5000 })
    await expect(page.evaluate(() => window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', {
      kind: 'checkpoint',
      checkpoint: {
        documentId: 'electron-endpoint-test',
        documentRevision: 2,
        markdown: 'after reload',
        view: { cursor: { line: 0, column: 0 }, selection: null }
      }
    }))).resolves.toEqual({ durable: true })
  } finally {
    await app.close().catch(() => {})
  }
})
