import { expect, test } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { execFileSync, type ChildProcess } from 'node:child_process'
import { launchWithMarkdown, sendIpcToRenderer } from './helpers'
import type { WorkspaceFacadeSnapshot } from '../../src/shared/workspace'

// Each workspace pane mounts its own find bar. These specs pin that a bar only
// opens in the focused pane and only searches, counts, highlights and replaces
// in that pane's document.

const LEFT_MARKDOWN = 'Left needle stays here.\n\nLeft plain paragraph.\n'
const RIGHT_MARKDOWN = 'Right needle one and needle two.\n\nAnother needle on the right.\n'

const tabSelector = '.tabs-container > li'
// Muya marks the active match `.mu-highlight` and every other match `.mu-selection`.
const MATCH_SELECTOR = '.mu-highlight, .mu-selection'

const snapshotOf = (page: Page): Promise<WorkspaceFacadeSnapshot> => page.evaluate(() =>
  (window as unknown as { __mtWorkspaceSnapshot(): WorkspaceFacadeSnapshot }).__mtWorkspaceSnapshot()
)

const paneAt = (page: Page, index: number): Locator => page.locator('.workspace-pane').nth(index)

const paneText = (page: Page, index: number): Promise<string> =>
  paneAt(page, index).locator('.editor-component').innerText()

const tabMenuAction = async(app: ElectronApplication, tab: Locator, label: string): Promise<void> => {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function() {
      ;(global as unknown as { __paneSearchMenu: unknown }).__paneSearchMenu = this
    }
  })
  await tab.dispatchEvent('contextmenu', { clientX: 20, clientY: 20 })
  await expect.poll(() => app.evaluate(() => !!(global as unknown as { __paneSearchMenu?: unknown }).__paneSearchMenu)).toBe(true)
  await app.evaluate(({ BrowserWindow }, itemLabel) => {
    const state = global as unknown as { __paneSearchMenu?: { items: Array<{ label: string; enabled: boolean; click(...args: unknown[]): void }> } }
    const item = state.__paneSearchMenu?.items.find(item => item.label === itemLabel)
    if (!item?.enabled) throw new Error(`Menu action unavailable: ${itemLabel}`)
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    item.click(undefined, win, win?.webContents)
    delete state.__paneSearchMenu
  }, label)
}

const terminate = async(child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
}

const focusPane = async(page: Page, index: number): Promise<void> => {
  await paneAt(page, index).locator('span.mu-paragraph-content').last().click()
  await expect.poll(async() => (await snapshotOf(page)).projection.focusedPaneId).toBe(index === 0 ? 'left' : 'right')
}

const openFind = async(app: ElectronApplication, page: Page, index: number): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
  await expect(paneAt(page, index).locator('.search-bar')).toBeVisible({ timeout: 5000 })
}

// The replace buttons sit inside Element Plus tooltips whose poppers can
// intercept a pointer click; clicking the resolved element runs the handler.
const clickInPane = async(page: Page, index: number, selector: string): Promise<void> => {
  const clicked = await page.evaluate(({ paneIndex, sel }) => {
    const pane = document.querySelectorAll('.workspace-pane')[paneIndex]
    const element = pane?.querySelector<HTMLElement>(sel)
    if (!element) return false
    element.click()
    return true
  }, { paneIndex: index, sel: selector })
  if (!clicked) throw new Error('clickInPane: no element matched ' + selector)
}

