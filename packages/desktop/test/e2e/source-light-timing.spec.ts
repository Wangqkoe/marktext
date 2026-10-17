import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  clickMenuById,
  closeDiscardingChanges,
  launchElectron,
  waitForEditor,
  waitForMenuReady
} from './helpers'

type Variant = 'baseline' | 'off-active' | 'off-wrap'
type Action = 'arrow' | 'shift-selection' | 'insert'
const variant = process.env.MARKTEXT_SOURCE_LIGHT_VARIANT as Variant | undefined
const outputPath = process.env.MARKTEXT_SOURCE_LIGHT_OUT
const warmups = 3
const repetitions = 10

// Keep this byte-for-byte equivalent to source-cursor-response-perf.spec.ts.
const generateLargeDocument = (entries = 300, tableRows = 300): string => {
  const words =
    'quantum photonic network memory lattice coherent optical cavity entangled spectral'.split(' ')
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
      '', '</details>', '',
      `**Source:** Journal ${index % 17} · 2026-07-15 · Article  `,
      `**ID:** DOI 10.1000/fixture.${index} · [Page](<https://doi.org/10.1000/fixture.${index}>)`,
      '', `**Topics:** ${sentence(index + 1, 6)}  `,
      `**Score:** ${(index % 100).toFixed(1)}`, '',
      `**Summary:** ${sentence(index + 2, 45)}.`, '',
      '<details>', '<summary>Abstract</summary>', '',
      `${sentence(index + 3, 110)}.`, '', '</details>', '',
      `<!-- fixture:${id}:start -->`, '**Evidence:** abstract  ',
      `<!-- fixture:${id}:end -->`, ''
    )
  }
  out.push('## Cross check', '', '| # | DOI | Field | Status |', '| --- | --- | --- | --- |')
  for (let index = 1; index <= tableRows; index += 1) {
    out.push(`| ${index} | 10.1000/fixture.${index} | class | blocked; ${sentence(index, 8)} |`)
  }
  return out.join('\n') + '\n'
}

const sourceState = (page: Page) => page.evaluate(() => {
  type CM = { getValue(): string; getOption(name: string): unknown; lineCount(): number }
  const cm = (document.querySelector('.source-code .CodeMirror') as
    | (Element & { CodeMirror?: CM }) | null)?.CodeMirror
  const snapshot = (window as typeof window & {
    __mtWorkspaceSnapshot?: () => {
      documents: Array<{ markdown: string }>
    }
  }).__mtWorkspaceSnapshot?.()
  if (!cm || !snapshot || snapshot.documents.length !== 1) throw new Error('Source state unavailable')
  return {
    cmMarkdown: cm.getValue(),
    workspaceMarkdown: snapshot.documents[0].markdown,
    lineCount: cm.lineCount(),
    lineNumbers: cm.getOption('lineNumbers'),
    lineWrapping: cm.getOption('lineWrapping'),
    styleActiveLine: cm.getOption('styleActiveLine'),
    mode: cm.getOption('mode')
  }
})

