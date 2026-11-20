import { expect, test } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { execFileSync, type ChildProcess } from 'node:child_process'
import {
  clickMenuById,
  closeDiscardingChanges,
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer
} from './helpers'
import type { WorkspaceFacadeSnapshot } from '../../src/shared/workspace'

// Source-code mode mounts the same find bar as the WYSIWYG editor, wired to
// CodeMirror: every match carries `.mt-source-search-match`, the active one
// `.mt-source-search-active`.

const DOC = '# Source find\n\nalpha needle one\nbeta Needle two needle\ngamma needles three\n'

const SEARCH_BAR = '.search-bar'
const FIND_INPUT = '.search-bar .search input'
const REPLACE_INPUT = '.search-bar .replace .input-wrapper input'
const RESULT_COUNTER = '.search-bar .search-result'
const REPLACE_ALL_BTN = '.search-bar .replace .button-group .button.right'
const REPLACE_SINGLE_BTN = '.search-bar .replace .button-group .button:not(.right)'
const FIND_PREV_BTN = '.search-bar .search .button-group .button.right'
const FIND_NEXT_BTN = '.search-bar .search .button-group .button:not(.right)'
const ACTIVE_MARK = '.source-code .mt-source-search-active'
const ANY_MARK = '.source-code .mt-source-search-match, .source-code .mt-source-search-active'

interface MarkSummary { active: number; total: number }

type CodeMirrorElement = Element & {
  CodeMirror: {
    getValue(): string
    setValue(v: string): void
    setCursor(line: number, ch: number): void
    setSelection(anchor: { line: number; ch: number }, head: { line: number; ch: number }): void
    getSelection(): string
    getCursor(which: string): { line: number; ch: number }
    hasFocus(): boolean
    getAllMarks(): Array<{ className?: string }>
    focus(): void
  }
}

type EditorCommand =
  | { kind: 'value' }
  | { kind: 'set'; value: string }
  | { kind: 'focus' }
  | { kind: 'select'; from: [number, number]; to: [number, number] }
  | { kind: 'selection' }
  | { kind: 'marks' }

// Runs `command` on the CodeMirror in pane `pane` (0 is the only or left one).
const inEditor = <T>(page: Page, pane: number, command: EditorCommand): Promise<T> =>
  page.evaluate(({ pane, command }) => {
    const root = document.querySelectorAll('.workspace-pane')[pane] ?? document
    const cm = (root.querySelector('.source-code .CodeMirror') as CodeMirrorElement).CodeMirror
    switch (command.kind) {
      case 'value':
        return cm.getValue()
      case 'set':
        cm.setValue(command.value)
        cm.setCursor(0, 0)
        cm.focus()
        return null
      case 'focus':
        cm.focus()
        return null
      case 'select':
        cm.setSelection(
          { line: command.from[0], ch: command.from[1] },
          { line: command.to[0], ch: command.to[1] }
        )
        return null
      case 'selection':
        return { text: cm.getSelection(), from: cm.getCursor('from'), focused: cm.hasFocus() }
      case 'marks': {
        const classes = cm.getAllMarks().map(m => m.className)
        return {
          active: classes.filter(c => c === 'mt-source-search-active').length,
          total: classes.filter(c => c === 'mt-source-search-active' || c === 'mt-source-search-match').length
        }
      }
    }
  }, { pane, command }) as Promise<T>

const sourceValue = (page: Page, pane = 0): Promise<string> => inEditor(page, pane, { kind: 'value' })

const setSource = async(page: Page, value: string, pane = 0): Promise<void> => {
  await inEditor(page, pane, { kind: 'set', value })
}

const marks = (page: Page, pane = 0): Promise<MarkSummary> => inEditor(page, pane, { kind: 'marks' })

const clickByEval = async(page: Page, selector: string): Promise<void> => {
  const clicked = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) return false
    el.click()
    return true
  }, selector)
  if (!clicked) throw new Error('clickByEval: no element matched ' + selector)
}