test.describe('Find bar in a split workspace', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    ;({ app, page } = await launchWithMarkdown(LEFT_MARKDOWN))
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForSelector('.tabs-container', { state: 'attached' })
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, RIGHT_MARKDOWN)
    await expect(page.locator(tabSelector)).toHaveCount(2)
    await tabMenuAction(app, page.locator('.tabs-container > li.active'), 'Move to Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    await expect.poll(() => paneText(page, 0)).toContain('Left needle stays here.')
    await expect.poll(() => paneText(page, 1)).toContain('Another needle on the right.')
  })

  test.afterEach(async() => {
    if (!app) return
    const child = app.process()
    try {
      await Promise.race([app.close(), new Promise<void>(resolve => setTimeout(resolve, 5_000))])
    } finally {
      await terminate(child)
    }
  })

  test('opens, searches and closes only in the focused pane', async() => {
    const left = paneAt(page, 0)
    const right = paneAt(page, 1)

    await focusPane(page, 1)
    await openFind(app, page, 1)
    await expect(left.locator('.search-bar')).toBeHidden()
    const rightInput = right.locator('.search-bar .search input')
    await expect(rightInput).toBeFocused()

    await rightInput.fill('needle')
    await expect.poll(() => right.locator('.search-bar .search-result').innerText()).toContain('1 / 3')
    await expect.poll(() => right.locator(MATCH_SELECTOR).count()).toBe(3)
    await expect(right.locator('.mu-highlight')).toHaveCount(1)
    expect(await left.locator(MATCH_SELECTOR).count()).toBe(0)

    // Clicking the other pane closes this bar and clears this pane's matches
    // without dragging focus back into it.
    await focusPane(page, 0)
    await expect(right.locator('.search-bar')).toBeHidden()
    await expect.poll(() => right.locator(MATCH_SELECTOR).count()).toBe(0)
    expect(await page.evaluate(() =>
      document.querySelectorAll('.workspace-pane')[0]?.contains(document.activeElement) ?? false
    )).toBe(true)

    await openFind(app, page, 0)
    await expect(right.locator('.search-bar')).toBeHidden()
    const leftInput = left.locator('.search-bar .search input')
    await expect(leftInput).toBeFocused()
    await leftInput.fill('needle')
    await expect.poll(() => left.locator('.search-bar .search-result').innerText()).toContain('1 / 1')
    await expect.poll(() => left.locator(MATCH_SELECTOR).count()).toBe(1)
    expect(await right.locator(MATCH_SELECTOR).count()).toBe(0)

    // Escape closes the focused pane's bar.
    await page.keyboard.press('Escape')
    await expect(left.locator('.search-bar')).toBeHidden()
    await expect.poll(() => left.locator(MATCH_SELECTOR).count()).toBe(0)
  })

  test('replace all only rewrites the focused pane document', async() => {
    const right = paneAt(page, 1)
    await focusPane(page, 1)
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'replace')
    await expect(right.locator('.search-bar .replace')).toBeVisible({ timeout: 5000 })
    await right.locator('.search-bar .search input').fill('needle')
    await expect.poll(() => right.locator('.search-bar .search-result').innerText()).toContain('/ 3')
    await right.locator('.search-bar .replace .input-wrapper input').fill('thread')

    await clickInPane(page, 1, '.search-bar .replace .button-group .button.right')

    await expect.poll(async() => {
      const text = await paneText(page, 1)
      return { needle: text.split('needle').length - 1, thread: text.split('thread').length - 1 }
    }).toEqual({ needle: 0, thread: 3 })
    expect(await paneText(page, 0)).toContain('Left needle stays here.')
    const documents = (await snapshotOf(page)).documents
    expect(documents.find(document => document.markdown.includes('Left'))?.markdown).toContain('Left needle stays here.')
  })

  test('switching the pane tab from the keyboard closes the bar and clears its matches', async() => {
    const right = paneAt(page, 1)
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'Second right tab without matches.\n')
    await expect(paneAt(page, 0).locator(tabSelector)).toHaveCount(2)
    await tabMenuAction(app, paneAt(page, 0).locator('.tabs-container > li.active'), 'Move to Right')
    const rightTabs = right.locator(tabSelector)
    await expect(rightTabs).toHaveCount(2)
    await rightTabs.nth(0).locator('.tab-select').click()
    await expect.poll(() => paneText(page, 1)).toContain('Another needle on the right.')

    await focusPane(page, 1)
    await openFind(app, page, 1)
    await right.locator('.search-bar .search input').fill('needle')
    await expect.poll(() => right.locator(MATCH_SELECTOR).count()).toBe(3)

    await rightTabs.nth(0).locator('.tab-select').focus()
    await page.keyboard.press('ArrowRight')
    await expect(rightTabs.nth(1).locator('.tab-select')).toHaveAttribute('aria-selected', 'true')
    await expect(right.locator('.search-bar')).toBeHidden()

    await rightTabs.nth(0).locator('.tab-select').click()
    await expect.poll(() => paneText(page, 1)).toContain('Another needle on the right.')
    expect(await right.locator(MATCH_SELECTOR).count()).toBe(0)
  })

  test('a long query scrolls inside the input instead of running under the controls', async() => {
    const right = paneAt(page, 1)
    await focusPane(page, 1)
    await openFind(app, page, 1)
    const input = right.locator('.search-bar .search input')
    await input.fill('a much longer search query that keeps going well past the visible width')
    await expect.poll(() => right.locator('.search-bar .search-result').innerText()).toContain('/ 0')

    const inputBox = await input.boundingBox()
    const controlsBox = await right.locator('.search-bar .search .controls').boundingBox()
    if (!inputBox || !controlsBox) throw new Error('find bar is not laid out')
    expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(controlsBox.x + 0.5)
    expect(await input.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)

    // A pane narrower than the bar's 400px plus margins shrinks the bar.
    await page.setViewportSize({ width: 860, height: 760 })
    const wrapper = right.locator('.editor-wrapper')
    await expect.poll(() => wrapper.evaluate(element => element.clientWidth)).toBeLessThan(440)
    const wrapperBox = await wrapper.boundingBox()
    const barBox = await right.locator('.search-bar').boundingBox()
    if (!wrapperBox || !barBox) throw new Error('find bar is not laid out')
    expect(barBox.width).toBeLessThan(400)
    expect(barBox.x).toBeGreaterThanOrEqual(wrapperBox.x + 19.5)
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(wrapperBox.x + wrapperBox.width - 19.5)
    const narrowInputBox = await input.boundingBox()
    const narrowControlsBox = await right.locator('.search-bar .search .controls').boundingBox()
    if (!narrowInputBox || !narrowControlsBox) throw new Error('find bar is not laid out')
    expect(narrowInputBox.x + narrowInputBox.width).toBeLessThanOrEqual(narrowControlsBox.x + 0.5)

    // The invalid-regex message still spans the input box, right below it.
    await right.locator('.search-bar .is-regex').click()
    await input.fill('(')
    const errorBox = await right.locator('.search-bar .error-msg').boundingBox()
    const inputWrapperBox = await right.locator('.search-bar .search .input-wrapper').boundingBox()
    if (!errorBox || !inputWrapperBox) throw new Error('regex error is not laid out')
    expect(Math.abs(errorBox.x - inputWrapperBox.x)).toBeLessThan(1)
    expect(Math.abs(errorBox.width - inputWrapperBox.width)).toBeLessThan(1)
    expect(Math.abs(errorBox.y - (inputWrapperBox.y + inputWrapperBox.height - 1))).toBeLessThan(1.5)
    await right.locator('.search-bar .is-regex').click()

    // An empty query shows no "0 / 0" counter.
    await input.fill('')
    await expect(right.locator('.search-bar .search-result')).toBeHidden()
  })
})
