import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import {
  launchElectron,
  launchWithMarkdown,
  getMarkdownContent,
  enterSourceMode,
  exitSourceMode,
  typeIntoEditor,
  placeCaretInEditor,
  setSourceMarkdown,
  sendIpcToRenderer,
  waitForEditor,
  closeDiscardingChanges
} from './helpers'

test.describe('Editor input and source-mode roundtrip', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Hello\n\nStarting paragraph.\n')
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await closeDiscardingChanges(app)
  })

  test('Initial markdown is loaded into the editor', async() => {
    const markdown = await getMarkdownContent(page, app)
    expect(markdown).toContain('# Hello')
    expect(markdown).toContain('Starting paragraph.')
  })

  test('Toggling source mode preserves content', async() => {
    await enterSourceMode(page, app)
    const md = await page.evaluate(() => {
      const cm = document.querySelector('.source-code .CodeMirror') as
        | (Element & { CodeMirror: { getValue(): string } })
        | null
      return cm ? cm.CodeMirror.getValue() : ''
    })
    expect(md).toContain('# Hello')
    await exitSourceMode(page, app)
    // Leaving Source mode reloads the editor and shows it again once its
    // scroll position is restored; wait for that rather than sampling once.
    await expect(page.locator('.editor-component')).toBeVisible()
  })

  test('Typing into the editor appends content', async() => {
    await typeIntoEditor(page, ' typed-token')
    await expect.poll(async() => await getMarkdownContent(page, app)).toContain('typed-token')
  })
})

test.describe('Source-mode entry preserves pending WYSIWYG input', () => {
  test('immediately entering source mode preserves the tail after save and reopen', async() => {
    const tail = ' SOURCE-MODE-ENTRY-TAIL-7e4d1c '
    const launched = await launchWithMarkdown('pending source-mode input\n')
    let app = launched.app
    let page = launched.page

    try {
      await typeIntoEditor(page, tail)
      await enterSourceMode(page, app)

      const sourceValue = await page.evaluate(() => {
        const cm = document.querySelector('.source-code .CodeMirror') as
          | (Element & { CodeMirror?: { getValue(): string } })
          | null
        return cm?.CodeMirror?.getValue() ?? ''
      })
      expect(sourceValue).toContain(tail)

      await exitSourceMode(page, app)
      await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
      await expect.poll(() => fs.readFileSync(launched.filePath, 'utf8')).toContain(tail)

      await closeDiscardingChanges(app)
      const reopened = await launchElectron([launched.filePath])
      app = reopened.app
      page = reopened.page
      await waitForEditor(page)
      await expect.poll(async() => await getMarkdownContent(page, app)).toContain(tail)
    } finally {
      await closeDiscardingChanges(app)
    }
  })
})

const WORD_COUNT_TEXT = '.app-status-bar .word-count .text-center-vertical'

const counterText = (page: Page): Promise<string> => page.locator(WORD_COUNT_TEXT).innerText()

const counterValue = async(page: Page): Promise<number> => {
  const text = await counterText(page)
  const match = text.trim().match(/(\d+)\s*$/)
  return match ? Number(match[1]) : NaN
}

// Expected values stay independent from the desktop state wiring under test.
const expectedCount = (
  markdown: string
): { word: number; paragraph: number; character: number; all: number } => {
  const paragraph = markdown.split(/\n{2,}/).filter((line) => line).length
  const removedChinese = markdown.replace(/[一-龥]/g, '')
  const tokens = removedChinese.split(/\s+/).filter((t) => t)
  const chineseWordLength = markdown.length - removedChinese.length
  const word = chineseWordLength + tokens.length
  const character = tokens.reduce((acc, t) => acc + t.length, 0) + chineseWordLength
  const all = markdown.length
  return { word, paragraph, character, all }
}