// Playwright's keyboard does not reach the main-process shortcut handler;
// `sendInputEvent` takes the same path as a physical key press.
const pressShortcut = async(app: ElectronApplication, keyCode: string, modifiers: string[] = []): Promise<void> => {
  await app.evaluate(({ BrowserWindow }, { keyCode, modifiers }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers } as Electron.KeyboardInputEvent)
    contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers } as Electron.KeyboardInputEvent)
  }, { keyCode, modifiers })
}

const openFind = async(app: ElectronApplication, page: Page, action = 'find'): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-edit-action', action)
  await expect(page.locator(SEARCH_BAR)).toBeVisible({ timeout: 5000 })
}

const closeBar = async(page: Page): Promise<void> => {
  const bar = page.locator(SEARCH_BAR)
  if (await bar.isVisible()) {
    await page.keyboard.press('Escape')
    await expect(bar).toBeHidden({ timeout: 5000 })
  }
  await expect.poll(() => marks(page)).toEqual({ active: 0, total: 0 })
}

const search = async(page: Page, query: string, counter: string): Promise<void> => {
  await page.locator(FIND_INPUT).fill(query)
  await expect.poll(() => page.locator(RESULT_COUNTER).innerText()).toBe(counter)
}

const TOGGLES = ['.is-case-sensitive', '.is-whole-word', '.is-regex']

// The bar keeps its toggles across close; start every test with them off.
const resetToggles = async(app: ElectronApplication, page: Page): Promise<void> => {
  await closeBar(page)
  if (!(await page.locator(SEARCH_BAR).count())) return
  await openFind(app, page)
  for (const toggle of TOGGLES) await setToggle(page, toggle, false)
  await closeBar(page)
}

const setToggle = async(page: Page, selector: string, on: boolean): Promise<void> => {
  const toggle = page.locator(`.search-bar ${selector}`)
  if ((await toggle.getAttribute('class'))?.includes('active') !== on) await toggle.click()
}

