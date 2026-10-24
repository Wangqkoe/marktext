import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { execFileSync, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { clickMenuById, launchElectron, launchWithMarkdown, sendIpcToRenderer, waitForEditor, waitForMenuReady } from './helpers'
import type { WorkspaceFacadeSnapshot } from '../../src/shared/workspace'

const tabSelector = '.tabs-container > li'

const snapshotOf = (page: Page): Promise<WorkspaceFacadeSnapshot> => page.evaluate(() =>
  (window as unknown as { __mtWorkspaceSnapshot(): WorkspaceFacadeSnapshot }).__mtWorkspaceSnapshot()
)

type HeldScrollCommits = typeof window & {
  __mtHeldScrollCommits?: Array<() => void>
  __mtHeldScrollBlockers?: Array<() => void>
}

// The editor commits a live scroll position after 150 ms of idle, scheduled
// synchronously by its scroll listener. Capture that timer so the test can
// observe the uncommitted position without racing it, then release it. The
// native scroll event that follows `scrollTop =` would re-arm a real timer, so
// it is blocked until release.
const scrollHoldingIdleCommit = (scroller: ReturnType<Page['locator']>, scrollTop: number): Promise<number> =>
  scroller.evaluate((element, top) => {
    const target = window as HeldScrollCommits
    const held = target.__mtHeldScrollCommits ??= []
    const blockNativeScroll = (event: Event) => {
      if (event.isTrusted && event.target === element) event.stopImmediatePropagation()
    }
    window.addEventListener('scroll', blockNativeScroll, true)
    ;(target.__mtHeldScrollBlockers ??= []).push(() => window.removeEventListener('scroll', blockNativeScroll, true))
    const originalSetTimeout = window.setTimeout
    window.setTimeout = ((handler: TimerHandler, _delay?: number, ...args: unknown[]) => {
      if (typeof handler === 'function') held.push(() => Reflect.apply(handler, window, args))
      return -1 - held.length
    }) as typeof window.setTimeout
    try {
      element.scrollTop = top
      element.dispatchEvent(new Event('scroll'))
    } finally {
      window.setTimeout = originalSetTimeout
    }
    return element.scrollTop
  }, scrollTop)

const releaseHeldScrollCommits = (page: Page): Promise<number> => page.evaluate(() => {
  const target = window as HeldScrollCommits
  for (const unblock of (target.__mtHeldScrollBlockers ?? []).splice(0)) unblock()
  const callbacks = (target.__mtHeldScrollCommits ?? []).splice(0)
  for (const callback of callbacks) callback()
  return callbacks.length
})

const tabMenuAction = async(app: ElectronApplication, tab: ReturnType<Page['locator']>, label: string): Promise<void> => {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function() {
      ;(global as unknown as { __sharedViewMenu: unknown }).__sharedViewMenu = this
    }
  })
  await tab.dispatchEvent('contextmenu', { clientX: 20, clientY: 20 })
  await expect.poll(() => app.evaluate(() => !!(global as unknown as { __sharedViewMenu?: unknown }).__sharedViewMenu)).toBe(true)
  await app.evaluate(({ BrowserWindow }, itemLabel) => {
    const state = global as unknown as { __sharedViewMenu?: { items: Array<{ label: string; enabled: boolean; click(...args: unknown[]): void }> } }
    const item = state.__sharedViewMenu?.items.find(item => item.label === itemLabel)
    if (!item?.enabled) throw new Error(`Menu action unavailable: ${itemLabel}`)
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    item.click(undefined, win, win?.webContents)
    delete state.__sharedViewMenu
  }, label)
}

