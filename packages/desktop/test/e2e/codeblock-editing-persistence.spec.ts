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

const INITIAL = '```js\nconst seed = "🙂é"\n```\n'
const CODE_TEXT = 'const seed = "🙂é"\n\n你好'
const EXPECTED = `\`\`\`js\n${CODE_TEXT}\n\`\`\`\n`

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

const expectDocument = async(page: Page, app: ElectronApplication): Promise<void> => {
  await expect(page.locator('.editor-component .mu-codeblock-content').first()).toHaveText(CODE_TEXT)
  await expect.poll(() => workspaceMarkdown(page)).toBe(EXPECTED)
  expect(await getMarkdownContent(page, app)).toBe(EXPECTED)
}

test('trailing code lines and native IME survive save and same-profile reopen', async() => {
  test.setTimeout(90_000)
  let app: ElectronApplication | undefined
  let reopened: ElectronApplication | undefined

  try {
    const launched = await launchWithMarkdown(INITIAL, { suppressErrorDialog: true })
    app = launched.app
    const page = launched.page
    const code = page.locator('.editor-component .mu-codeblock-content').first()

    await code.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.imeSetComposition', { text: 'ni', selectionStart: 2, selectionEnd: 2 })
    await cdp.send('Input.imeSetComposition', { text: '你', selectionStart: 1, selectionEnd: 1 })
    await cdp.send('Input.insertText', { text: '你' })
    await page.waitForTimeout(200)
    await cdp.send('Input.imeSetComposition', { text: 'hao', selectionStart: 3, selectionEnd: 3 })
    await cdp.send('Input.imeSetComposition', { text: '好', selectionStart: 1, selectionEnd: 1 })
    await cdp.send('Input.insertText', { text: '好' })

    await expectDocument(page, app)
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => fs.readFileSync(launched.filePath, 'utf8')).toBe(EXPECTED)
    await expectNoRendererErrors(app)
    await app.close()
    app = undefined

    const second = await launchElectron([launched.filePath], {
      suppressErrorDialog: true,
      userDataDir: launched.userDataDir,
      userDataDirOwnership: 'caller'
    })
    reopened = second.app
    await waitForEditor(second.page)
    await waitForMenuReady(second.app)
    await expectDocument(second.page, second.app)
    expect(fs.readFileSync(launched.filePath, 'utf8')).toBe(EXPECTED)
    await expectNoRendererErrors(second.app)
  } finally {
    if (app) await closeDiscardingChanges(app).catch(() => undefined)
    if (reopened) await closeDiscardingChanges(reopened).catch(() => undefined)
  }
})