test.describe('Status-bar word counter (item 24)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Counter\n\nOne two three.\n')
    app = launched.app
    page = launched.page
    await placeCaretInEditor(page)
  })

  test.afterAll(async() => {
    if (app) await closeDiscardingChanges(app)
  })

  test('the counter is mounted and starts in word ("W") mode', async() => {
    const counter = page.locator(WORD_COUNT_TEXT)
    await expect(counter).toBeVisible({ timeout: 5000 })
    await expect.poll(() => counterText(page)).toMatch(/^W\s/)

    const markdown = await getMarkdownContent(page, app)
    expect(expectedCount(markdown).word).toBeGreaterThan(0)
    await expect
      .poll(() => counterValue(page), { timeout: 5000 })
      .toBe(expectedCount(markdown).word)
    await expect(page.locator('.title-bar .word-count')).toHaveCount(0)
  })

  test('the detail tooltip retains all four counts', async() => {
    await page.locator('.app-status-bar .word-count').hover()
    const tooltip = page.getByRole('tooltip').last()
    await expect(tooltip).toContainText('Words:')
    await expect(tooltip).toContainText('Paragraphs:')
    await expect(tooltip).toContainText('Characters:')
    await expect(tooltip).toContainText('All characters:')
  })

  test('opening and switching seeded tabs updates the counter before any edit', async() => {
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'alpha beta gamma\n')
    await expect
      .poll(async() => (await getMarkdownContent(page, app)).trim(), { timeout: 5000 })
      .toBe('alpha beta gamma')
    await expect.poll(() => counterValue(page), { timeout: 5000 }).toBe(3)

    await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
    await expect
      .poll(async() => (await getMarkdownContent(page, app)).trim(), { timeout: 5000 })
      .toBe('# Counter\n\nOne two three.')
    await expect.poll(() => counterValue(page), { timeout: 5000 }).toBe(5)
  })

  test('typing ASCII words + CJK characters raises the word count to the engine value', async() => {
    const before = await counterValue(page)

    // Place the caret at the end of the "One two three." paragraph and append a
    // mix of ASCII words and CJK characters. Each CJK char counts as its own
    // word, so the count must climb (in particular the two CJK chars 你 好 each
    // add a word).
    await placeCaretInEditor(page)
    await typeIntoEditor(page, ' four five 你好')

    // The counter updates async after the json-change round-trip; it must have
    // strictly increased over the pre-typing baseline.
    await expect.poll(() => counterValue(page), { timeout: 5000 }).toBeGreaterThan(before)

    // The independently derived value verifies both live updates and CJK handling.
    const markdown = await getMarkdownContent(page, app)
    await expect
      .poll(() => counterValue(page), { timeout: 5000 })
      .toBe(expectedCount(markdown).word)
  })

  test('the counter follows the active display mode as it is cycled', async() => {
    // Seed a deterministic two-paragraph document via source mode so each mode
    // reads a known value independent of earlier typing in this shared app.
    await setSourceMarkdown(page, app, 'alpha beta\n\ngamma 字数\n')
    await page.waitForTimeout(400)

    // Derive the four expected values from the exact markdown that is loaded.
    const markdown = await getMarkdownContent(page, app)
    const expected = expectedCount(markdown)

    const counter = page.locator(WORD_COUNT_TEXT)

    // Default word mode: "W" prefix.
    await expect.poll(() => counterText(page)).toMatch(/^W\s/)
    await expect.poll(() => counterValue(page)).toBe(expected.word)

    // Click cycles word -> paragraph.
    await counter.click()
    await expect.poll(() => counterText(page)).toMatch(/^P\s/)
    await expect.poll(() => counterValue(page)).toBe(expected.paragraph)

    // paragraph -> character.
    await counter.click()
    await expect.poll(() => counterText(page)).toMatch(/^C\s/)
    await expect.poll(() => counterValue(page)).toBe(expected.character)

    // character -> all (raw markdown length, with spaces).
    await counter.click()
    await expect.poll(() => counterText(page)).toMatch(/^A\s/)
    await expect.poll(() => counterValue(page)).toBe(expected.all)

    // all -> wraps back to word.
    await counter.click()
    await expect.poll(() => counterText(page)).toMatch(/^W\s/)
    await expect.poll(() => counterValue(page)).toBe(expected.word)
  })
})