const terminate = async(child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 5_000))])
}

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
  await page.locator('.workspace-pane').nth(index).locator('span.mu-paragraph-content').first().click()
  await expect.poll(async() => (await snapshotOf(page)).projection.focusedPaneId).toBe(index === 0 ? 'left' : 'right')
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
  let primaryFilePath: string

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown('alpha pane\n')
    ;({ app, page } = launched)
    primaryFilePath = launched.filePath
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForSelector('.tabs-container', { state: 'attached' })
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'beta pane\n')
    await expect(page.locator(tabSelector)).toHaveCount(2)
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

  test('Split Right shares one single-tab document, edits and undo from both panes, and coalesces Move', async() => {
    await page.locator(tabSelector).nth(1).locator('.close-icon').click()
    await expect(page.locator(tabSelector)).toHaveCount(1)
    await tabMenuAction(app, page.locator(tabSelector), 'Split Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    const snapshot = await snapshotOf(page)
    expect(new Set(snapshot.documents.map(document => document.documentId)).size).toBe(1)
    expect(new Set(snapshot.documents.map(document => document.viewId)).size).toBe(2)
    await appendInPane(page, 1, ' RIGHT')
    await expect.poll(() => paneText(page, 0)).toContain('RIGHT')
    await expect.poll(() => paneText(page, 1)).toContain('RIGHT')
    await appendInPane(page, 0, ' LEFT')
    await expect.poll(() => paneText(page, 1)).toContain('LEFT')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => paneText(page, 0)).not.toContain('LEFT')
    await expect.poll(() => paneText(page, 1)).not.toContain('LEFT')
    await page.locator('.workspace-pane').nth(1).locator('.tab-select').click()
    await expect(page.locator('.workspace-pane').nth(1)).toHaveClass(/focused/)
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => paneText(page, 0)).not.toContain('RIGHT')
    await tabMenuAction(app, page.locator('.workspace-pane').nth(0).locator(tabSelector), 'Split Right')
    await expect(page.locator(tabSelector)).toHaveCount(2)
    await tabMenuAction(app, page.locator('.workspace-pane').nth(1).locator(tabSelector), 'Move to Left')
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    await expect(page.locator(tabSelector)).toHaveCount(1)
    expect((await snapshotOf(page)).documents[0]!.markdown.trim()).toBe('alpha pane')
  })

  test('shared document refresh preserves the other view cursor and scroll', async() => {
    const markdown = Array.from({ length: 80 }, (_, index) => `Paragraph ${index} has enough text for independent scrolling.`).join('\n\n')
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, markdown)
    await expect(page.locator(tabSelector)).toHaveCount(3)
    await tabMenuAction(app, page.locator('.tabs-container > li.active'), 'Split Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    await appendInPane(page, 1, ' RIGHT_CURSOR')
    await expect.poll(() => paneText(page, 0)).toContain('RIGHT_CURSOR')
    await page.locator('.workspace-pane').nth(0).locator('.tab-select[aria-selected="true"]').click()
    const rightId = (await snapshotOf(page)).projection.panes[1]!.activeViewId
    const rightBefore = (await snapshotOf(page)).documents.find(document => document.viewId === rightId)!
    const rightScroller = page.locator('.workspace-pane').nth(1).locator('.editor-component')
    await rightScroller.evaluate(element => { element.scrollTop = 350; element.dispatchEvent(new Event('scroll')) })
    await expect.poll(async() => (await snapshotOf(page)).documents.find(document => document.viewId === rightId)?.scrollTop).toBe(350)
    await appendInPane(page, 0, ' LEFT_CHANGE')
    await expect.poll(() => paneText(page, 1)).toContain('LEFT_CHANGE')
    expect(await rightScroller.evaluate(element => element.scrollTop)).toBe(350)
    expect((await snapshotOf(page)).documents.find(document => document.viewId === rightId)?.cursor).toEqual(rightBefore.cursor)
  })

  test('shared document refresh captures an uncommitted live scroll and fences the old generation', async() => {
    const markdown = Array.from(
      { length: 80 },
      (_, index) => `Paragraph ${index} keeps a shared View vertically scrollable.`
    ).join('\n\n')
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, markdown)
    await expect(page.locator(tabSelector)).toHaveCount(3)
    await tabMenuAction(app, page.locator('.tabs-container > li.active'), 'Split Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)

    await page.locator('.workspace-pane').nth(0).locator('.tab-select[aria-selected="true"]').click()
    await expect.poll(() => snapshotOf(page).then(snapshot => snapshot.projection.focusedPaneId)).toBe('left')
    const rightPane = (await snapshotOf(page)).projection.panes[1]
    if (!rightPane) throw new Error('expected a right pane after Split Right')
    const rightId = rightPane.activeViewId
    const rightScroller = page.locator('.workspace-pane').nth(1).locator('.editor-component')
    const rightLiveScrollTop = await rightScroller.evaluate(element => {
      const target = window as typeof window & {
        __mtScrollIdleHarness?: { fireCaptured(): number }
      }
      const originalSetTimeout = window.setTimeout
      const callbacks: Array<() => void> = []
      let nextHandle = -1

      window.setTimeout = ((handler: TimerHandler, _delay?: number, ...args: unknown[]) => {
        if (typeof handler === 'function') callbacks.push(() => Reflect.apply(handler, window, args))
        return nextHandle--
      }) as typeof window.setTimeout
      try {
        element.scrollTop = 350
        element.dispatchEvent(new Event('scroll'))
      } finally {
        window.setTimeout = originalSetTimeout
      }
      target.__mtScrollIdleHarness = {
        fireCaptured() {
          const count = callbacks.length
          for (const callback of callbacks) callback()
          callbacks.length = 0
          return count
        }
      }
      return element.scrollTop
    })
    expect(rightLiveScrollTop).toBe(350)
    expect((await snapshotOf(page)).documents.find(document => document.viewId === rightId)?.scrollTop).toBe(0)

    await appendInPane(page, 0, ' LEFT_REFRESH')
    await expect.poll(() => paneText(page, 1)).toContain('LEFT_REFRESH')
    expect((await snapshotOf(page)).documents.find(document => document.viewId === rightId)?.scrollTop).toBe(
      rightLiveScrollTop
    )
    expect(await rightScroller.evaluate(element => element.scrollTop)).toBe(rightLiveScrollTop)

    const forcedLateCallbacks = await page.evaluate(() => {
      const harness = (window as typeof window & {
        __mtScrollIdleHarness?: { fireCaptured(): number }
      }).__mtScrollIdleHarness
      return harness?.fireCaptured() ?? 0
    })
    expect(forcedLateCallbacks).toBeGreaterThan(0)
    expect((await snapshotOf(page)).documents.find(document => document.viewId === rightId)?.scrollTop).toBe(
      rightLiveScrollTop
    )
    expect(await rightScroller.evaluate(element => element.scrollTop)).toBe(rightLiveScrollTop)
  })

  test('Split Right inherits the final live position and then keeps both View positions independent', async() => {
    const markdown = Array.from(
      { length: 300 },
      (_, index) => `Paragraph ${index} keeps both split Views vertically scrollable.`
    ).join('\n\n')
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, markdown)
    await expect(page.locator(tabSelector)).toHaveCount(3)

    const sourceBefore = await snapshotOf(page)
    const leftBefore = sourceBefore.projection.panes[0]!
    const sourceViewId = leftBefore.activeViewId
    const sourceDocument = sourceBefore.documents.find(document => document.viewId === sourceViewId)!
    expect(sourceDocument.scrollTop).toBe(0)

    const sourceLiveScrollTop = await scrollHoldingIdleCommit(page.locator('.editor-component'), 800)
    expect(sourceLiveScrollTop).toBe(800)
    expect((await snapshotOf(page)).documents.find(document => document.viewId === sourceViewId)?.scrollTop).toBe(0)

    await tabMenuAction(app, page.locator('.tabs-container > li.active'), 'Split Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)

    const split = await snapshotOf(page)
    await releaseHeldScrollCommits(page)
    const sharedViews = split.documents.filter(document => document.documentId === sourceDocument.documentId)
    expect(sharedViews).toHaveLength(2)
    expect(sharedViews.map(document => document.scrollTop)).toEqual([
      sourceLiveScrollTop,
      sourceLiveScrollTop
    ])
    const leftViewId = split.projection.panes[0]!.activeViewId
    const rightViewId = split.projection.panes[1]!.activeViewId
    await expect.poll(() => page.locator('.workspace-pane .editor-component').evaluateAll(
      elements => elements.map(element => element.scrollTop)
    )).toEqual([sourceLiveScrollTop, sourceLiveScrollTop])

    const rightLiveScrollTop = await scrollHoldingIdleCommit(page.locator('.workspace-pane').nth(1).locator('.editor-component'), 1200)
    expect(rightLiveScrollTop).toBe(1200)
    expect(await page.locator('.workspace-pane').nth(0).locator('.editor-component').evaluate(element => element.scrollTop)).toBe(sourceLiveScrollTop)
    const duringRightScroll = await snapshotOf(page)
    expect(duringRightScroll.documents.find(document => document.viewId === leftViewId)?.scrollTop).toBe(sourceLiveScrollTop)
    expect(duringRightScroll.documents.find(document => document.viewId === rightViewId)?.scrollTop).toBe(sourceLiveScrollTop)

    expect(await releaseHeldScrollCommits(page)).toBeGreaterThan(0)
    await expect.poll(async() => (await snapshotOf(page)).documents.find(document => document.viewId === rightViewId)?.scrollTop).toBe(rightLiveScrollTop)
    expect((await snapshotOf(page)).documents.find(document => document.viewId === leftViewId)?.scrollTop).toBe(sourceLiveScrollTop)

    const leftLiveScrollTop = await page.locator('.workspace-pane').nth(0).locator('.editor-component').evaluate(element => {
      element.scrollTop = 400
      element.dispatchEvent(new Event('scroll'))
      return element.scrollTop
    })
    expect(leftLiveScrollTop).toBe(400)
    expect(await page.locator('.workspace-pane').nth(1).locator('.editor-component').evaluate(element => element.scrollTop)).toBe(rightLiveScrollTop)

    await expect.poll(async() => (await snapshotOf(page)).documents.find(document => document.viewId === leftViewId)?.scrollTop).toBe(leftLiveScrollTop)
    expect((await snapshotOf(page)).documents.find(document => document.viewId === rightViewId)?.scrollTop).toBe(rightLiveScrollTop)
  })

  test('Move to Right and Move to Left preserve each command-boundary live position', async() => {
    const markdown = Array.from(
      { length: 300 },
      (_, index) => `Paragraph ${index} keeps a moved View vertically scrollable.`
    ).join('\n\n')
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, markdown)
    await expect(page.locator(tabSelector)).toHaveCount(3)
    const viewId = (await snapshotOf(page)).projection.panes[0]!.activeViewId

    const rightPosition = await page.locator('.editor-component').evaluate(element => {
      element.scrollTop = 700
      element.dispatchEvent(new Event('scroll'))
      return element.scrollTop
    })
    expect(rightPosition).toBe(700)
    expect((await snapshotOf(page)).documents.find(document => document.viewId === viewId)?.scrollTop).toBe(0)

    await tabMenuAction(app, page.locator('.tabs-container > li.active'), 'Move to Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    let moved = await snapshotOf(page)
    expect(moved.projection.panes[1]!.activeViewId).toBe(viewId)
    expect(moved.documents.find(document => document.viewId === viewId)?.scrollTop).toBe(rightPosition)
    await expect.poll(() => page.locator('.workspace-pane').nth(1).locator('.editor-component').evaluate(
      element => element.scrollTop
    )).toBe(rightPosition)

    const leftPosition = await page.locator('.workspace-pane').nth(1).locator('.editor-component').evaluate(element => {
      element.scrollTop = 1100
      element.dispatchEvent(new Event('scroll'))
      return element.scrollTop
    })
    expect(leftPosition).toBe(1100)
    expect((await snapshotOf(page)).documents.find(document => document.viewId === viewId)?.scrollTop).toBe(rightPosition)

    await tabMenuAction(
      app,
      page.locator('.workspace-pane').nth(1).locator('.tabs-container > li.active'),
      'Move to Left'
    )
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    moved = await snapshotOf(page)
    expect(moved.projection.panes[0]!.activeViewId).toBe(viewId)
    expect(moved.documents.find(document => document.viewId === viewId)?.scrollTop).toBe(leftPosition)
    await expect.poll(() => page.locator('.editor-component').evaluate(element => element.scrollTop)).toBe(leftPosition)
    await page.waitForTimeout(200)
    expect((await snapshotOf(page)).documents.find(document => document.viewId === viewId)?.scrollTop).toBe(leftPosition)
  })

  test('shared views keep a single dirty-close decision and Save As writes the remaining draft', async() => {
    const savePath = path.join(path.dirname(primaryFilePath), 'shared-save-as.md')
    await app.evaluate(({ ipcMain }, target) => {
      const state = { calls: 0, decision: 'cancel' }
      ;(global as unknown as { __sharedClose: typeof state }).__sharedClose = state
      ipcMain.removeHandler('mt::workspace::confirm-document-close')
      ipcMain.handle('mt::workspace::confirm-document-close', () => { state.calls++; return state.decision })
      ipcMain.removeHandler('mt::workspace::choose-document-path')
      ipcMain.handle('mt::workspace::choose-document-path', () => ({ status: 'selected', pathname: target }))
    }, savePath)
    await tabMenuAction(app, page.locator(tabSelector).nth(1), 'Split Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    await appendInPane(page, 1, ' DIRTY')
    await expect.poll(() => paneText(page, 0)).toContain('DIRTY')
    await page.locator('.workspace-pane').nth(0).locator(tabSelector).nth(1).locator('.close-icon').click()
    await expect(page.locator(tabSelector)).toHaveCount(2)
    expect(await app.evaluate(() => (global as unknown as { __sharedClose: { calls: number } }).__sharedClose.calls)).toBe(0)
    await page.locator('.workspace-pane').nth(1).locator('.close-icon').click()
    await expect.poll(() => app.evaluate(() => (global as unknown as { __sharedClose: { calls: number } }).__sharedClose.calls)).toBe(1)
    await expect(page.locator(tabSelector)).toHaveCount(2)
    expect(fs.existsSync(savePath)).toBe(false)
    await app.evaluate(() => { (global as unknown as { __sharedClose: { decision: string } }).__sharedClose.decision = 'save' })
    await page.locator('.workspace-pane').nth(1).locator('.close-icon').click()
    await expect.poll(() => fs.existsSync(savePath)).toBe(true)
    await expect.poll(() => fs.readFileSync(savePath, 'utf8')).toContain('DIRTY')
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    await expect(page.locator(tabSelector)).toHaveCount(1)
  })

  test('a right-focused split keeps new tabs and normal file opens on the left', async() => {
    await tabMenuAction(app, page.locator(tabSelector).nth(1), 'Split Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    const filePath = path.join(path.dirname(primaryFilePath), 'fresh-left.md')
    fs.writeFileSync(filePath, 'fresh left document\n')
    await page.evaluate(file => window.electron.ipcRenderer.send('mt::open-file', file, {}), filePath)
    await expect(page.locator('.workspace-pane').nth(0).locator(tabSelector)).toHaveCount(3)
    await expect.poll(() => paneText(page, 0)).toContain('fresh left document')
    await page.locator('.workspace-pane').nth(1).click()
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'fresh left tab\n')
    await expect(page.locator('.workspace-pane').nth(0).locator(tabSelector)).toHaveCount(4)
    await expect(page.locator('.workspace-pane').nth(1).locator(tabSelector)).toHaveCount(1)
    expect((await snapshotOf(page)).projection.focusedPaneId).toBe('left')
  })

  test('mixed WYSIWYG and Source views stay visible and share edits and undo', async() => {
    await tabMenuAction(app, page.locator(tabSelector).nth(1), 'Split Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    await waitForMenuReady(app)
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    const source = page.locator('.workspace-pane').nth(1).locator('.CodeMirror')
    await expect(source).toBeVisible()
    await expect(page.locator('.workspace-pane').nth(0).locator('.editor-wrapper')).not.toHaveClass(/source/)
    await source.click()
    await source.evaluate(element => {
      const cm = (element as unknown as Element & { CodeMirror: { setCursor(position: { line: number; ch: number }): void; replaceSelection(text: string): void } }).CodeMirror
      cm.setCursor({ line: 0, ch: 9 })
      cm.replaceSelection(' SOURCE')
    })
    await expect.poll(() => paneText(page, 0)).toContain('SOURCE')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => paneText(page, 0)).not.toContain('SOURCE')
    await appendInPane(page, 0, ' WYSIWYG')
    await expect(source).toBeVisible()
    await expect(source).toContainText('WYSIWYG')
    await page.screenshot({ path: test.info().outputPath('shared-document-mixed-mode.png') })
    await page.locator('.workspace-pane').nth(1).locator('.tab-select').click()
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => paneText(page, 0)).not.toContain('WYSIWYG')
    await page.locator('.workspace-pane').nth(0).locator(tabSelector).nth(0).locator('.close-icon').click()
    await page.locator('.workspace-pane').nth(0).locator(tabSelector).nth(0).locator('.close-icon').click()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    const survivingSource = page.locator('.CodeMirror')
    await expect(survivingSource).toBeVisible()
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'redo')
    await expect(survivingSource).toContainText('WYSIWYG')
  })

  test('previews edge candidates, cancels invalid gestures, and moves only on document-area release', async() => {
    const root = await workspaceBox(page)
    const tab = page.locator(tabSelector).nth(1)
    const initialTabOrder = await page.locator(tabSelector).evaluateAll(tabs => tabs.map(tab => tab.getAttribute('data-id')))
    const documentY = root.y + root.height * 0.55

    await dragTabTo(page, tab, root.x + 4, documentY)
    await expect(page.locator('.editor-with-tabs')).toHaveClass(/preview-left/)
    await expect.poll(() => page.locator('.editor-with-tabs').evaluate((element) => getComputedStyle(element, '::before').transitionDuration)).toBe('0.18s')
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)

    await dragTabTo(page, page.locator(tabSelector).nth(0), root.x + root.width + 20, documentY)
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    expect(await page.locator(tabSelector).evaluateAll(tabs => tabs.map(tab => tab.getAttribute('data-id')))).toEqual(initialTabOrder)

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

  test('moves a tab exactly once when physically released in the right split target', async() => {
    await page.locator(tabSelector).nth(1).locator('.close-icon').click()
    await expect(page.locator(tabSelector)).toHaveCount(1)
    const secondaryFilePath = path.join(path.dirname(primaryFilePath), 'beta.md')
    fs.writeFileSync(secondaryFilePath, 'beta pane\n', 'utf8')
    await page.evaluate(filePath => window.electron.ipcRenderer.send('mt::open-file', filePath, {}), secondaryFilePath)
    await expect(page.locator(tabSelector)).toHaveCount(2)

    const root = await workspaceBox(page)
    const tab = page.locator(tabSelector).nth(1)

    await releaseTabAt(page, tab, root.x + root.width - 4, root.y + root.height * 0.55)
    await expect(page.locator('.workspace-pane')).toHaveCount(2)

    const paneTabs = page.locator('.workspace-pane').locator(tabSelector)
    await expect(page.locator('.workspace-pane').nth(0).locator(tabSelector)).toHaveCount(1)
    await expect(page.locator('.workspace-pane').nth(1).locator(tabSelector)).toHaveCount(1)
    await expect(page.locator('.workspace-pane').nth(0).locator(tabSelector)).toHaveAttribute('title', primaryFilePath)
    await expect(page.locator('.workspace-pane').nth(1).locator(tabSelector)).toHaveAttribute('title', secondaryFilePath)

    const ownership = await paneTabs.evaluateAll((tabs) => tabs.map(tab => ({
      documentId: tab.getAttribute('data-id'),
      pathname: tab.getAttribute('title')
    })))
    expect(ownership.every(tabState => !!tabState.documentId && !!tabState.pathname)).toBe(true)
    expect(new Set(ownership.map(tabState => tabState.documentId)).size).toBe(ownership.length)
    expect(new Set(ownership.map(tabState => tabState.pathname)).size).toBe(ownership.length)
    for (const pane of await page.locator('.workspace-pane').all()) {
      await expect(pane.locator(`${tabSelector}.active`)).toHaveCount(1)
      await expect(pane.locator(`${tabSelector} .tab-select[aria-selected="true"]`)).toHaveCount(1)
    }

    await page.locator('.workspace-pane').nth(1).locator(`${tabSelector} .close-icon`).click()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    await expect(page.locator(tabSelector)).toHaveCount(1)
    await expect(page.locator(tabSelector)).toHaveAttribute('title', primaryFilePath)
    await expect(page.locator(tabSelector)).not.toHaveAttribute('title', secondaryFilePath)
    await expect(page.locator(`${tabSelector}.active`)).toHaveCount(1)
    await expect(page.locator(`${tabSelector} .tab-select[aria-selected="true"]`)).toHaveCount(1)
    expect(page.isClosed()).toBe(false)
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    expect(app.process().exitCode).toBe(null)
  })

  test('reorders at tab-bar edges without previewing or committing a split', async() => {
    const tabs = page.locator(tabSelector)
    const tabBar = page.locator('.editor-tabs')
    const tabBarBox = await tabBar.boundingBox()
    if (!tabBarBox) throw new Error('tab bar is not visible')
    await expect(tabs).toHaveCount(2)

    const initialOrder = await tabs.evaluateAll((items) => items.map((item) => item.getAttribute('data-id')))
    const rightTabBox = await tabs.nth(1).boundingBox()
    if (!rightTabBox) throw new Error('right tab is not visible')
    const rightEdge = rightTabBox.x + rightTabBox.width - 5

    await dragTabTo(page, tabs.nth(0), rightEdge, tabBarBox.y + tabBarBox.height / 2)
    await expect(page.locator('.editor-with-tabs')).not.toHaveClass(/preview/)
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    await expect.poll(() => tabs.evaluateAll((items) => items.map((item) => item.getAttribute('data-id')))).toEqual([
      initialOrder[1], initialOrder[0]
    ])

    const leftTabBox = await tabs.nth(0).boundingBox()
    if (!leftTabBox) throw new Error('left tab is not visible')
    await dragTabTo(page, tabs.nth(1), leftTabBox.x + Math.max(5, leftTabBox.width / 4), tabBarBox.y + tabBarBox.height / 2)
    await expect(page.locator('.editor-with-tabs')).not.toHaveClass(/preview/)
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(1)
    await expect.poll(() => tabs.evaluateAll((items) => items.map((item) => item.getAttribute('data-id')))).toEqual(initialOrder)
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
    await expect(page.locator('.workspace-pane').nth(0).locator(tabSelector)).toHaveCount(2)
    await tabMenuAction(app, page.locator('.workspace-pane').nth(0).locator('.tabs-container > li.active'), 'Move to Right')
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

  test('enforces the 720px edge-move threshold, split minimums, reset, reduced motion, and no third pane', async() => {
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