const armKey = (page: Page, action: Action): Promise<void> => page.evaluate((selectedAction) => {
  type Cursor = { line: number; ch: number }
  type CM = {
    focus(): void;
    setCursor(position: Cursor): void
    getCursor(which?: string): Cursor;
    getLine(line: number): string
  }
  const cm = (document.querySelector('.source-code .CodeMirror') as
    | (Element & { CodeMirror?: CM }) | null)?.CodeMirror
  if (!cm) throw new Error('CodeMirror unavailable')
  const start = { line: 2, ch: 6 }
  cm.focus()
  cm.setCursor(start)
  const beforeLine = cm.getLine(start.line)
  const beforeLeft = document.querySelector('.CodeMirror-cursor')?.getBoundingClientRect().left
  const targetLine = document.querySelector('.CodeMirror-code')?.children[start.line]
  ;(window as typeof window & { __MT_SOURCE_LIGHT_RESPONSE__?: Promise<unknown> })
    .__MT_SOURCE_LIGHT_RESPONSE__ = new Promise((resolve, reject) => {
      const expectedKey = selectedAction === 'insert' ? 'x' : 'ArrowRight'
      const listener = (event: KeyboardEvent) => {
        if (!event.isTrusted || event.key !== expectedKey) return
        const startTime = performance.now()
        let frames = 0
        const poll = () => {
          frames += 1
          const head = cm.getCursor('head')
          const anchor = cm.getCursor('anchor')
          const modelReady = selectedAction === 'arrow'
            ? head.line === start.line && head.ch === start.ch + 1 && anchor.ch === head.ch
            : selectedAction === 'shift-selection'
              ? head.line === start.line && head.ch === start.ch + 1 && anchor.ch === start.ch
              : cm.getLine(start.line) === beforeLine.slice(0, start.ch) + 'x' + beforeLine.slice(start.ch)
          const cursor = document.querySelector('.CodeMirror-cursor')?.getBoundingClientRect()
          const selection = document.querySelector('.CodeMirror-selected')?.getBoundingClientRect()
          const visible = selectedAction === 'shift-selection'
            ? !!selection && selection.width > 0 && selection.bottom > 0 && selection.top < innerHeight
            : !!cursor && cursor.left !== beforeLeft && cursor.bottom > 0 && cursor.top < innerHeight
          const textVisible = selectedAction !== 'insert' ||
            (targetLine?.textContent ?? '').includes(
              beforeLine.slice(0, start.ch) + 'x' + beforeLine.slice(start.ch))
          if (modelReady && visible && textVisible) {
            clearTimeout(timeout)
            document.removeEventListener('keydown', listener, true)
            resolve({ latencyMs: performance.now() - startTime, frames })
          } else requestAnimationFrame(poll)
        }
        requestAnimationFrame(poll)
      }
      const timeout = setTimeout(() => {
        document.removeEventListener('keydown', listener, true)
        reject(new Error(`${selectedAction} did not become visible`))
      }, 2000)
      document.addEventListener('keydown', listener, true)
    })
}, action)

const readKey = (page: Page): Promise<{ latencyMs: number; frames: number }> =>
  page.evaluate(() => (window as typeof window & {
    __MT_SOURCE_LIGHT_RESPONSE__: Promise<{ latencyMs: number; frames: number }>
  }).__MT_SOURCE_LIGHT_RESPONSE__)

