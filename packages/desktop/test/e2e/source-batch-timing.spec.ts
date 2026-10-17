import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { closeDiscardingChanges, enterSourceMode, launchElectron, waitForEditor, waitForMenuReady } from './helpers'

// Copied from source-cursor-response-perf.spec.ts; the synthetic document is 9309 lines / 626 KB.
const generateLargeDocument = (entries = 300, tableRows = 300): string => {
  const words = 'quantum photonic network memory lattice coherent optical cavity entangled spectral'.split(' ')
  const sentence = (seed: number, length: number): string =>
    Array.from({ length }, (_, index) => words[(seed * 7 + index * 3) % words.length]).join(' ')
  const out: string[] = ['# Synthetic literature report', '', '> Generated performance fixture.', '']
  for (let index = 1; index <= entries; index += 1) {
    const id = `R${String(index).padStart(3, '0')}`
    out.push(
      `## ${id} · ${sentence(index, 12)}`, '',
      `<strong><mark>Authors:</mark></strong> Author ${index}A；Author ${index}B；<mark>Author ${index}Z</mark>  `,
      '', '<details>', '<summary>All authors</summary>', '',
      `Author ${index}A；Author ${index}B；Author ${index}C；<mark>Author ${index}Z</mark>`,
      '', '</details>', '', `**Source:** Journal ${index % 17} · 2026-07-15 · Article  `,
      `**ID:** DOI 10.1000/fixture.${index} · [Page](<https://doi.org/10.1000/fixture.${index}>)`,
      '', `**Topics:** ${sentence(index + 1, 6)}  `, `**Score:** ${(index % 100).toFixed(1)}`,
      '', `**Summary:** ${sentence(index + 2, 45)}.`, '', '<details>', '<summary>Abstract</summary>',
      '', `${sentence(index + 3, 110)}.`, '', '</details>', '', `<!-- fixture:${id}:start -->`,
      '**Evidence:** abstract  ', `<!-- fixture:${id}:end -->`, ''
    )
  }
  out.push('## Cross check', '', '| # | DOI | Field | Status |', '| --- | --- | --- | --- |')
  for (let index = 1; index <= tableRows; index += 1) {
    out.push(`| ${index} | 10.1000/fixture.${index} | class | blocked; ${sentence(index, 8)} |`)
  }
  return out.join('\n') + '\n'
}

type Variant = 'change' | 'changes'
type Action = 'insert' | 'indent'
type State = { cm: string; workspace: string; revision: number }

const state = (page: Page): Promise<State> => page.evaluate(() => {
  const cm = (document.querySelector('.source-code .CodeMirror') as Element & {
    CodeMirror: { getValue(): string }
  }).CodeMirror
  const snapshot = (window as typeof window & {
    __mtWorkspaceSnapshot: () => {
      documents: Array<{ markdown: string; documentRevision: number }>
    }
  }).__mtWorkspaceSnapshot()
  if (snapshot.documents.length !== 1) throw new Error('Expected exactly one document')
  return {
    cm: cm.getValue(),
    workspace: snapshot.documents[0].markdown,
    revision: snapshot.documents[0].documentRevision
  }
})