test.describe('Find and replace in source-code mode', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    ;({ app, page } = await launchWithMarkdown(DOC))
    await enterSourceMode(page, app)
  })

  test.afterAll(async() => {
    if (app) await closeDiscardingChanges(app)
  })

  test.beforeEach(async() => {
    await resetToggles(app, page)
    await setSource(page, DOC)
  })

  test('Ctrl+F opens the bar with focus, counts and highlights every match', async() => {
    await page.locator('.source-code .CodeMirror').click()
    await pressShortcut(app, 'F', ['control'])
    await expect(page.locator(SEARCH_BAR)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(FIND_INPUT)).toBeFocused()

    await search(page, 'needle', '1 / 4')
    await expect.poll(() => marks(page)).toEqual({ active: 1, total: 4 })
    await expect(page.locator(ACTIVE_MARK)).toHaveCount(1)
    await expect(page.locator(ANY_MARK)).toHaveCount(4)
    await expect(page.locator(ACTIVE_MARK)).toHaveText('needle')
    await expectNoRendererErrors(app)
  })

  test('next and previous move the active match and wrap around', async() => {
    await openFind(app, page)
    await search(page, 'needle', '1 / 4')

    await page.locator(FIND_INPUT).press('Enter')
    await expect(page.locator(RESULT_COUNTER)).toHaveText('2 / 4')
    await pressShortcut(app, 'F3')
    await expect(page.locator(RESULT_COUNTER)).toHaveText('3 / 4')
    await clickByEval(page, FIND_NEXT_BTN)
    await expect(page.locator(RESULT_COUNTER)).toHaveText('4 / 4')
    await clickByEval(page, FIND_NEXT_BTN)
    await expect(page.locator(RESULT_COUNTER)).toHaveText('1 / 4')
    await pressShortcut(app, 'F3', ['shift'])
    await expect(page.locator(RESULT_COUNTER)).toHaveText('4 / 4')
    await clickByEval(page, FIND_PREV_BTN)
    await expect(page.locator(RESULT_COUNTER)).toHaveText('3 / 4')
    // Still one active match; the new one is the third `needle`.
    await expect.poll(() => marks(page)).toEqual({ active: 1, total: 4 })
    await expect(page.locator(ACTIVE_MARK)).toHaveText('needle')
  })

  test('case, whole-word and regexp toggles change the matches', async() => {
    await openFind(app, page)
    await search(page, 'needle', '1 / 4')

    await setToggle(page, '.is-case-sensitive', true)
    await search(page, 'Needle', '1 / 1')
    await setToggle(page, '.is-case-sensitive', false)

    await setToggle(page, '.is-whole-word', true)
    await search(page, 'needle', '1 / 3')
    await setToggle(page, '.is-whole-word', false)

    await setToggle(page, '.is-regex', true)
    await search(page, '^\\w+ need', '1 / 3')
    await search(page, 'needles?\\s\\w+$', '1 / 2')
    await page.locator(FIND_INPUT).fill('(unclosed')
    await expect(page.locator('.search-bar .error-msg')).toBeVisible()
    await search(page, 'need(le)', '1 / 4')
    await expect(page.locator('.search-bar .error-msg')).toHaveCount(0)
  })

  test('replaces the active match, then every match', async() => {
    await inEditor(page, 0, { kind: 'focus' })
    await pressShortcut(app, 'R', ['control'])
    await expect(page.locator(REPLACE_INPUT)).toBeVisible({ timeout: 5000 })
    await search(page, 'needle', '1 / 4')
    await page.locator(FIND_INPUT).press('Enter')
    await expect(page.locator(RESULT_COUNTER)).toHaveText('2 / 4')
    await page.locator(REPLACE_INPUT).fill('pin')

    await clickByEval(page, REPLACE_SINGLE_BTN)
    await expect.poll(() => sourceValue(page)).toBe(
      '# Source find\n\nalpha needle one\nbeta pin two needle\ngamma needles three\n'
    )
    // The match after the replaced one becomes active, as in the WYSIWYG editor.
    await expect(page.locator(RESULT_COUNTER)).toHaveText('2 / 3')
    await expect.poll(() => marks(page)).toEqual({ active: 1, total: 3 })

    await clickByEval(page, REPLACE_ALL_BTN)
    await expect.poll(() => sourceValue(page)).toBe(
      '# Source find\n\nalpha pin one\nbeta pin two pin\ngamma pins three\n'
    )
    await expect(page.locator(RESULT_COUNTER)).toHaveText('0 / 0')
    await expect.poll(() => marks(page)).toEqual({ active: 0, total: 0 })
  })

  test('a regexp replacement expands group references', async() => {
    await openFind(app, page, 'replace')
    await setToggle(page, '.is-regex', true)
    await search(page, '^(\\w+) (\\w+)', '1 / 3')
    await page.locator(REPLACE_INPUT).fill('$2 $1')
    await clickByEval(page, REPLACE_ALL_BTN)
    await expect.poll(() => sourceValue(page)).toBe(
      '# Source find\n\nneedle alpha one\nNeedle beta two needle\nneedles gamma three\n'
    )
    // Recounted with the regexp still on; as literal text the query would match nothing.
    await expect(page.locator(RESULT_COUNTER)).toHaveText('1 / 3')
    await setToggle(page, '.is-regex', false)
  })

  test('a one-line selection prefills the query; a multi-line one does not', async() => {
    await inEditor(page, 0, { kind: 'select', from: [4, 0], to: [4, 5] })
    await openFind(app, page)
    await expect(page.locator(FIND_INPUT)).toHaveValue('gamma')
    await expect(page.locator(RESULT_COUNTER)).toHaveText('1 / 1')
    await closeBar(page)

    await inEditor(page, 0, { kind: 'select', from: [2, 0], to: [3, 4] })
    await openFind(app, page)
    await expect(page.locator(FIND_INPUT)).toHaveValue('')
  })

  test('Escape closes the bar and selects the active match in CodeMirror', async() => {
    await openFind(app, page)
    await search(page, 'needle', '1 / 4')
    await page.locator(FIND_INPUT).press('Enter')
    await page.locator(FIND_INPUT).press('Enter')
    await expect(page.locator(RESULT_COUNTER)).toHaveText('3 / 4')

    await page.keyboard.press('Escape')
    await expect(page.locator(SEARCH_BAR)).toBeHidden()
    await expect.poll(() => marks(page)).toEqual({ active: 0, total: 0 })
    expect(await inEditor(page, 0, { kind: 'selection' })).toEqual({
      text: 'needle',
      from: expect.objectContaining({ line: 3, ch: 16 }),
      focused: true
    })
  })

  test('keeps the active match visible and clear of the bar', async() => {
    const filler = Array.from({ length: 200 }, (_, i) => `filler line ${i}`).join('\n')
    await setSource(page, `needle at the top\n${filler}\nneedle far below\n`)
    await openFind(app, page)
    await search(page, 'needle', '1 / 2')
    await page.locator(FIND_INPUT).press('Enter')
    await expect(page.locator(RESULT_COUNTER)).toHaveText('2 / 2')

    const isClear = async(): Promise<boolean> => page.evaluate(() => {
      const mark = document.querySelector('.source-code .mt-source-search-active')?.getBoundingClientRect()
      const box = document.querySelector('.source-code')?.getBoundingClientRect()
      const bar = document.querySelector('.search-bar')?.getBoundingClientRect()
      return !!(mark && box && bar) && mark.top >= bar.bottom && mark.bottom <= box.bottom
    })
    await expect.poll(isClear).toBe(true)

    // Wrapping to the first match scrolls back up, below the bar.
    await page.locator(FIND_INPUT).press('Enter')
    await expect(page.locator(RESULT_COUNTER)).toHaveText('1 / 2')
    await expect.poll(isClear).toBe(true)
  })

  test('the replaced text reaches the WYSIWYG editor', async() => {
    await openFind(app, page, 'replace')
    await search(page, 'needle', '1 / 4')
    await page.locator(REPLACE_INPUT).fill('thread')
    await clickByEval(page, REPLACE_ALL_BTN)
    await expect.poll(() => sourceValue(page)).not.toContain('needle')
    await closeBar(page)

    await exitSourceMode(page, app)
    const text = await page.locator('.editor-component').innerText()
    expect(text).toContain('alpha thread one')
    expect(text).toContain('gamma threads three')
    expect(text).not.toContain('needle')
    await enterSourceMode(page, app)
    await expectNoRendererErrors(app)
  })

  test('switching tabs closes the bar and leaves no highlights', async() => {
    await openFind(app, page)
    await search(page, 'needle', '1 / 4')

    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'other needle doc\n')
    await expect(page.locator('.tabs-container > li')).toHaveCount(2)
    await expect(page.locator(SEARCH_BAR)).toBeHidden()
    await expect(page.locator(ANY_MARK)).toHaveCount(0)

    await page.locator('.tabs-container > li').first().click()
    await enterSourceMode(page, app)
    await expect(page.locator(SEARCH_BAR)).toBeHidden()
    await expect.poll(() => marks(page)).toEqual({ active: 0, total: 0 })
    await expect(page.locator(ANY_MARK)).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// Split workspace: each pane's bar acts only on its own document.
// ---------------------------------------------------------------------------

const LEFT_MARKDOWN = 'Left needle stays here.\n\nLeft plain paragraph.\n'
const RIGHT_MARKDOWN = 'Right needle one and needle two.\n\nAnother needle on the right.\n'
const tabSelector = '.tabs-container > li'
const WYSIWYG_MATCH = '.mu-highlight, .mu-selection'

const snapshotOf = (page: Page): Promise<WorkspaceFacadeSnapshot> => page.evaluate(() =>
  (window as unknown as { __mtWorkspaceSnapshot(): WorkspaceFacadeSnapshot }).__mtWorkspaceSnapshot()
)

const paneAt = (page: Page, index: number): Locator => page.locator('.workspace-pane').nth(index)

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
  const pane = paneAt(page, index)
  const target = (await pane.locator('.source-code .CodeMirror').count())
    ? pane.locator('.source-code .CodeMirror-line').last()
    : pane.locator('span.mu-paragraph-content').last()
  await target.click()
  await expect.poll(async() => (await snapshotOf(page)).projection.focusedPaneId).toBe(index === 0 ? 'left' : 'right')
}

