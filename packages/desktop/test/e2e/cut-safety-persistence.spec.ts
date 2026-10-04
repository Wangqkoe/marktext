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

const INITIAL = [
  '- alpha',
  '- remove',
  '',
  '> before',
  '>',
  '> | h |',
  '> | --- |',
  '> | 12 |',
  '>',
  '> quote tail',
  '',
  'after',
  ''
].join('\n')

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

const selectFromTextToText = async(
  page: Page,
  startText: string,
  startOffset: number,
  endText: string,
  endOffset: number
): Promise<void> => {
  const selected = await page.evaluate(
    ({ startText, startOffset, endText, endOffset }) => {
      const editor = document.querySelector('.editor-component') as HTMLElement | null
      const contents = [
        ...document.querySelectorAll<HTMLElement>(
          '.editor-component .mu-paragraph-content, .editor-component .mu-table-cell-content'
        )
      ]
      const start = contents.find((node) => node.textContent === startText)
      const end = contents.find((node) => node.textContent === endText)
      if (!editor || !start || !end) throw new Error('cut selection endpoints are unavailable')
      editor.focus()
      type Block = {
        path: number[]
        text: string
        muya: {
          focus(): void
          hasFocus(): boolean
          editor: {
            selection: {
              setSelection(
                anchor: { offset: number; block: Block; path: number[] },
                focus: { offset: number; block: Block; path: number[] }
              ): void
              getSelection(): {
                anchor: { offset: number; block: Block }
                focus: { offset: number; block: Block }
              } | null
            }
          }
        }
      }
      const startBlock = (start as unknown as { __MUYA_BLOCK__?: Block }).__MUYA_BLOCK__
      const endBlock = (end as unknown as { __MUYA_BLOCK__?: Block }).__MUYA_BLOCK__
      if (!startBlock || !endBlock) throw new Error('Muya block endpoints are unavailable')
      startBlock.muya.focus()
      startBlock.muya.editor.selection.setSelection(
        { offset: startOffset, block: startBlock, path: startBlock.path },
        { offset: endOffset, block: endBlock, path: endBlock.path }
      )
      const live = startBlock.muya.editor.selection.getSelection()
      return {
        selected: document.getSelection()?.toString() ?? '',
        hasFocus: startBlock.muya.hasFocus(),
        anchor: live && `${live.anchor.block.text}@${live.anchor.offset}`,
        focus: live && `${live.focus.block.text}@${live.focus.offset}`
      }
    },
    { startText, startOffset, endText, endOffset }
  )
  expect(selected.selected).toContain('remove')
  expect(selected.selected).toContain('12'.slice(0, endOffset))
  expect(selected.hasFocus).toBe(true)
  expect(selected.anchor).toBe(`${startText}@${startOffset}`)
  expect(selected.focus).toBe(`${endText}@${endOffset}`)
}

const tableCellTexts = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('.editor-component .mu-table-cell-content')].map(
      (cell) => cell.textContent ?? ''
    )
  )

test('cross-block cut into a nested table survives save and reopen', async() => {
  test.setTimeout(90_000)
  let app: ElectronApplication | undefined
  let reopened: ElectronApplication | undefined

  try {
    const launched = await launchWithMarkdown(INITIAL, { suppressErrorDialog: true })
    app = launched.app
    const page = launched.page

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus())
    await page.bringToFront()
    await page.evaluate(() => {
      document.documentElement.dataset.cutEventCount = '0'
      document.addEventListener(
        'cut',
        (event) => {
          const current = Number(document.documentElement.dataset.cutEventCount ?? '0')
          document.documentElement.dataset.cutEventCount = String(current + 1)
          document.documentElement.dataset.nativeCutHasClipboardData = String(
            'clipboardData' in event
          )
          const content = [...document.querySelectorAll<HTMLElement>(
            '.editor-component .mu-paragraph-content'
          )].find((node) => node.textContent === 'alpha')
          const block = (content as unknown as {
            __MUYA_BLOCK__?: { muya: { hasFocus(): boolean } }
          })?.__MUYA_BLOCK__
          document.documentElement.dataset.nativeCutHasFocus = String(
            block?.muya.hasFocus() ?? false
          )
        },
        { capture: true, once: true }
      )
    })
    await selectFromTextToText(page, 'alpha', 2, '12', 1)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+X' : 'Control+X')
    await expect.poll(() => page.locator('html').getAttribute('data-cut-event-count')).toBe('1')
    expect(await page.locator('html').getAttribute('data-native-cut-has-clipboard-data')).toBe(
      'true'
    )
    expect(await page.locator('html').getAttribute('data-native-cut-has-focus')).toBe('true')

    await expect.poll(() => tableCellTexts(page)).toEqual(['', '2'])
    await expect(page.locator('.editor-component')).toContainText('al')
    await expect(page.locator('.editor-component')).toContainText('quote tail')
    await expect(page.locator('.editor-component')).toContainText('after')
    await expect(page.locator('.editor-component')).not.toContainText('remove')
    await expect(page.locator('.editor-component')).not.toContainText('before')

    const serialized = await getMarkdownContent(page, app)
    expect(serialized).toContain('- al')
    expect(serialized).toContain('2')
    expect(serialized).toContain('quote tail')
    expect(serialized).toContain('after')
    expect(serialized).not.toContain('remove')
    expect(serialized).not.toContain('before')
    await expect.poll(() => workspaceMarkdown(page)).toBe(serialized)

    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => fs.readFileSync(launched.filePath, 'utf8')).toBe(serialized)
    await expectNoRendererErrors(app)
    await closeDiscardingChanges(app)
    app = undefined

    const second = await launchElectron([launched.filePath], {
      suppressErrorDialog: true,
      userDataDir: launched.userDataDir
    })
    reopened = second.app
    await waitForEditor(second.page)
    await waitForMenuReady(second.app)
    await expect(second.page.locator('.editor-component')).toContainText('al')
    await expect(second.page.locator('.editor-component')).toContainText('quote tail')
    await expect(second.page.locator('.editor-component')).toContainText('after')
    await expect.poll(() => workspaceMarkdown(second.page)).toBe(serialized)
    expect(await getMarkdownContent(second.page, second.app)).toBe(serialized)
    expect(fs.readFileSync(launched.filePath, 'utf8')).toBe(serialized)
    await expectNoRendererErrors(second.app)
  } finally {
    if (app) await closeDiscardingChanges(app).catch(() => undefined)
    if (reopened) await closeDiscardingChanges(reopened).catch(() => undefined)
  }
})
