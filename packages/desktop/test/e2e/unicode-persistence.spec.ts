import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import fs from 'node:fs'
import {
  closeDiscardingChanges,
  expectNoRendererErrors,
  getMarkdownContent,
  launchElectron,
  launchWithMarkdown,
  sendIpcToRenderer,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
const INITIAL = `中文🙂👍🏽🇨🇳e\u0301${FAMILY}y\n`
const EXPECTED = `中文🙂👍🏽🇨🇳e\u0301${FAMILY}\n`

const workspaceMarkdown = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => {
    const driver = window as typeof window & {
      __mtWorkspaceSnapshot?: () => {
        projection: { focusedPaneId: string; panes: Array<{ paneId: string; activeViewId?: string }> }
        documents: Array<{ viewId: string; markdown: string }>
      }
    }
    const snapshot = driver.__mtWorkspaceSnapshot?.()
    const activeViewId = snapshot?.projection.panes.find(
      (pane) => pane.paneId === snapshot.projection.focusedPaneId
    )?.activeViewId
    return snapshot?.documents.find((document) => document.viewId === activeViewId)?.markdown
  })

test('compound Unicode survives editing, saving, and reopening', async() => {
  test.setTimeout(90_000)
  let app: ElectronApplication | undefined
  let reopened: ElectronApplication | undefined

  try {
    const launched = await launchWithMarkdown(INITIAL, { suppressErrorDialog: true })
    app = launched.app
    const page = launched.page

    await page.locator('.editor-component p.mu-paragraph').first().click()
    await page.keyboard.press('End')
    await page.keyboard.press('Backspace')
    await expect(page.locator('.editor-component')).toContainText(EXPECTED.trim())
    await expect.poll(() => workspaceMarkdown(page)).toBe(EXPECTED)
    expect(await getMarkdownContent(page, app)).toBe(EXPECTED)

    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => fs.readFileSync(launched.filePath, 'utf8')).toBe(EXPECTED)
    await expectNoRendererErrors(app)
    await app.close()
    app = undefined

    const second = await launchElectron([launched.filePath], { suppressErrorDialog: true })
    reopened = second.app
    await waitForEditor(second.page)
    await waitForMenuReady(second.app)
    await expect(second.page.locator('.editor-component')).toContainText(EXPECTED.trim())
    await expect.poll(() => workspaceMarkdown(second.page)).toBe(EXPECTED)
    expect(await getMarkdownContent(second.page, second.app)).toBe(EXPECTED)
    expect(fs.readFileSync(launched.filePath, 'utf8')).toBe(EXPECTED)
    await expectNoRendererErrors(second.app)
  } finally {
    if (app) await closeDiscardingChanges(app).catch(() => undefined)
    if (reopened) await closeDiscardingChanges(reopened).catch(() => undefined)
  }
})