// Toggles source-code mode for the focused pane's active tab.
const toggleSourceInPane = async(app: ElectronApplication, page: Page, index: number, on: boolean): Promise<void> => {
  await focusPane(page, index)
  await clickMenuById(app, 'sourceCodeModeMenuItem')
  await expect(paneAt(page, index).locator('.source-code .CodeMirror')).toHaveCount(on ? 1 : 0, { timeout: 10_000 })
}

const openFindInPane = async(app: ElectronApplication, page: Page, index: number, action = 'find'): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-edit-action', action)
  await expect(paneAt(page, index).locator(SEARCH_BAR)).toBeVisible({ timeout: 5000 })
}

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

test.describe('Source-mode find in a split workspace', () => {
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
    await expect.poll(() => paneAt(page, 1).locator('.editor-component').innerText()).toContain('Another needle')
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

  test('a source pane and a WYSIWYG pane search independently', async() => {
    const left = paneAt(page, 0)
    const right = paneAt(page, 1)
    await toggleSourceInPane(app, page, 1, true)
    await expect(left.locator('.source-code')).toHaveCount(0)

    await openFindInPane(app, page, 1)
    await expect(left.locator(SEARCH_BAR)).toBeHidden()
    await expect(right.locator(SEARCH_BAR)).toHaveCount(1)
    await expect(right.locator(FIND_INPUT)).toBeFocused()
    await right.locator(FIND_INPUT).fill('needle')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('1 / 3')
    await expect.poll(() => marks(page, 1)).toEqual({ active: 1, total: 3 })
    expect(await left.locator(WYSIWYG_MATCH).count()).toBe(0)

    // Clicking the WYSIWYG pane leaves the source bar and its marks alone.
    await focusPane(page, 0)
    await expect(right.locator(SEARCH_BAR)).toBeVisible()
    expect(await marks(page, 1)).toEqual({ active: 1, total: 3 })
    expect(await inEditor<{ focused: boolean }>(page, 1, { kind: 'selection' })).toMatchObject({ focused: false })

    await openFindInPane(app, page, 0)
    await left.locator(FIND_INPUT).fill('needle')
    await expect.poll(() => left.locator(RESULT_COUNTER).innerText()).toBe('1 / 1')
    await expect.poll(() => left.locator(WYSIWYG_MATCH).count()).toBe(1)
    await expect(right.locator(SEARCH_BAR)).toBeVisible()
    expect(await right.locator(RESULT_COUNTER).innerText()).toBe('1 / 3')
    expect(await marks(page, 1)).toEqual({ active: 1, total: 3 })

    await page.keyboard.press('Escape')
    await expect(left.locator(SEARCH_BAR)).toBeHidden()
    await expect(right.locator(SEARCH_BAR)).toBeVisible()

    // A click into the source body closes the source bar only.
    await focusPane(page, 1)
    await expect(right.locator(SEARCH_BAR)).toBeHidden()
    await expect.poll(() => marks(page, 1)).toEqual({ active: 0, total: 0 })

    // Back in the source pane: replace there leaves the other document alone.
    await openFindInPane(app, page, 1, 'replace')
    await right.locator(FIND_INPUT).fill('needle')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('1 / 3')
    await right.locator(REPLACE_INPUT).fill('pin')
    await clickInPane(page, 1, REPLACE_ALL_BTN)
    await expect.poll(() => sourceValue(page, 1)).toBe('Right pin one and pin two.\n\nAnother pin on the right.\n')
    await expect(left.locator('.editor-component')).toContainText('Left needle stays here.')
    await expectNoRendererErrors(app)
  })

  test('two source panes search and replace independently', async() => {
    const left = paneAt(page, 0)
    const right = paneAt(page, 1)
    await toggleSourceInPane(app, page, 0, true)
    await toggleSourceInPane(app, page, 1, true)
    await expect(left.locator('.source-code .CodeMirror')).toHaveCount(1)

    await focusPane(page, 0)
    await openFindInPane(app, page, 0, 'replace')
    await expect(right.locator(SEARCH_BAR)).toBeHidden()
    await left.locator(FIND_INPUT).fill('needle')
    await expect.poll(() => left.locator(RESULT_COUNTER).innerText()).toBe('1 / 1')
    expect(await marks(page, 1)).toEqual({ active: 0, total: 0 })

    await focusPane(page, 1)
    await expect(left.locator(SEARCH_BAR)).toBeVisible()
    expect(await marks(page, 0)).toEqual({ active: 1, total: 1 })
    await openFindInPane(app, page, 1, 'replace')
    await right.locator(FIND_INPUT).fill('needle')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('1 / 3')
    expect(await marks(page, 0)).toEqual({ active: 1, total: 1 })
    expect(await left.locator(RESULT_COUNTER).innerText()).toBe('1 / 1')
    await right.locator(REPLACE_INPUT).fill('pin')
    await clickInPane(page, 1, REPLACE_SINGLE_BTN)
    await expect.poll(() => sourceValue(page, 1)).toBe('Right pin one and needle two.\n\nAnother needle on the right.\n')
    await expect(right.locator(RESULT_COUNTER)).toHaveText('1 / 2')
    expect(await sourceValue(page, 0)).toContain('Left needle stays here.')
    await expectNoRendererErrors(app)
  })
})