test.describe('Source light configuration timing', () => {
  test.skip(!outputPath || !['baseline', 'off-active', 'off-wrap'].includes(variant ?? ''),
    'set MARKTEXT_SOURCE_LIGHT_VARIANT and MARKTEXT_SOURCE_LIGHT_OUT')

  test('measures one construction variant with trusted keys and wheel', async() => {
    test.setTimeout(10 * 60 * 1000)
    if (!outputPath || !variant) throw new Error('variant and output path required')
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-source-light-'))
    const fixturePath = path.join(temporaryRoot, 'large.md')
    const markdown = generateLargeDocument()
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
      await page.evaluate((selectedVariant) => {
        (window as typeof window & { __MT_SOURCE_LIGHT_VARIANT__?: string })
          .__MT_SOURCE_LIGHT_VARIANT__ = selectedVariant
        ;(window as typeof window & { __MT_SOURCE_LIGHT_ENTER_START__?: number })
          .__MT_SOURCE_LIGHT_ENTER_START__ = performance.now()
      }, variant)
      await clickMenuById(app, 'sourceCodeModeMenuItem')
      await page.waitForFunction((expected) => {
        const cm = (document.querySelector('.source-code .CodeMirror') as
          | (Element & { CodeMirror?: { getValue(): string } }) | null)?.CodeMirror
        return cm?.getValue() === expected
      }, markdown, { timeout: 30000 })
      const enterMs = await page.evaluate(async() => {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return performance.now() - (window as typeof window & {
          __MT_SOURCE_LIGHT_ENTER_START__: number
        }).__MT_SOURCE_LIGHT_ENTER_START__
      })
      const initial = await sourceState(page)
      expect(initial.cmMarkdown).toBe(markdown)
      expect(initial.workspaceMarkdown).toBe(markdown)
      expect(initial.lineNumbers).toBe(true)
      expect(initial.mode).toBe('markdown-math')
      expect(initial.lineWrapping).toBe(variant !== 'off-wrap')
      expect(initial.styleActiveLine).toBe(variant !== 'off-active')
      expect(initial.lineCount).toBe(9309)
      expect(Buffer.byteLength(markdown)).toBe(626129)

      const samples: Array<{ action: Action; repetition: number; latencyMs: number; frames: number }> = []
      for (const action of ['arrow', 'shift-selection', 'insert'] as const) {
        for (let repetition = 1 - warmups; repetition <= repetitions; repetition += 1) {
          await armKey(page, action)
          if (action === 'arrow') await page.keyboard.press('ArrowRight')
          if (action === 'shift-selection') await page.keyboard.press('Shift+ArrowRight')
          if (action === 'insert') await page.keyboard.press('x')
          const result = await readKey(page)
          if (repetition > 0) samples.push({ action, repetition, ...result })
          if (action === 'insert') {
            const inserted = await sourceState(page)
            expect(inserted.cmMarkdown).toBe(inserted.workspaceMarkdown)
            expect(inserted.cmMarkdown.length).toBe(markdown.length + 1)
            await page.evaluate(() => {
              type CM = {
                getCursor(): { line: number; ch: number };
                replaceRange(text: string, from: unknown, to: unknown): void
              }
              const cm = (document.querySelector('.source-code .CodeMirror') as
                Element & { CodeMirror: CM }).CodeMirror
              const head = cm.getCursor()
              cm.replaceRange('', { line: head.line, ch: head.ch - 1 }, head)
            })
          }
          await page.waitForTimeout(20)
        }
      }
      const afterKeys = await sourceState(page)
      expect(afterKeys.cmMarkdown).toBe(markdown)
      expect(afterKeys.workspaceMarkdown).toBe(markdown)

      const wheelSamples: Array<{
        repetition: number;
        latencyMs: number | null;
        before: number;
        after: number;
        scrollHeight: number;
        clientHeight: number
      }> = []
      const source = page.locator('.source-code')
      await source.hover()
      for (let repetition = 1 - warmups; repetition <= repetitions; repetition += 1) {
        await page.evaluate(() => {
          const source = document.querySelector('.source-code') as HTMLElement
          source.scrollTop = 0
          ;(window as typeof window & { __MT_SOURCE_LIGHT_WHEEL__?: Promise<unknown> })
            .__MT_SOURCE_LIGHT_WHEEL__ = new Promise((resolve) => {
              const listener = (event: WheelEvent) => {
                if (!event.isTrusted) return
                const startedAt = performance.now()
                const before = source.scrollTop
                const poll = () => {
                  const after = source.scrollTop
                  if (after > before) {
                    clearTimeout(timeout)
                    source.removeEventListener('wheel', listener, true)
                    resolve({
                      latencyMs: performance.now() - startedAt,
                      before,
                      after,
                      scrollHeight: source.scrollHeight,
                      clientHeight: source.clientHeight
                    })
                  } else requestAnimationFrame(poll)
                }
                requestAnimationFrame(poll)
              }
              const timeout = setTimeout(() => {
                source.removeEventListener('wheel', listener, true)
                resolve({
                  latencyMs: null,
                  before: source.scrollTop,
                  after: source.scrollTop,
                  scrollHeight: source.scrollHeight,
                  clientHeight: source.clientHeight
                })
              }, 2000)
              source.addEventListener('wheel', listener, true)
            })
        })
        await page.mouse.wheel(0, 500)
        const result = await page.evaluate(() => (window as typeof window & {
          __MT_SOURCE_LIGHT_WHEEL__: Promise<{
            latencyMs: number | null;
            before: number;
            after: number;
            scrollHeight: number;
            clientHeight: number
          }>
        }).__MT_SOURCE_LIGHT_WHEEL__)
        if (repetition > 0) wheelSamples.push({ repetition, ...result })
        if (result.latencyMs === null) break
      }
      const final = await sourceState(page)
      expect(final.cmMarkdown).toBe(markdown)
      expect(final.workspaceMarkdown).toBe(markdown)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      fs.writeFileSync(outputPath, JSON.stringify({
        recordedAt: new Date().toISOString(),
        variant,
        bytes: Buffer.byteLength(markdown),
        lineCount: initial.lineCount,
        warmups,
        repetitions,
        enterMs,
        options: {
          lineNumbers: initial.lineNumbers,
          lineWrapping: initial.lineWrapping,
          styleActiveLine: initial.styleActiveLine,
          mode: initial.mode
        },
        keySamples: samples,
        wheelSamples
      }, null, 2) + '\n')
    } finally {
      if (app) await closeDiscardingChanges(app)
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})
