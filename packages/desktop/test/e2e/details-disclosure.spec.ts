import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import {
  clickMenuById,
  getMarkdownContent,
  launchWithMarkdown,
  sendIpcToRenderer,
  setSourceMarkdown
} from './helpers'

const CLOSED = '<details>\n<summary>More</summary>\nBody\n</details>\n'
const STAB_008 = '<details>\n<summary>摘要原文</summary>\n\nDETAILS_BODY_SENTINEL_4BDE701A\n\n</details>\n'

const disclosure = (page: Page) => page.locator('.editor-component .mu-html-preview details')
const summary = (page: Page) => disclosure(page).locator('summary')
const sourceAction = (page: Page) =>
  page.locator('.editor-component .mu-html-preview .mu-details-source-action')
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

const restorePreview = async(page: Page): Promise<void> => {
  if (await disclosure(page).isVisible()) return
  const action = page.locator('.editor-component .mu-html-preview-action').first()
  await expect(action).toBeVisible()
  await action.click()
}

const openDetailsSource = async(page: Page): Promise<void> => {
  await expect(sourceAction(page)).toBeVisible()
  await sourceAction(page).click()
  const wrapper = page.locator('.editor-component .mu-html-block')
  await expect(wrapper).toHaveClass(/mu-active/)
  await expect(page.locator('.editor-component .mu-html-container .mu-codeblock-content')).toBeVisible()
}

const rebuildWithAuthoredOpen = async(page: Page): Promise<void> => {
  await openDetailsSource(page)
  // Source editing starts at the first character of `<details>`. Move before
  // its closing bracket and type the authored `open` attribute like a user.
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.insertText(' open')
  const previewAction = page.locator('.editor-component .mu-html-preview-action')
  await expect(previewAction).toBeVisible()
  await previewAction.focus()
  await page.keyboard.press('Enter')
  await expect(disclosure(page)).toHaveAttribute('open', '')
}

const setHtmlEnabled = async(page: Page, enabled: boolean): Promise<void> => {
  await page.evaluate((value) => {
    window.electron.ipcRenderer.send('mt::set-user-preference', { isHtmlEnabled: value })
    window.electron.ipcRenderer.send('mt::ask-for-user-preference')
  }, enabled)
  await page.waitForTimeout(100)
}

test.describe('raw HTML details disclosure in the desktop editor', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(CLOSED)
    app = launched.app
    page = launched.page
    await expect(disclosure(page)).toBeVisible()
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test.beforeEach(async() => {
    await setHtmlEnabled(page, true)
    await setSourceMarkdown(page, app, CLOSED)
    await restorePreview(page)
    await expect(disclosure(page)).toBeVisible()
  })

  test('uses desktop light/dark tokens and the 170ms disclosure affordance', async() => {
    const readTokens = async() =>
      await page.evaluate(() => {
        const wrapper = document.querySelector('.editor-wrapper') as HTMLElement
        const marker = document.querySelector('.mu-html-preview details > summary') as HTMLElement
        const style = getComputedStyle(wrapper)
        return {
          foreground: style.getPropertyValue('--details-disclosure-foreground').trim(),
          hover: style.getPropertyValue('--details-disclosure-hover').trim(),
          motion: getComputedStyle(marker, '::before').transitionDuration
        }
      })

    const light = await readTokens()
    expect(light.foreground).not.toBe('')
    expect(light.hover).not.toBe('')
    expect(light.motion).toBe('0.17s')

    await clickMenuById(app, 'dracula')
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/)
    const dark = await readTokens()
    expect(dark.foreground).not.toBe(light.foreground)
    expect(dark.hover).not.toBe('')

    await clickMenuById(app, 'light')
  })

  test('keeps the native whole-summary mouse, Enter, and Space behavior temporary', async() => {
    const markdownBefore = CLOSED
    await summary(page).click()
    await expect(disclosure(page)).toHaveAttribute('open', '')

    await summary(page).focus()
    await page.keyboard.press('Enter')
    await expect(disclosure(page)).not.toHaveAttribute('open', '')

    await page.keyboard.press('Space')
    await expect(disclosure(page)).toHaveAttribute('open', '')
    expect(await getMarkdownContent(page, app)).toBe(markdownBefore)
  })

  test('shows focus-visible styling and opens source only through the external action', async() => {
    await summary(page).focus()
    await page.keyboard.press('Tab')
    await expect(sourceAction(page)).toBeFocused()
    expect(
      await page.evaluate(() => {
        const target = document.querySelector('.mu-details-source-action') as HTMLElement
        return target.matches(':focus-visible') && getComputedStyle(target).outlineStyle
      })
    ).toBe('solid')

    await expect(sourceAction(page)).toBeVisible()
    await sourceAction(page).click()
    await expect(
      page.locator('.editor-component .mu-html-container .mu-codeblock-content')
    ).toBeVisible()
    await expect(disclosure(page)).toBeHidden()

    await page.keyboard.press('Escape')
    await expect(disclosure(page)).toBeVisible()
    await expect(disclosure(page)).not.toHaveAttribute('open', '')
  })

  test('rebuilds authored open preview and reopens source after Preview', async() => {
    await rebuildWithAuthoredOpen(page)
    const previewAction = page.locator('.editor-component .mu-html-preview-action')

    // Regression coverage for the T09 active-content repair after Preview and Escape.
    await openDetailsSource(page)
    await page.keyboard.press('Escape')
    await expect(disclosure(page)).toHaveAttribute('open', '')
    await openDetailsSource(page)
    await expect(previewAction).toBeVisible()
  })

  test('renders escaped source without native disclosure when HTML is disabled', async() => {
    await setHtmlEnabled(page, false)
    await setSourceMarkdown(page, app, CLOSED)
    await expect(disclosure(page)).toHaveCount(0)
    await expect(page.locator('.editor-component .mu-html-container').first()).toContainText(
      'details'
    )
    await setHtmlEnabled(page, true)
    await restorePreview(page)
    await expect(disclosure(page)).toBeVisible()
  })

  test('removes disclosure motion when reduced motion is requested', async() => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(
      await page.evaluate(() => {
        const marker = document.querySelector('.mu-html-preview details > summary') as HTMLElement
        return getComputedStyle(marker, '::before').transitionDuration
      })
    ).toBe('0s')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  })

  test('exports standard details markup without editor controls or editor CSS', async() => {
    await rebuildWithAuthoredOpen(page)
    const outputPath = path.join(os.tmpdir(), `marktext-details-${Date.now()}.html`)
    await app.evaluate(({ BrowserWindow, dialog }, targetPath) => {
      const win = BrowserWindow.getAllWindows()[0]
      dialog.showSaveDialog = async() => ({ canceled: false, filePath: targetPath })
      win.webContents.send('mt::show-export-dialog', 'styledHtml')
    }, outputPath)
    await page.locator('.print-settings-dialog .button-primary').click()
    await expect.poll(() => fs.existsSync(outputPath)).toBe(true)
    const output = fs.readFileSync(outputPath, 'utf8')
    expect(output).toContain('<details open="">')
    expect(output).toContain('<summary>More</summary>')
    expect(output).not.toContain('mu-details-source-action')
    expect(output).not.toContain('details-disclosure')
    fs.rmSync(outputPath)
  })
})