// ---------------------------------------------------------------------------
// One document in both panes: an edit in either pane recounts the other's bar.
// ---------------------------------------------------------------------------

const SHARED_MARKDOWN = 'Shared needle one and needle two.\n\nAnother needle here.\n'

// Types at the end of the line holding "Another needle here.", from a click
// that focuses the pane. A source pane takes the text as one CodeMirror input
// edit: keyboard typing there loses focus after the first character whenever
// the other pane shows the same document, with or without a find bar.
const typeAtEnd = async(page: Page, index: number, text: string): Promise<void> => {
  const pane = paneAt(page, index)
  const isSource = (await pane.locator('.source-code .CodeMirror').count()) > 0
  const line = isSource
    ? pane.locator('.source-code .CodeMirror-line', { hasText: 'Another needle here.' })
    : pane.locator('span.mu-paragraph-content', { hasText: 'Another needle here.' })
  await line.click()
  await expect.poll(async() => (await snapshotOf(page)).projection.focusedPaneId).toBe(index === 0 ? 'left' : 'right')
  if (!isSource) {
    await page.keyboard.press('End')
    await page.keyboard.type(text, { delay: 20 })
    return
  }
  await page.evaluate(({ paneIndex, insert }) => {
    const root = document.querySelectorAll('.workspace-pane')[paneIndex]
    const cm = (root.querySelector('.source-code .CodeMirror') as Element & {
      CodeMirror: { getLine(n: number): string; lineCount(): number; replaceRange(text: string, at: { line: number; ch: number }, to?: undefined, origin?: string): void }
    }).CodeMirror
    for (let line = 0; line < cm.lineCount(); line++) {
      const text = cm.getLine(line)
      if (text.includes('Another needle here.')) {
        cm.replaceRange(insert, { line, ch: text.length }, undefined, '+input')
        return
      }
    }
  }, { paneIndex: index, insert: text })
}

