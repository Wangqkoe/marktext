import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import fs from 'fs'
import { launchWithMarkdown, waitForMenuReady } from './helpers'

// #1861 — rewriting the open file on disk with byte-identical content (e.g. a
// git checkout that left it unchanged) fires a watcher 'change', but must NOT
// mark the tab unsaved or show the "file changed on disk" banner. A genuinely
// different on-disk content must still warn. Without autoSave the warning asks
// before reloading; the tab stays clean because a save would be rejected as a
// conflict until the change is reloaded.
//
// This drives the REAL watcher: it writes the actual file and lets the
// main-process chokidar watcher -> loadMarkdownFile -> renderer handler run,
// rather than hand-crafting the IPC payload (which would tautologically match).

const isDirty = (page: Page) =>
  page.evaluate(() => !!document.querySelector('.editor-tabs li.unsaved'))

const notificationText = (page: Page) =>
  page.evaluate(() => document.querySelector('.editor-notifications .msg')?.textContent ?? null)

// macOS uses polling + awaitWriteFinish (stabilityThreshold 1000ms), so a disk
// write surfaces ~1–2s later.
const WATCH_SETTLE = 2500

test.describe('Issue #1861 — content-identical file change', () => {
  test('an identical on-disk rewrite stays clean; a real change warns', async() => {
    const { app, page, filePath } = await launchWithMarkdown('hello\nworld\n')
    await waitForMenuReady(app)
    await page.waitForTimeout(500)
    expect(await isDirty(page)).toBe(false)

    // Identical bytes — the watcher fires, but the tab must stay clean.
    fs.writeFileSync(filePath, 'hello\nworld\n', 'utf-8')
    await page.waitForTimeout(WATCH_SETTLE)
    expect(await isDirty(page)).toBe(false)
    expect(await notificationText(page)).toBeNull()

    // A genuine content change warns without replacing the editor content.
    fs.writeFileSync(filePath, 'hello\nworld\nchanged\n', 'utf-8')
    await expect.poll(() => notificationText(page), { timeout: 8000 }).toContain('changed on disk')
    expect(await isDirty(page)).toBe(false)
    await expect(page.locator('.editor-component')).not.toContainText('changed')

    await app.close()
  })
})
