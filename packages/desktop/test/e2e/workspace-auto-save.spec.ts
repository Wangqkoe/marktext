import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import {
  closeDiscardingChanges,
  launchWithMarkdown,
  placeCaretInEditor,
  sendIpcToRenderer,
  setSourceMarkdown,
  waitForMenuReady
} from './helpers'

const isUnsaved = (page: Page): Promise<boolean> =>
  page.evaluate(() => !!document.querySelector('.editor-tabs li.unsaved'))

const setAutoSave = async(app: ElectronApplication, page: Page, autoSave: boolean): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::user-preference', { autoSave, autoSaveDelay: 200 })
  await page.waitForTimeout(100)
}

test.describe('Workspace auto-save', () => {
  test('saves a WYSIWYG edit after the delay and clears the unsaved marker', async() => {
    const { app, page, filePath } = await launchWithMarkdown('original text\n')
    await waitForMenuReady(app)
    await setAutoSave(app, page, true)

    await placeCaretInEditor(page)
    await page.keyboard.type(' AUTO', { delay: 0 })
    await expect.poll(() => fs.readFileSync(filePath, 'utf-8'), { timeout: 5000 }).toContain('AUTO')
    await expect.poll(() => isUnsaved(page)).toBe(false)
    await closeDiscardingChanges(app)
  })

  test('saves a Source mode edit', async() => {
    const { app, page, filePath } = await launchWithMarkdown('original text\n')
    await waitForMenuReady(app)
    await setAutoSave(app, page, true)

    await setSourceMarkdown(page, app, 'original text\n\nSOURCE AUTO\n')
    await expect.poll(() => fs.readFileSync(filePath, 'utf-8'), { timeout: 5000 }).toContain('SOURCE AUTO')
    await closeDiscardingChanges(app)
  })

  test('does not save when auto-save is off', async() => {
    const { app, page, filePath } = await launchWithMarkdown('original text\n')
    await waitForMenuReady(app)
    await setAutoSave(app, page, false)

    await placeCaretInEditor(page)
    await page.keyboard.type(' MANUAL', { delay: 0 })
    await page.waitForTimeout(1500)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original text\n')
    expect(await isUnsaved(page)).toBe(true)
    await closeDiscardingChanges(app)
  })

  test('never overwrites an external change made while an edit is pending', async() => {
    const { app, page, filePath } = await launchWithMarkdown('original text\n')
    await waitForMenuReady(app)
    // A long delay keeps the edit pending while the file changes on disk.
    await sendIpcToRenderer(app, 'mt::user-preference', { autoSave: true, autoSaveDelay: 3000 })
    await page.waitForTimeout(1500)

    await placeCaretInEditor(page)
    await page.keyboard.type(' LOCAL', { delay: 0 })
    await expect.poll(() => isUnsaved(page)).toBe(true)
    fs.writeFileSync(filePath, 'external change\n', 'utf-8')

    await page.waitForTimeout(5000)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('external change\n')
    await closeDiscardingChanges(app)
  })
})
