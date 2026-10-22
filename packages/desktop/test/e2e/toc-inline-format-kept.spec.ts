import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithMarkdown, waitForEditor } from './helpers'

// Local divergence from upstream's outline, which flattens every HTML tag: the
// inline toolbar writes highlight, underline and colour as HTML, and the
// outline keeps their look.
const DOC = [
  '# Plain <mark>marked</mark> heading',
  '',
  '## Under <u>lined</u> heading',
  '',
  '## Colour <span style="color:#e64340;background-color:#fde2e2">red</span> heading',
  '',
  '## Pasted <span style="color:red;font-size:40px">big</span> heading',
  ''
].join('\n')

const HIGHLIGHT = '#7fd1ff'

test.describe('Outline keeps the toolbar formats', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(DOC, { preferences: { highlightColor: HIGHLIGHT } })
    app = launched.app
    page = launched.page
    await waitForEditor(page)
    const sidebarVisible = await page.evaluate(() => {
      const el = document.querySelector('.side-bar') as HTMLElement | null
      return !!(el && el.offsetParent !== null)
    })
    if (!sidebarVisible) await clickMenuById(app, 'sideBarMenuItem')
    await clickMenuById(app, 'tocMenuItem')
    await page.waitForFunction(
      () => document.querySelectorAll('.side-bar-toc .el-tree-node__label').length >= 4,
      null,
      { timeout: 15000 }
    )
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('renders <mark> in the highlight colour preference, as the editor does', async() => {
    const colors = await page.evaluate(() => {
      const bg = (selector: string) => {
        const el = document.querySelector(selector)
        return el ? getComputedStyle(el).backgroundColor : null
      }
      return {
        outline: bg('.side-bar-toc .el-tree-node__label mark'),
        editor: bg('.editor-component mark')
      }
    })
    expect(colors.outline).toBe('rgb(127, 209, 255)')
    expect(colors.outline).toBe(colors.editor)
  })

  test('keeps underline and the colour span, and flattens a span with other styles', async() => {
    const label = (text: string) => page.locator('.side-bar-toc .el-tree-node__label', { hasText: text })

    await expect(label('lined').locator('u')).toHaveText('lined')
    const colour = label('red').locator('span[style]')
    await expect(colour).toHaveText('red')
    await expect(colour).toHaveCSS('color', 'rgb(230, 67, 64)')
    await expect(colour).toHaveCSS('background-color', 'rgb(253, 226, 226)')
    await expect(label('big').locator('span[style]')).toHaveCount(0)
  })
})
