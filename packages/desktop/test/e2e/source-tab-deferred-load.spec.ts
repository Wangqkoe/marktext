import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  closeDiscardingChanges,
  enterSourceMode,
  exitSourceMode,
  getMarkdownContent,
  launchWithMarkdown,
  placeCaretInEditor,
  sendIpcToRenderer,
  waitForMenuReady
} from './helpers'

// Switching to a tab whose view is in Source mode must not load that document
// into the WYSIWYG engine hidden under CodeMirror; it is loaded only when the
// engine is needed again, such as when leaving Source mode.

const sourceValue = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const host = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { getValue(): string } })
      | null
    return host?.CodeMirror?.getValue() ?? null
  })

const switchToTab = async(app: ElectronApplication, index: number): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::switch-tab-by-index', index)
}

test.describe('Source mode tabs load the hidden WYSIWYG engine on demand', () => {
  test('switching to a Source tab keeps the hidden engine tree and leaving Source loads the document', async() => {
    const { app, page } = await launchWithMarkdown('# First document\n\nfirst body\n')
    await waitForMenuReady(app)

    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# Second document\n\nsecond body\n')
    await expect(page.locator('.editor-component h1')).toContainText('Second document')
    await enterSourceMode(page, app)
    await expect.poll(() => sourceValue(page)).toContain('second body')

    await switchToTab(app, 0)
    await expect(page.locator('.source-code .CodeMirror')).toHaveCount(0)
    await expect(page.locator('.editor-component h1')).toContainText('First document')
    await page.evaluate(() => {
      const w = window as typeof window & { __firstHeading?: Element | null }
      w.__firstHeading = document.querySelector('.editor-component h1')
    })

    await switchToTab(app, 1)
    await expect.poll(() => sourceValue(page)).toContain('second body')
    const retained = await page.evaluate(() => {
      const w = window as typeof window & { __firstHeading?: Element | null }
      return !!w.__firstHeading?.isConnected
    })
    expect(retained).toBe(true)

    await exitSourceMode(page, app)
    await expect(page.locator('.editor-component h1')).toContainText('Second document')
    await expect(page.locator('.editor-component')).toContainText('second body')
    await closeDiscardingChanges(app)
  })

  test('a Source edit on a deferred tab is kept and undone as one step after leaving Source', async() => {
    const { app, page } = await launchWithMarkdown('# First document\n\nfirst body\n')
    await waitForMenuReady(app)
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'second body\n')
    await enterSourceMode(page, app)
    await switchToTab(app, 0)
    await expect(page.locator('.editor-component h1')).toContainText('First document')
    await switchToTab(app, 1)
    await expect.poll(() => sourceValue(page)).toContain('second body')

    await page.evaluate(() => {
      const host = document.querySelector('.source-code .CodeMirror') as unknown as {
        CodeMirror: { setValue(value: string): void }
      }
      host.CodeMirror.setValue('second body\n\nSOURCE EDIT\n')
    })
    await page.waitForTimeout(500)
    await exitSourceMode(page, app)
    await expect(page.locator('.editor-component')).toContainText('SOURCE EDIT')

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(async() => (await getMarkdownContent(page, app)).trim(), { timeout: 5000 }).toBe('second body')
    await closeDiscardingChanges(app)
  })

  test('WYSIWYG edits still reach the document after returning from a deferred Source tab', async() => {
    const { app, page } = await launchWithMarkdown('first body\n')
    await waitForMenuReady(app)
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'second body\n')
    await enterSourceMode(page, app)
    await switchToTab(app, 0)
    await expect(page.locator('.editor-component')).toContainText('first body')

    await placeCaretInEditor(page)
    await page.keyboard.type(' TYPED', { delay: 0 })
    await expect.poll(async() => getMarkdownContent(page, app), { timeout: 5000 }).toContain('TYPED')
    await closeDiscardingChanges(app)
  })
})
