import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import {
  closeDiscardingChanges,
  enterSourceMode,
  exitSourceMode,
  launchWithMarkdown,
  placeCaretInEditor,
  sendIpcToRenderer,
  waitForMenuReady
} from './helpers'

// The WYSIWYG engine re-serializes documents in its own formatting. Opening,
// viewing, switching modes and saving without an edit must keep the file's
// own text byte for byte; only a real edit may rewrite it.

const original = [
  '# Report',
  '',
  '- Bullet one',
  '- Bullet two',
  '',
  '1. Ordered one',
  '',
  '| Name | Score |',
  '| :--- | ----: |',
  '| Ada  |    97 |',
  '',
  '',
  '<!-- radar:artifacts:R01:start -->',
  '**Evidence:** abstract  ',
  '<!-- radar:artifacts:R01:end -->',
  ''
].join('\n')

const save = async(app: ElectronApplication, page: Page): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
  await page.waitForTimeout(1500)
}

const isUnsaved = (page: Page): Promise<boolean> =>
  page.evaluate(() => !!document.querySelector('.editor-tabs li.unsaved'))

const sourceText = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const host = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { getValue(): string } })
      | null
    return host?.CodeMirror?.getValue() ?? null
  })

test.describe('Unedited documents keep their original text', () => {
  test('saving without an edit writes the file back unchanged', async() => {
    const { app, page, filePath } = await launchWithMarkdown(original)
    await waitForMenuReady(app)
    await page.waitForTimeout(800)
    expect(await isUnsaved(page)).toBe(false)

    await save(app, page)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
    await closeDiscardingChanges(app)
  })

  test('Source mode shows the original text and a mode round trip changes nothing', async() => {
    const { app, page, filePath } = await launchWithMarkdown(original)
    await waitForMenuReady(app)
    await enterSourceMode(page, app)
    expect(await sourceText(page)).toBe(original)
    await exitSourceMode(page, app)
    await page.waitForTimeout(500)
    expect(await isUnsaved(page)).toBe(false)

    await save(app, page)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
    await closeDiscardingChanges(app)
  })

  test('a real edit is dirty, and undoing it restores the original text', async() => {
    const { app, page, filePath } = await launchWithMarkdown(original)
    await waitForMenuReady(app)
    await placeCaretInEditor(page)
    await page.keyboard.type(' EDIT', { delay: 0 })
    await expect.poll(() => isUnsaved(page)).toBe(true)

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => isUnsaved(page)).toBe(false)
    await save(app, page)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original)
    await closeDiscardingChanges(app)
  })

  test('an edit in Source mode is saved exactly as typed', async() => {
    const { app, page, filePath } = await launchWithMarkdown(original)
    await waitForMenuReady(app)
    await enterSourceMode(page, app)
    // Remove one of the two blank lines before the first marker, which is also
    // what the WYSIWYG serialization does; it is still the user's edit.
    const edited = original.replace('\n\n\n<!--', '\n\n<!--')
    await page.evaluate((text) => {
      const host = document.querySelector('.source-code .CodeMirror') as unknown as {
        CodeMirror: { setValue(value: string): void }
      }
      host.CodeMirror.setValue(text)
    }, edited)
    await expect.poll(() => isUnsaved(page), { timeout: 5000 }).toBe(true)

    await save(app, page)
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(edited)
    await closeDiscardingChanges(app)
  })
})
