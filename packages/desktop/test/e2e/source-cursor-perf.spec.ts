import { test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  closeDiscardingChanges,
  enterSourceMode,
  launchElectron,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const enabled = process.env.MARKTEXT_SOURCE_CURSOR_PERF === '1'
const outputDir = process.env.MARKTEXT_SOURCE_CURSOR_PERF_OUT
const repetitions = Number(process.env.MARKTEXT_SOURCE_CURSOR_PERF_REPETITIONS ?? 30)
const warmups = 5
const fixtureFilter = process.env.MARKTEXT_SOURCE_CURSOR_PERF_FIXTURE
const variantFilter = process.env.MARKTEXT_SOURCE_CURSOR_PERF_VARIANT

type Variant = 'baseline' | 'skip-save' | 'cursor-report'
type Action = 'arrow' | 'shift-selection' | 'insert'

interface InternalSample {
  kind: 'save' | 'cursor-report' | 'event'
  trigger: 'change' | 'cursorActivity'
  totalMs: number
  getValueMs?: number
  cursorReadMs?: number
  wordCountMs?: number
  reportSourceMs?: number
  reportCaretMs?: number
  saveContentMs?: number
  skippedSave?: boolean
}

interface OperationSample {
  action: Action
  repetition: number
  keydownToVisibleRafMs: number
  frames: number
  eventSamples: InternalSample[]
}

const generateSmallDocument = (): string =>
  Array.from({ length: 80 }, (_, i) => `line ${i + 1} alpha beta gamma delta`).join('\n') + '\n'

const generateLargeDocument = (entries = 300, tableRows = 300): string => {
  const words =
    'quantum photonic network memory lattice coherent optical cavity entangled spectral'.split(' ')
  const sentence = (seed: number, length: number): string =>
    Array.from({ length }, (_, i) => words[(seed * 7 + i * 3) % words.length]).join(' ')
  const out: string[] = ['# Synthetic literature report', '', '> Generated performance fixture.', '']
  for (let i = 1; i <= entries; i++) {
    const id = `R${String(i).padStart(3, '0')}`
    out.push(
      `## ${id} · ${sentence(i, 12)}`,
      '',
      `<strong><mark>Authors:</mark></strong> Author ${i}A；Author ${i}B；<mark>Author ${i}Z</mark>  `,
      '',
      '<details>',
      '<summary>All authors</summary>',
      '',
      `Author ${i}A；Author ${i}B；Author ${i}C；<mark>Author ${i}Z</mark>`,
      '',
      '</details>',
      '',
      `**Source:** Journal ${i % 17} · 2026-07-15 · Article  `,
      `**ID:** DOI 10.1000/fixture.${i} · [Page](<https://doi.org/10.1000/fixture.${i}>)`,
      '',
      `**Topics:** ${sentence(i + 1, 6)}  `,
      `**Score:** ${(i % 100).toFixed(1)}`,
      '',
      `**Summary:** ${sentence(i + 2, 45)}.`,
      '',
      '<details>',
      '<summary>Abstract</summary>',
      '',
      `${sentence(i + 3, 110)}.`,
      '',
      '</details>',
      '',
      `<!-- fixture:${id}:start -->`,
      '**Evidence:** abstract  ',
      `<!-- fixture:${id}:end -->`,
      ''
    )
  }
  out.push('## Cross check', '', '| # | DOI | Field | Status |', '| --- | --- | --- | --- |')
  for (let i = 1; i <= tableRows; i++) {
    out.push(`| ${i} | 10.1000/fixture.${i} | class | blocked; ${sentence(i, 8)} |`)
  }
  return out.join('\n') + '\n'
}

const armOperation = async(page: Page, action: Action): Promise<void> => {
  await page.evaluate((selectedAction) => {
    type Cursor = { line: number, ch: number }
    type CM = {
      focus(): void
      getCursor(which?: string): Cursor
      getLine(line: number): string
      setCursor(position: Cursor): void
      setSelection(anchor: Cursor, head: Cursor, options?: { scroll?: boolean }): void
      getValue(): string
    }
    const host = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: CM })
      | null
    const cm = host?.CodeMirror
    if (!cm) throw new Error('CodeMirror is not ready')
    const perf = (window as typeof window & {
      __MT_SOURCE_CURSOR_PERF__?: {
        enabled: boolean
        variant: Variant
        samples: InternalSample[]
      }
    }).__MT_SOURCE_CURSOR_PERF__
    if (!perf) throw new Error('Source cursor instrumentation is unavailable')
    perf.enabled = false
    perf.samples.length = 0
    const start = { line: 2, ch: 6 }
    cm.focus()
    cm.setCursor(start)
    const container = document.querySelector('.source-code') as HTMLElement | null
    if (container) container.scrollTop = 0

    const beforeLine = cm.getLine(start.line)
    const before = cm.getCursor('head')
    const beforeCursorLeft = document.querySelector('.CodeMirror-cursor')?.getBoundingClientRect().left
    const targetLineElement = document.querySelector('.CodeMirror-code')?.children[start.line] ?? null
    ;(window as typeof window & { __MT_SOURCE_CURSOR_RESULT__?: Promise<unknown> })
      .__MT_SOURCE_CURSOR_RESULT__ = new Promise((resolve, reject) => {
        const expectedKey = selectedAction === 'insert' ? 'x' : 'ArrowRight'
        const onKeyDown = (event: KeyboardEvent) => {
          if (!event.isTrusted || event.key !== expectedKey) return
          const startedAt = performance.now()
          let frames = 0
          const poll = () => {
            frames++
            const head = cm.getCursor('head')
            const anchor = cm.getCursor('anchor')
            const modelReady = selectedAction === 'arrow'
              ? head.line === before.line && head.ch === before.ch + 1 && anchor.ch === head.ch
              : selectedAction === 'shift-selection'
                ? head.line === before.line && head.ch === before.ch + 1 && anchor.ch === before.ch
                : cm.getLine(start.line) === beforeLine.slice(0, start.ch) + 'x' + beforeLine.slice(start.ch)
            const cursorRect = document.querySelector('.CodeMirror-cursor')?.getBoundingClientRect()
            const selectionRect = document.querySelector('.CodeMirror-selected')?.getBoundingClientRect()
            const cursorVisible = selectedAction === 'shift-selection'
              ? !!selectionRect && selectionRect.width > 0 &&
                selectionRect.bottom > 0 && selectionRect.top < window.innerHeight
              : !!cursorRect && cursorRect.left !== beforeCursorLeft &&
                cursorRect.bottom > 0 && cursorRect.top < window.innerHeight
            const textVisible = selectedAction !== 'insert' ||
              (targetLineElement?.textContent ?? '').includes(
                beforeLine.slice(0, start.ch) + 'x' + beforeLine.slice(start.ch)
              )
            if (modelReady && cursorVisible && textVisible) {
              window.clearTimeout(timeout)
              document.removeEventListener('keydown', onKeyDown, true)
              resolve({ keydownToVisibleRafMs: performance.now() - startedAt, frames })
            } else {
              requestAnimationFrame(poll)
            }
          }
          requestAnimationFrame(poll)
        }
        const timeout = window.setTimeout(() => {
          document.removeEventListener('keydown', onKeyDown, true)
          reject(new Error('operation did not become visible'))
        }, 2000)
        document.addEventListener('keydown', onKeyDown, true)
      })
    perf.samples.length = 0
    perf.enabled = true
  }, action)
}

