import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchElectron, launchWithMarkdown, sendIpcToRenderer, waitForEditor, waitForMenuReady } from './helpers'

const tabSelector = '.tabs-container > li'

const workspaceBox = async(page: Page) => {
  const box = await page.locator('.editor-with-tabs').boundingBox()
  if (!box) throw new Error('workspace is not visible')
  return box
}

const dragTabTo = async(page: Page, tab: ReturnType<Page['locator']>, x: number, y: number) => {
  const box = await tab.boundingBox()
  if (!box) throw new Error('tab is not visible')
  await page.mouse.move(box.x + Math.min(12, box.width / 2), box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 8 })
}

const releaseTabAt = async(page: Page, tab: ReturnType<Page['locator']>, x: number, y: number) => {
  await dragTabTo(page, tab, x, y)
  await page.mouse.up()
}

const paneText = (page: Page, index: number): Promise<string> =>
  page.locator('.workspace-pane').nth(index).locator('.editor-component').innerText()

const appendInPane = async(page: Page, index: number, text: string): Promise<void> => {
  expect(await page.evaluate((paneIndex) => {
    const root = document.querySelectorAll<HTMLElement>('.workspace-pane .editor-component')[paneIndex]
    const target = root?.querySelector('span.mu-paragraph-content')
    if (!root || !target) return false
    root.focus()
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(false)
    const selection = window.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true }))
    return true
  }, index)).toBe(true)
  await page.keyboard.type(text)
}

const setWorkspaceWidth = async(page: Page, target: number): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = await page.locator('.editor-with-tabs').evaluate((element) => element.clientWidth)
    if (actual === target) return
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
    await page.setViewportSize({ width: Math.max(400, viewport.width + target - actual), height: viewport.height })
  }
  await expect.poll(() => page.locator('.editor-with-tabs').evaluate((element) => element.clientWidth)).toBe(target)
}