test('keeps the escaped details block in preview through a split-pane theme change', async() => {
  const { app, page } = await launchWithMarkdown(CLOSED)
  try {
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# Other pane\n')
    await expect(page.locator(tabSelector)).toHaveCount(2)
    await splitAtLeftEdge(page, page.locator(tabSelector).nth(1))

    const detailsPane = page.locator('.workspace-pane').nth(1)
    const detailsDisclosure = detailsPane.locator('.mu-html-preview details')
    await expect(detailsDisclosure).toBeVisible()

    await detailsPane.click()
    await detailsPane.locator('.mu-details-source-action').click()
    await expect(detailsPane.locator('.mu-html-block')).toHaveClass(/mu-active/)
    await page.keyboard.press('Escape')
    await expect(detailsDisclosure).toBeVisible()

    await clickMenuById(app, 'dracula')
    await expect(detailsDisclosure).toBeVisible()
    await expect(detailsPane.locator('.mu-html-block')).not.toHaveClass(/mu-active/)
    await clickMenuById(app, 'light')
  } finally {
    await app.close().catch(() => {})
  }
})

test('STAB-008 hides and restores the exact raw-HTML details body in Electron', async() => {
  const { app, page } = await launchWithMarkdown(STAB_008)
  try {
    const details = page.locator('.editor-component .mu-html-preview details')
    const bodyHeight = async() => page.evaluate(() => {
      const details = document.querySelector('.editor-component .mu-html-preview details')!
      const walker = document.createTreeWalker(details, NodeFilter.SHOW_TEXT)
      let text = walker.nextNode()
      while (text && !text.textContent!.includes('DETAILS_BODY_SENTINEL_4BDE701A')) {
        text = walker.nextNode()
      }
      if (!text) throw new Error('details body sentinel text node is missing')
      const range = document.createRange()
      range.selectNode(text)
      return range.getBoundingClientRect().height
    })

    await expect(details).not.toHaveAttribute('open', '')
    expect(await bodyHeight()).toBe(0)
    await details.locator('summary').click()
    await expect(details).toHaveAttribute('open', '')
    expect(await bodyHeight()).toBeGreaterThan(0)
    expect(await getMarkdownContent(page, app)).toBe(STAB_008)
  } finally {
    await app.close().catch(() => {})
  }
})
