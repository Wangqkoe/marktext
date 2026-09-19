import { expect, test } from '@playwright/test'
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

const enabled = process.env.MARKTEXT_SOURCE_CURSOR_RESPONSE_PERF === '1'
const outputPath = process.env.MARKTEXT_SOURCE_CURSOR_RESPONSE_PERF_OUT
const buildLabel = process.env.MARKTEXT_SOURCE_CURSOR_RESPONSE_PERF_LABEL ?? 'candidate'
const repetitions = Number(process.env.MARKTEXT_SOURCE_CURSOR_RESPONSE_PERF_REPETITIONS ?? 15)
const warmups = 5
type Action = 'arrow' | 'shift-selection' | 'insert'

const generateLargeDocument = (entries = 300, tableRows = 300): string => {
  const words =
    'quantum photonic network memory lattice coherent optical cavity entangled spectral'.split(' ')
  const sentence = (seed: number, length: number): string =>
    Array.from({ length }, (_, index) => words[(seed * 7 + index * 3) % words.length]).join(' ')
  const out: string[] = ['# Synthetic literature report', '', '> Generated performance fixture.', '']
  for (let index = 1; index <= entries; index += 1) {
    const id = `R${String(index).padStart(3, '0')}`
    out.push(
      `## ${id} · ${sentence(index, 12)}`,
      '',
      `<strong><mark>Authors:</mark></strong> Author ${index}A；Author ${index}B；<mark>Author ${index}Z</mark>  `,
      '',
      '<details>',
      '<summary>All authors</summary>',
      '',
      `Author ${index}A；Author ${index}B；Author ${index}C；<mark>Author ${index}Z</mark>`,
      '',
      '</details>',
      '',
      `**Source:** Journal ${index % 17} · 2026-07-15 · Article  `,
      `**ID:** DOI 10.1000/fixture.${index} · [Page](<https://doi.org/10.1000/fixture.${index}>)`,
      '',
      `**Topics:** ${sentence(index + 1, 6)}  `,
      `**Score:** ${(index % 100).toFixed(1)}`,
      '',
      `**Summary:** ${sentence(index + 2, 45)}.`,
      '',
      '<details>',
      '<summary>Abstract</summary>',
      '',
      `${sentence(index + 3, 110)}.`,
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
  for (let index = 1; index <= tableRows; index += 1) {
    out.push(`| ${index} | 10.1000/fixture.${index} | class | blocked; ${sentence(index, 8)} |`)
  }
  return out.join('\n') + '\n'
}

const armOperation = async(page: Page, action: Action): Promise<void> => {
  await page.evaluate((selectedAction) => {
    type Cursor = { line: number; ch: number }
    type CM = {
      focus(): void
      getCursor(which?: string): Cursor
      getLine(line: number): string
      setCursor(position: Cursor): void
    }
    const cm = (document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: CM })
      | null)?.CodeMirror
    if (!cm) throw new Error('CodeMirror is not ready')
    const start = { line: 2, ch: 6 }
    cm.focus()
    cm.setCursor(start)
    const beforeLine = cm.getLine(start.line)
    const before = cm.getCursor('head')
    const beforeCursorLeft = document.querySelector('.CodeMirror-cursor')?.getBoundingClientRect().left
    const targetLineElement = document.querySelector('.CodeMirror-code')?.children[start.line] ?? null
    ;(window as typeof window & { __MT_SOURCE_CURSOR_RESPONSE__?: Promise<unknown> })
      .__MT_SOURCE_CURSOR_RESPONSE__ = new Promise((resolve, reject) => {
        const expectedKey = selectedAction === 'insert' ? 'x' : 'ArrowRight'
        const onKeyDown = (event: KeyboardEvent) => {
          if (!event.isTrusted || event.key !== expectedKey) return
          const startedAt = performance.now()
          const probe = (window as typeof window & { __MT_UI_CLONE_PROBE__?: {
            active: boolean
            spans: Array<{ label: string; ms: number }>
          } }).__MT_UI_CLONE_PROBE__
          if (probe && selectedAction === 'insert') {
            probe.spans = []
            probe.active = true
          }
          let frames = 0
          const poll = () => {
            frames += 1
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
              if (probe) probe.active = false
              window.clearTimeout(timeout)
              document.removeEventListener('keydown', onKeyDown, true)
              resolve({ latencyMs: performance.now() - startedAt, frames })
            } else {
              requestAnimationFrame(poll)
            }
          }
          requestAnimationFrame(poll)
        }
        const timeout = window.setTimeout(() => {
          const probe = (window as typeof window & { __MT_UI_CLONE_PROBE__?: { active: boolean } })
            .__MT_UI_CLONE_PROBE__
          if (probe) probe.active = false
          document.removeEventListener('keydown', onKeyDown, true)
          reject(new Error('operation did not become visible'))
        }, 2_000)
        document.addEventListener('keydown', onKeyDown, true)
      })
  }, action)
}