const activePaneIndex = (page: Page): Promise<number> => page.evaluate(() =>
  [...document.querySelectorAll('.workspace-pane')].findIndex(pane => pane.contains(document.activeElement))
)

// The bar searches 150ms after the last keystroke, and a refresh from the
// split can count the query first; stepping before that search lands would
// be undone by it.
const settleQuery = (page: Page): Promise<void> => page.waitForTimeout(400)

const replaceAllIn = async(app: ElectronApplication, page: Page, index: number, from: string, to: string): Promise<void> => {
  await openFindInPane(app, page, index, 'replace')
  const pane = paneAt(page, index)
  await pane.locator(FIND_INPUT).fill(from)
  await expect.poll(() => pane.locator(RESULT_COUNTER).innerText()).toMatch(/^1 \//)
  await pane.locator(REPLACE_INPUT).fill(to)
  await clickInPane(page, index, REPLACE_ALL_BTN)
}

test.describe('Source-mode find on one document open in both panes', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    ;({ app, page } = await launchWithMarkdown(SHARED_MARKDOWN))
    await page.setViewportSize({ width: 1280, height: 760 })
    await page.waitForSelector('.tabs-container', { state: 'attached' })
    await tabMenuAction(app, page.locator(tabSelector), 'Split Right')
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    await expect.poll(() => paneAt(page, 1).locator('.editor-component').innerText()).toContain('Another needle here.')
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

  test('a source bar recounts after the WYSIWYG pane types and replaces', async() => {
    const right = paneAt(page, 1)
    await toggleSourceInPane(app, page, 1, true)
    await openFindInPane(app, page, 1)
    await right.locator(FIND_INPUT).fill('needle')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('1 / 3')
    await settleQuery(page)
    await right.locator(FIND_INPUT).press('Enter')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('2 / 3')

    await typeAtEnd(page, 0, ' needle typed quickly')
    await expect.poll(() => paneAt(page, 0).locator('.editor-component').innerText())
      .toContain('Another needle here. needle typed quickly')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('2 / 4')
    await expect.poll(() => marks(page, 1)).toEqual({ active: 1, total: 4 })
    await expect(right.locator(SEARCH_BAR)).toBeVisible()
    expect(await activePaneIndex(page)).toBe(0)

    await replaceAllIn(app, page, 0, 'needle', 'pin')
    await expect.poll(() => sourceValue(page, 1)).toContain('Another pin here. pin typed quickly')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('0 / 0')
    await expect.poll(() => marks(page, 1)).toEqual({ active: 0, total: 0 })
    await expect(right.locator(SEARCH_BAR)).toBeVisible()
    await expectNoRendererErrors(app)
  })

  test('a WYSIWYG bar recounts after the source pane types and replaces', async() => {
    const left = paneAt(page, 0)
    await toggleSourceInPane(app, page, 1, true)
    await focusPane(page, 0)
    await openFindInPane(app, page, 0)
    await left.locator(FIND_INPUT).fill('needle')
    await expect.poll(() => left.locator(RESULT_COUNTER).innerText()).toBe('1 / 3')
    await settleQuery(page)
    await left.locator(FIND_INPUT).press('Enter')
    await expect.poll(() => left.locator(RESULT_COUNTER).innerText()).toBe('2 / 3')

    await typeAtEnd(page, 1, ' needle typed quickly')
    await expect.poll(() => sourceValue(page, 1)).toContain('Another needle here. needle typed quickly')
    await expect.poll(() => left.locator(RESULT_COUNTER).innerText()).toBe('2 / 4')
    await expect.poll(() => left.locator(WYSIWYG_MATCH).count()).toBe(4)
    await expect(left.locator(SEARCH_BAR)).toBeVisible()
    await typeAtEnd(page, 1, '!')
    await expect.poll(() => sourceValue(page, 1)).toContain('needle typed quickly!')

    await replaceAllIn(app, page, 1, 'needle', 'pin')
    await expect.poll(() => left.locator('.editor-component').innerText()).toContain('Another pin here. pin typed quickly!')
    await expect.poll(() => left.locator(RESULT_COUNTER).innerText()).toBe('0 / 0')
    await expect.poll(() => left.locator(WYSIWYG_MATCH).count()).toBe(0)
    await expect(left.locator(SEARCH_BAR)).toBeVisible()
    await expectNoRendererErrors(app)
  })

  test('two source panes recount each other', async() => {
    const right = paneAt(page, 1)
    await toggleSourceInPane(app, page, 0, true)
    await toggleSourceInPane(app, page, 1, true)
    await openFindInPane(app, page, 1)
    await right.locator(FIND_INPUT).fill('needle')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('1 / 3')

    await typeAtEnd(page, 0, ' needle typed quickly')
    await expect.poll(() => sourceValue(page, 0)).toContain('Another needle here. needle typed quickly')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('1 / 4')
    await expect.poll(() => marks(page, 1)).toEqual({ active: 1, total: 4 })

    await replaceAllIn(app, page, 0, 'needle', 'pin')
    await expect.poll(() => sourceValue(page, 1)).toContain('Another pin here. pin typed quickly')
    await expect.poll(() => right.locator(RESULT_COUNTER).innerText()).toBe('0 / 0')
    await expect(right.locator(SEARCH_BAR)).toBeVisible()
    await expectNoRendererErrors(app)
  })
})