const readOperation = async(page: Page): Promise<{
  keydownToVisibleRafMs: number
  frames: number
  eventSamples: InternalSample[]
}> => page.evaluate(async() => {
  const w = window as typeof window & {
    __MT_SOURCE_CURSOR_RESULT__: Promise<{ keydownToVisibleRafMs: number, frames: number }>
    __MT_SOURCE_CURSOR_PERF__: { enabled: boolean, samples: InternalSample[] }
  }
  const visible = await w.__MT_SOURCE_CURSOR_RESULT__
  w.__MT_SOURCE_CURSOR_PERF__.enabled = false
  return { ...visible, eventSamples: w.__MT_SOURCE_CURSOR_PERF__.samples.slice() }
})

const cleanupInsert = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    type CM = { getCursor(): { line: number, ch: number }, replaceRange(text: string, from: unknown, to: unknown): void }
    const cm = (document.querySelector('.source-code .CodeMirror') as Element & { CodeMirror: CM }).CodeMirror
    const head = cm.getCursor()
    const from = { line: head.line, ch: head.ch - 1 }
    cm.replaceRange('', from, head)
  })
}

const runGroup = async(
  fixtureName: 'small' | 'large',
  markdown: string,
  variant: Variant,
  artifactRoot: string
) => {
  const groupRoot = fs.mkdtempSync(path.join(os.tmpdir(), `marktext-source-cursor-${fixtureName}-${variant}-`))
  const fixturePath = path.join(groupRoot, `${fixtureName}.md`)
  const userDataDir = path.join(groupRoot, 'profile')
  fs.writeFileSync(fixturePath, markdown, 'utf8')
  let app: ElectronApplication | undefined
  try {
    const launched = await launchElectron([fixturePath], {
      userDataDir,
      userDataDirOwnership: 'caller'
    })
    app = launched.app
    const page = launched.page
    await waitForEditor(page)
    await waitForMenuReady(app)
    await enterSourceMode(page, app)
    await page.waitForTimeout(500)
    const lineCount = await page.evaluate(() => {
      const cm = (document.querySelector('.source-code .CodeMirror') as Element & {
        CodeMirror: { lineCount(): number }
      }).CodeMirror
      return cm.lineCount()
    })
    await page.evaluate((selectedVariant) => {
      ;(window as typeof window & { __MT_SOURCE_CURSOR_PERF__?: unknown }).__MT_SOURCE_CURSOR_PERF__ = {
        enabled: false,
        variant: selectedVariant,
        samples: []
      }
    }, variant)

    const samples: OperationSample[] = []
    const actions: Action[] = ['arrow', 'shift-selection', 'insert']
    for (const action of actions) {
      for (let repetition = 1 - warmups; repetition <= repetitions; repetition++) {
        await armOperation(page, action)
        if (action === 'arrow') await page.keyboard.press('ArrowRight')
        if (action === 'shift-selection') await page.keyboard.press('Shift+ArrowRight')
        if (action === 'insert') await page.keyboard.press('x')
        const result = await readOperation(page)
        if (repetition > 0) samples.push({ action, repetition, ...result })
        if (action === 'insert') await cleanupInsert(page)
        await page.waitForTimeout(20)
      }
    }
    const result = {
      fixtureName,
      variant,
      bytes: Buffer.byteLength(markdown),
      lineCount,
      repetitions,
      warmups,
      samples
    }
    fs.writeFileSync(
      path.join(artifactRoot, `${fixtureName}-${variant}.json`),
      JSON.stringify(result, null, 2) + '\n',
      'utf8'
    )
    return result
  } finally {
    if (app) await closeDiscardingChanges(app)
    fs.rmSync(groupRoot, { recursive: true, force: true })
  }
}

test.describe('Source cursor full-document processing measurement', () => {
  test.skip(!enabled || !outputDir, 'set MARKTEXT_SOURCE_CURSOR_PERF=1 and output directory')

  test('records small and 8k-line baseline/intervention groups', async() => {
    test.setTimeout(15 * 60 * 1000)
    if (!outputDir) throw new Error('MARKTEXT_SOURCE_CURSOR_PERF_OUT is required')
    fs.mkdirSync(outputDir, { recursive: true })
    const fixtures = [
      { name: 'small' as const, markdown: generateSmallDocument() },
      { name: 'large' as const, markdown: generateLargeDocument() }
    ]
    const results = []
    for (const fixture of fixtures) {
      if (fixtureFilter && fixture.name !== fixtureFilter) continue
      for (const variant of ['baseline', 'skip-save', 'cursor-report'] as const) {
        if (variantFilter && variant !== variantFilter) continue
        results.push(await runGroup(fixture.name, fixture.markdown, variant, outputDir))
      }
    }
    fs.writeFileSync(
      path.join(outputDir, 'all-results.json'),
      JSON.stringify({ recordedAt: new Date().toISOString(), results }, null, 2) + '\n',
      'utf8'
    )
  })
})