test.describe('Split workspace', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    ({ app, page } = await launchWithMarkdown('alpha pane\n'))
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForSelector('.tabs-container', { state: 'attached' })
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'beta pane\n')
    await expect(page.locator(tabSelector)).toHaveCount(2)
  })

  test.afterEach(async() => { await app?.close() })

  test('previews edge candidates, cancels invalid gestures, and splits only on document-area release', async() => {
    const root = await workspaceBox(page)
    const tab = page.locator(tabSelector).nth(1)
    const documentY = root.y + root.height * 0.55

    await dragTabTo(page, tab, root.x + 4, documentY)
    await expect(page.locator('.editor-with-tabs')).toHaveClass(/preview-left/)
    await expect.poll(() => page.locator('.editor-with-tabs').evaluate((element) => getComputedStyle(element, '::before').transitionDuration)).toBe('0.18s')
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)

    await dragTabTo(page, tab, root.x + root.width + 20, documentY)
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)

    await dragTabTo(page, tab, root.x + 4, documentY)
    await expect(page.locator('.editor-with-tabs')).toHaveClass(/preview-left/)
    await page.mouse.move(root.x + root.width / 2, documentY, { steps: 3 })
    await expect(page.locator('.editor-with-tabs')).not.toHaveClass(/preview/)
    await page.mouse.move(root.x + root.width - 4, documentY, { steps: 3 })
    await expect(page.locator('.editor-with-tabs')).toHaveClass(/preview-right/)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)

    await releaseTabAt(page, tab, root.x + 4, documentY)
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    await expect.poll(() => paneText(page, 0)).toContain('beta pane')
    await expect.poll(() => paneText(page, 1)).toContain('alpha pane')
  })

  test('keeps editing, commands, ownership, and tabs pane-local through a collapse', async() => {
    const root = await workspaceBox(page)
    await releaseTabAt(page, page.locator(tabSelector).nth(1), root.x + 4, root.y + root.height * 0.55)
    await expect(page.locator('.workspace-pane')).toHaveCount(2)

    await appendInPane(page, 0, ' LEFT_MARK')
    await expect.poll(() => paneText(page, 0)).toContain('LEFT_MARK')
    await page.locator('.workspace-pane').nth(1).click()
    await appendInPane(page, 1, ' RIGHT_MARK')
    await expect.poll(() => paneText(page, 1)).toContain('RIGHT_MARK')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => paneText(page, 1)).not.toContain('RIGHT_MARK')
    await expect.poll(() => paneText(page, 0)).toContain('LEFT_MARK')

    await page.locator('.workspace-pane').nth(1).click()
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'right extra\n')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    const rightTabs = page.locator('.workspace-pane').nth(1).locator(tabSelector)
    await expect(rightTabs).toHaveCount(2)
    await rightTabs.nth(0).locator('.tab-select').focus()
    await page.keyboard.press('ArrowRight')
    await expect(rightTabs.nth(1).locator('.tab-select')).toHaveAttribute('aria-selected', 'true')

    const leftTabs = page.locator('.workspace-pane').nth(0).locator(tabSelector)
    await expect(leftTabs).toHaveCount(1)
    await releaseTabAt(page, leftTabs.nth(0), root.x + root.width - 4, root.y + root.height * 0.55)
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    await expect.poll(() => paneText(page, 0)).toContain('LEFT_MARK')
    await appendInPane(page, 0, ' AFTER_COLLAPSE')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => paneText(page, 0)).not.toContain('AFTER_COLLAPSE')
  })

  test('enforces the 720px split threshold, split minimums, reset, reduced motion, and no third pane', async() => {
    await setWorkspaceWidth(page, 719)
    let root = await workspaceBox(page)
    const tabs = page.locator(tabSelector)
    const order = await tabs.evaluateAll((items) => items.map((item) => item.getAttribute('data-id')))
    await releaseTabAt(page, tabs.nth(1), root.x + 4, root.y + root.height * 0.55)
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    const firstTabBox = await tabs.nth(0).boundingBox()
    if (!firstTabBox) throw new Error('first tab is not visible')
    await releaseTabAt(page, tabs.nth(1), firstTabBox.x + firstTabBox.width / 2, firstTabBox.y + firstTabBox.height / 2)
    await expect.poll(() => tabs.evaluateAll((items) => items.map((item) => item.getAttribute('data-id')))).toEqual(order.slice().reverse())

    await setWorkspaceWidth(page, 720)
    await expect.poll(() => page.locator('.editor-with-tabs').evaluate((element) => element.clientWidth)).toBeGreaterThanOrEqual(720)
    root = await workspaceBox(page)
    await releaseTabAt(page, tabs.nth(0), root.x + 4, root.y + root.height * 0.55)
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    const divider = page.locator('.workspace-divider')
    const dividerBox = await divider.boundingBox()
    if (!dividerBox) throw new Error('split divider is not visible')
    await page.mouse.move(dividerBox.x + 2, dividerBox.y + dividerBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(root.x + 2, dividerBox.y + dividerBox.height / 2)
    await page.mouse.up()
    expect(await page.locator('.workspace-pane').evaluateAll((panes) => panes.every((pane) => pane.getBoundingClientRect().width >= 320))).toBe(true)

    await divider.dblclick()
    const widths = await page.locator('.workspace-pane').evaluateAll((panes) => panes.map((pane) => pane.getBoundingClientRect().width))
    expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(2)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await dragTabTo(page, page.locator('.workspace-pane').nth(0).locator(tabSelector).nth(0), root.x + 4, root.y + root.height * 0.55)
    await expect.poll(() => page.locator('.editor-with-tabs').evaluate((element) => getComputedStyle(element, '::before').transitionDuration)).toBe('0s')
    await page.keyboard.press('Escape')
    await page.mouse.up()

    await setWorkspaceWidth(page, 640)
    expect(await page.locator('.workspace-pane').evaluateAll((panes) => panes.every((pane) => pane.getBoundingClientRect().width >= 320))).toBe(true)
  })

  test('does not restore a split after a normal restart', async() => {
    const root = await workspaceBox(page)
    await releaseTabAt(page, page.locator(tabSelector).nth(1), root.x + 4, root.y + root.height * 0.55)
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    const profile = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
    await app.close()
    const relaunched = await launchElectron([], { userDataDir: profile, userDataDirOwnership: 'caller' })
    app = relaunched.app
    page = relaunched.page
    await waitForEditor(page)
    await waitForMenuReady(app)
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
  })
})