const readOperation = (page: Page): Promise<{ latencyMs: number; frames: number }> =>
  page.evaluate(() => (window as typeof window & {
    __MT_SOURCE_CURSOR_RESPONSE__: Promise<{ latencyMs: number; frames: number }>
  }).__MT_SOURCE_CURSOR_RESPONSE__)

const cleanupInsert = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    type CM = {
      getCursor(): { line: number; ch: number }
      replaceRange(text: string, from: unknown, to: unknown): void
    }
    const cm = (document.querySelector('.source-code .CodeMirror') as Element & { CodeMirror: CM })
      .CodeMirror
    const head = cm.getCursor()
    cm.replaceRange('', { line: head.line, ch: head.ch - 1 }, head)
  })
}

test.describe('Source cursor response performance', () => {
  test.skip(!enabled || !outputPath, 'set performance output environment variables')

  test('records trusted-key response without renderer timing instrumentation', async() => {
    test.setTimeout(10 * 60 * 1_000)
    if (!outputPath) throw new Error('performance output path is required')
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-source-response-'))
    const fixturePath = path.join(temporaryRoot, 'large.md')
    const userDataDir = path.join(temporaryRoot, 'profile')
    const markdown = generateLargeDocument()
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
      const samples: Array<{
        action: Action
        repetition: number
        latencyMs: number
        frames: number
      }> = []
      for (const action of ['arrow', 'shift-selection', 'insert'] as const) {
        for (let repetition = 1 - warmups; repetition <= repetitions; repetition += 1) {
          await armOperation(page, action)
          if (action === 'arrow') await page.keyboard.press('ArrowRight')
          if (action === 'shift-selection') await page.keyboard.press('Shift+ArrowRight')
          if (action === 'insert') await page.keyboard.press('x')
          const response = await readOperation(page)
          if (repetition > 0) samples.push({ action, repetition, ...response })
          if (action === 'insert') await cleanupInsert(page)
          await page.waitForTimeout(20)
        }
      }
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, JSON.stringify({
        recordedAt: new Date().toISOString(),
        buildLabel,
        bytes: Buffer.byteLength(markdown),
        lineCount: markdown.split('\n').length,
        repetitions,
        warmups,
        samples
      }, null, 2) + '\n')
    } finally {
      if (app) await closeDiscardingChanges(app)
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})

const readSourceState = (page: Page) => page.evaluate(() => {
  type CM = { getValue(): string }
  const cm = (document.querySelector('.source-code .CodeMirror') as
    | (Element & { CodeMirror?: CM }) | null)?.CodeMirror
  const facade = (window as typeof window & { __mtWorkspaceSnapshot?: () => {
    documents: Array<{ markdown: string; portableHistory: unknown; documentRevision: number }>
    projection: { panes: Array<{ tabs: unknown[] }> }
  } }).__mtWorkspaceSnapshot?.()
  if (!cm || !facade || facade.documents.length !== 1) throw new Error('Source facade is unavailable')
  const workspaceDocument = facade.documents[0]
  return {
    cmMarkdown: cm.getValue(),
    workspaceMarkdown: workspaceDocument.markdown,
    revision: workspaceDocument.documentRevision,
    documentCount: facade.documents.length,
    tabCount: facade.projection.panes.reduce((count, pane) => count + pane.tabs.length, 0),
    historyBytes: new TextEncoder().encode(JSON.stringify(workspaceDocument.portableHistory)).length,
    markdownBytes: new TextEncoder().encode(workspaceDocument.markdown).length
  }
})

test.describe('Source UI clone timing', () => {
  const timingOutputPath = process.env.MARKTEXT_SOURCE_UI_CLONE_TIMING_OUT
  test.skip(!timingOutputPath, 'set MARKTEXT_SOURCE_UI_CLONE_TIMING_OUT')

  test('measures only trusted inserts in one controlled session', async() => {
    test.setTimeout(10 * 60 * 1_000)
    if (!timingOutputPath) throw new Error('timing output path is required')
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-ui-clone-'))
    const fixturePath = path.join(temporaryRoot, 'large.md')
    const userDataDir = path.join(temporaryRoot, 'profile')
    const markdown = generateLargeDocument()
    fs.writeFileSync(fixturePath, markdown, 'utf8')
    let app: ElectronApplication | undefined
    try {
      const launched = await launchElectron([fixturePath], { userDataDir, userDataDirOwnership: 'caller' })
      app = launched.app
      const page = launched.page
      await waitForEditor(page)
      await waitForMenuReady(app)
      await enterSourceMode(page, app)
      await page.waitForTimeout(500)
      const initial = await readSourceState(page)
      expect(initial.cmMarkdown).toBe(markdown)
      expect(initial.workspaceMarkdown).toBe(markdown)
      await page.evaluate(() => {
        (window as typeof window & { __MT_UI_CLONE_PROBE__?: unknown }).__MT_UI_CLONE_PROBE__ = {
          active: false,
          spans: []
        }
      })
      const samples: Array<{ repetition: number; latencyMs: number; frames: number;
        spans: Array<{ label: string; ms: number }> }> = []
      let previousRevision = initial.revision
      for (let repetition = 1 - warmups; repetition <= repetitions; repetition += 1) {
        await armOperation(page, 'insert')
        await page.keyboard.press('x')
        const response = await readOperation(page)
        const spans = await page.evaluate(() => {
          const probe = (window as typeof window & { __MT_UI_CLONE_PROBE__?: {
            spans: Array<{ label: string; ms: number }>
          } }).__MT_UI_CLONE_PROBE__
          if (!probe) throw new Error('timing probe is unavailable')
          return probe.spans
        })
        expect(spans.length).toBeGreaterThan(0)
        expect(spans.some(span => span.label === 'snapshot.clone')).toBe(true)
        expect(spans.some(span => span.label === 'apply.total')).toBe(true)
        expect(spans.some(span => span.label === 'reportSource.markdown')).toBe(true)
        const inserted = await readSourceState(page)
        expect(inserted.cmMarkdown).toBe(inserted.workspaceMarkdown)
        expect(inserted.cmMarkdown.length).toBe(markdown.length + 1)
        expect(inserted.revision).toBeGreaterThan(previousRevision)
        if (repetition > 0) samples.push({ repetition, ...response, spans })
        await cleanupInsert(page)
        const cleaned = await readSourceState(page)
        expect(cleaned.cmMarkdown).toBe(markdown)
        expect(cleaned.workspaceMarkdown).toBe(markdown)
        previousRevision = cleaned.revision
        await page.waitForTimeout(20)
      }
      const final = await readSourceState(page)
      fs.mkdirSync(path.dirname(timingOutputPath), { recursive: true })
      fs.writeFileSync(timingOutputPath, JSON.stringify({
        recordedAt: new Date().toISOString(),
        baseCommit: '22972132975e54127a564f77dfd6d306cb8f3854',
        bytes: Buffer.byteLength(markdown),
        lineCount: markdown.split('\n').length,
        warmups,
        repetitions,
        initial: { documentCount: initial.documentCount, tabCount: initial.tabCount,
          historyBytes: initial.historyBytes, markdownBytes: initial.markdownBytes },
        final: { documentCount: final.documentCount, tabCount: final.tabCount,
          historyBytes: final.historyBytes, markdownBytes: final.markdownBytes },
        samples
      }, null, 2) + '\n')
    } finally {
      if (app) await closeDiscardingChanges(app)
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})
