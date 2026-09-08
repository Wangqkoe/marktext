import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clickMenuById, launchWithMarkdown, sendIpcToRenderer } from './helpers'

const CLOSED = '<details>\n<summary>More</summary>\nBody\n</details>\n'
const tabSelector = '.tabs-container > li'

const splitAtLeftEdge = async(page: Page, tab: ReturnType<Page['locator']>): Promise<void> => {
  const tabBox = await tab.boundingBox()
  const workspace = await page.locator('.editor-with-tabs').boundingBox()
  if (!tabBox || !workspace) throw new Error('workspace or tab is not visible')
  await page.mouse.move(tabBox.x + Math.min(12, tabBox.width / 2), tabBox.y + tabBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(workspace.x + 4, workspace.y + workspace.height * 0.55, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.workspace-pane')).toHaveCount(2)
}

test('keeps details source, preview, theme, and export pane-owned in a split workspace', async() => {
  const { app, page } = await launchWithMarkdown(CLOSED)
  try {
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# Other pane\n')
    await expect(page.locator(tabSelector)).toHaveCount(2)
    await splitAtLeftEdge(page, page.locator(tabSelector).nth(1))

    const leftPane = page.locator('.workspace-pane').nth(0)
    const detailsPane = page.locator('.workspace-pane').nth(1)
    const disclosure = detailsPane.locator('.mu-html-preview details')
    const sourceAction = page.locator('.mu-preview-tools li.item.edit:visible').last()
    await expect(leftPane.locator('.editor-component')).toContainText('Other pane')
    await expect(disclosure).toBeVisible()

    await detailsPane.click()
    await detailsPane.locator('.mu-html-block').hover()
    await sourceAction.click()
    await expect(detailsPane.locator('.mu-html-block')).toHaveClass(/mu-active/)
    await expect(detailsPane.locator('.mu-html-container .mu-codeblock-content')).toBeVisible()
    await expect(leftPane.locator('.editor-component')).toContainText('Other pane')
    await page.keyboard.press('Escape')
    await expect(disclosure).toBeVisible()

    await clickMenuById(app, 'dracula')
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/)
    await expect(disclosure).toBeVisible()
    await expect(leftPane.locator('.editor-component')).toContainText('Other pane')

    const outputPath = path.join(os.tmpdir(), `marktext-t11-details-${Date.now()}.html`)
    await app.evaluate(({ BrowserWindow, dialog }, targetPath) => {
      const win = BrowserWindow.getAllWindows()[0]
      dialog.showSaveDialog = async() => ({ canceled: false, filePath: targetPath })
      win.webContents.send('mt::show-export-dialog', 'styledHtml')
    }, outputPath)
    await page.locator('.print-settings-dialog .button-primary').click()
    await expect.poll(() => fs.existsSync(outputPath)).toBe(true)
    const output = fs.readFileSync(outputPath, 'utf8')
    expect(output).toContain('<details>')
    expect(output).toContain('<summary>More</summary>')
    expect(output).not.toContain('mu-details-source-action')
    expect(output).not.toContain('details-disclosure')
    await expect(leftPane.locator('.editor-component')).toContainText('Other pane')
    fs.rmSync(outputPath)
    await clickMenuById(app, 'light')
  } finally {
    await app.close().catch(() => {})
  }
})