// ---------------------------------------------------------------------------
// Coverage backfill (checklist item 169). Edit > Select All flows through
// `mt::editor-edit-action` ('selectAll') -> store/listenForMain.ts
// EDITOR_EDIT_ACTION -> bus 'selectAll' -> editor.vue handleSelectAll, which
// calls editor.value.selectAll() ONLY when editor.value.hasFocus(); when focus
// is in an INPUT/TEXTAREA it does a field .select() and skips the editor.
// No prior unit/e2e covers the menu-driven selectAll (issue-4346 uses a DOM
// range, not the menu action). The engine escalation rules are unit-covered in
// packages/muya/src/selection/__tests__/selectAll.spec.ts; this spec locks the
// desktop IPC + focus-branch wiring against the real engine.
// ---------------------------------------------------------------------------

test.describe('Edit > Select All (item 169)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(
      'First paragraph alpha.\n\nMiddle paragraph beta.\n\nLast paragraph gamma.\n'
    )
    app = launched.app
    page = launched.page
  })

  test.afterAll(async() => {
    if (app) await closeDiscardingChanges(app)
  })

  test('Select All escalates the selection to the whole WYSIWYG document', async() => {
    // Start from a collapsed caret inside the first block. The engine's
    // selectAll escalates (caret -> whole block -> whole document), and the
    // application menu invokes it repeatedly, so we invoke until the selection
    // spans every block (text from the first AND the last paragraph present).
    await placeCaretInEditor(page)

    const wholeDoc = async(): Promise<boolean> => {
      await sendIpcToRenderer(app, 'mt::editor-edit-action', 'selectAll')
      await page.waitForTimeout(120)
      const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
      return (
        selected.includes('First paragraph alpha.') && selected.includes('Last paragraph gamma.')
      )
    }

    await expect.poll(wholeDoc, { timeout: 5000 }).toBe(true)

    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '')
    expect(selected).toContain('First paragraph alpha.')
    expect(selected).toContain('Middle paragraph beta.')
    expect(selected).toContain('Last paragraph gamma.')
  })

  test('Select All while focus is in the search input leaves the editor selection alone', async() => {
    // Establish a known whole-document editor selection first (escalate fully).
    await placeCaretInEditor(page)
    await expect
      .poll(
        async() => {
          await sendIpcToRenderer(app, 'mt::editor-edit-action', 'selectAll')
          await page.waitForTimeout(120)
          return page.evaluate(() => window.getSelection()?.toString() ?? '')
        },
        { timeout: 5000 }
      )
      .toContain('Last paragraph gamma.')

    // Open the find bar and move focus into its search input. handleSelectAll
    // takes the !hasFocus() branch and does a field select on the input, so the
    // editor's DOM selection must NOT be re-expanded by this action.
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
    const findInput = page.locator('.search-bar .search input')
    await expect(findInput).toBeVisible({ timeout: 5000 })
    await findInput.fill('beta')
    await findInput.focus()
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.nodeName ?? ''))
      .toBe('INPUT')

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'selectAll')
    await page.waitForTimeout(200)

    // The input's own field selection is what got selected (its full value),
    // and the editor document selection was not touched (focus is in the input,
    // so window.getSelection reflects the input, not the contenteditable).
    const inputSelection = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null
      if (!el || el.nodeName !== 'INPUT') return null
      return el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0)
    })
    expect(inputSelection).toBe('beta')

    // Tear down the find bar so the shared app is left clean.
    await page.keyboard.press('Escape')
    await expect(page.locator('.search-bar')).toBeHidden({ timeout: 5000 })
  })
})
