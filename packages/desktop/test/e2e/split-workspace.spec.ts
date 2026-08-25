import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer } from './helpers'

test.describe('Split workspace', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    ({ app, page } = await launchWithMarkdown('# Split workspace\n'))
    await page.waitForSelector('.tabs-container')
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '')
    await expect(page.locator('.tabs-container > li')).toHaveCount(2)
  })
  test.afterAll(async() => { await app?.close() })

  test('edge release creates at most two panes and Escape leaves the workspace unsplit', async() => {
    await page.setViewportSize({ width: 1000, height: 700 })
    const tab = page.locator('.tabs-container > li').first()
    const box = await tab.boundingBox()
    if (!box) throw new Error('tab is not visible')
    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(5, box.y + 10)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)

    await page.mouse.move(box.x + 10, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(5, box.y + 10)
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
  })
})