const arm = (page: Page, variant: Variant, action: Action): Promise<void> => page.evaluate(
  ({ variant, action }) => {
    type Position = { line: number; ch: number }
    type CM = {
      focus(): void;
      setCursor(pos: Position): void;
      setSelection(a: Position, b: Position): void
      getValue(): string;
      getLine(line: number): string;
      on(event: string, handler: () => void): void
    }
    const cm = (document.querySelector('.source-code .CodeMirror') as Element & { CodeMirror: CM }).CodeMirror
    cm.focus()
    if (action === 'insert') cm.setCursor({ line: 2, ch: 6 })
    else cm.setSelection({ line: 2, ch: 0 }, { line: 22, ch: 0 })
    const before = cm.getValue()
    const beforeFirstLine = cm.getLine(2)
    const renderedLine = () => document.querySelector('.CodeMirror-code')?.children[2]?.textContent
    const beforeRendered = renderedLine()
    const probe = (window as typeof window & {
      __MT_SOURCE_BATCH_PROBE__?: {
        active: boolean;
        variant: Variant;
        changeCount: number;
        changesCount: number;
        saveCount: number;
        saveMs: number;
        reportCount: number;
        reportMs: number
      }
    }).__MT_SOURCE_BATCH_PROBE__ ?? {
      active: false,
      variant,
      changeCount: 0,
      changesCount: 0,
      saveCount: 0,
      saveMs: 0,
      reportCount: 0,
      reportMs: 0
    }
    ;(window as typeof window & { __MT_SOURCE_BATCH_PROBE__?: typeof probe }).__MT_SOURCE_BATCH_PROBE__ = probe
    if (!(probe as typeof probe & { listenersInstalled?: boolean }).listenersInstalled) {
      cm.on('change', () => { if (probe.active) probe.changeCount += 1 })
      cm.on('changes', () => { if (probe.active) probe.changesCount += 1 })
      ;(probe as typeof probe & { listenersInstalled?: boolean }).listenersInstalled = true
    }
    Object.assign(probe, {
      active: false,
      variant,
      changeCount: 0,
      changesCount: 0,
      saveCount: 0,
      saveMs: 0,
      reportCount: 0,
      reportMs: 0
    })
    ;(window as typeof window & { __MT_SOURCE_BATCH_RESULT__?: Promise<unknown> })
      .__MT_SOURCE_BATCH_RESULT__ = new Promise((resolve, reject) => {
        const key = action === 'insert' ? 'x' : 'Tab'
        const timeout = window.setTimeout(() => {
          probe.active = false
          document.removeEventListener('keydown', onKeyDown, true)
          reject(new Error(`${action} did not become visible`))
        }, 5_000)
        const onKeyDown = (event: KeyboardEvent) => {
          if (!event.isTrusted || event.key !== key) return
          const startedAt = performance.now()
          probe.active = true
          document.removeEventListener('keydown', onKeyDown, true)
          const poll = () => {
            const modelChanged = cm.getValue() !== before && cm.getLine(2) !== beforeFirstLine
            const renderedChanged = renderedLine() !== beforeRendered
            if (modelChanged && renderedChanged) {
              const latencyMs = performance.now() - startedAt
              probe.active = false
              window.clearTimeout(timeout)
              resolve({
                latencyMs,
                changed: cm.getValue(),
                counts: {
                  change: probe.changeCount,
                  changes: probe.changesCount,
                  saveContent: probe.saveCount,
                  reportSource: probe.reportCount,
                  saveMs: probe.saveMs,
                  reportMs: probe.reportMs
                }
              })
            } else requestAnimationFrame(poll)
          }
          requestAnimationFrame(poll)
        }
        document.addEventListener('keydown', onKeyDown, true)
      })
  }, { variant, action }
)

test('Source operation batching: trusted-key A/B timing and correctness', async() => {
  const outputPath = process.env.MARKTEXT_SOURCE_BATCH_OUT
  test.skip(!outputPath, 'set MARKTEXT_SOURCE_BATCH_OUT')
  test.setTimeout(10 * 60_000)
  if (!outputPath) throw new Error('Missing output path')
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-source-batch-'))
  const fixturePath = path.join(temporaryRoot, 'large.md')
  const markdown = generateLargeDocument()
  expect(markdown.split('\n').length).toBe(9309)
  expect(Buffer.byteLength(markdown)).toBe(626129)
  fs.writeFileSync(fixturePath, markdown, 'utf8')
  let app: ElectronApplication | undefined
  try {
    const launched = await launchElectron([fixturePath], {
      userDataDir: path.join(temporaryRoot, 'profile'), userDataDirOwnership: 'caller'
    })
    app = launched.app
    const page = launched.page
    await waitForEditor(page)
    await waitForMenuReady(app)
    await enterSourceMode(page, app)
    const initial = await state(page)
    expect(initial.cm).toBe(markdown)
    expect(initial.workspace).toBe(markdown)
    const samples = []
    for (const variant of ['change', 'changes'] as const) {
      for (const action of ['insert', 'indent'] as const) {
        for (let repetition = -1; repetition <= 5; repetition += 1) {
          await arm(page, variant, action)
          const beforeAction = await state(page)
          await page.keyboard.press(action === 'insert' ? 'x' : 'Tab')
          const result = await page.evaluate(() => (window as typeof window & {
            __MT_SOURCE_BATCH_RESULT__: Promise<{
              latencyMs: number; changed: string; counts: Record<string, number>
            }>
          }).__MT_SOURCE_BATCH_RESULT__)
          const changed = await state(page)
          expect(changed.cm).toBe(result.changed)
          expect(changed.workspace).toBe(result.changed)
          expect(changed.revision).toBeGreaterThan(initial.revision)
          await page.keyboard.press('Control+z')
          const undone = await state(page)
          expect(undone.cm).toBe(markdown)
          expect(undone.workspace).toBe(markdown)
          await page.keyboard.press('Control+Shift+z')
          const redone = await state(page)
          expect(redone.cm).toBe(result.changed)
          expect(redone.workspace).toBe(result.changed)
          await page.keyboard.press('Control+z')
          const restored = await state(page)
          expect(restored.cm).toBe(markdown)
          expect(restored.workspace).toBe(markdown)
          if (repetition > 0) {
            samples.push({
              variant,
              action,
              repetition,
              ...result,
              committedRevisions: changed.revision - beforeAction.revision
            })
          }
        }
      }
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify({
      recordedAt: new Date().toISOString(),
      baseCommit: '1dde81b11f1f84d4d848f5138e9b7b954e792e6f',
      bytes: Buffer.byteLength(markdown),
      lineCount: markdown.split('\n').length,
      warmups: 2,
      repetitions: 5,
      samples
    }, null, 2) + '\n')
  } finally {
    if (app) await closeDiscardingChanges(app)
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
