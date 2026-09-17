import { test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { clickMenuById, launchElectron, waitForEditor, waitForMenuReady } from './helpers'

// Measurement harness, not a regression gate: it only runs with
// MARKTEXT_PERF=1 because wall-clock results depend on the host.
//
//   MARKTEXT_PERF=1                 enable
//   MARKTEXT_PERF_DOC=<path>        large document (copied to a temp dir; the
//                                   original is never opened). Defaults to a
//                                   generated literature-report-shaped fixture.
//   MARKTEXT_PERF_ROUNDS=<n>        app launches (default 3)
//   MARKTEXT_PERF_SWITCHES=<n>      tab switch pairs per mode per launch (default 3)
//   MARKTEXT_PERF_OUT=<path>        write raw JSON results

const enabled = process.env.MARKTEXT_PERF === '1'
const rounds = Number(process.env.MARKTEXT_PERF_ROUNDS ?? 3)
const switches = Number(process.env.MARKTEXT_PERF_SWITCHES ?? 3)

interface Sample {
  readonly round: number
  readonly action: string
  readonly elapsedMs: number
  readonly longTaskCount: number
  readonly longTaskMaxMs: number
  readonly longTaskTotalMs: number
}

// Shaped after the literature-radar batch reports that exposed the stall:
// per-entry ATX heading, inline HTML (<strong>/<mark>), two <details> HTML
// blocks, bold-label paragraphs with autolinks, HTML comments, and a long
// trailing GFM table. Text is synthetic.
const generateLargeDocument = (entries = 300, tableRows = 300): string => {
  const words =
    'quantum photonic network memory lattice coherent optical cavity entangled spectral'.split(' ')
  const sentence = (seed: number, length: number): string =>
    Array.from({ length }, (_, i) => words[(seed * 7 + i * 3) % words.length]).join(' ')
  const out: string[] = [
    '# Synthetic literature report',
    '',
    '> Generated fixture for editor load measurements.',
    ''
  ]
  for (let i = 1; i <= entries; i++) {
    const id = `R${String(i).padStart(3, '0')}`
    out.push(
      `## ${id} · ${sentence(i, 12)}`,
      '',
      `<strong><mark>Authors:</mark></strong> Author ${i}A；Author ${i}B；……；<mark>Author ${i}Z</mark>（9）  `,
      '',
      '<details>',
      '<summary>All authors</summary>',
      '',
      `Author ${i}A；Author ${i}B；Author ${i}C；Author ${i}D；<mark>Author ${i}Z</mark>`,
      '',
      '</details>',
      '',
      `**Source:** Journal ${i % 17} · 2026-07-15 · Article  `,
      `**ID:** DOI 10.1000/fixture.${i} · **Access:** open · [Page](<https://doi.org/10.1000/fixture.${i}>)`,
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
      '',
      `<!-- fixture:artifacts:${id}:start -->`,
      '**Evidence:** abstract  ',
      `<!-- fixture:artifacts:${id}:end -->`,
      ''
    )
  }
  out.push('## Cross check', '', '| # | DOI | Field | Status |', '| --- | --- | --- | --- |')
  for (let i = 1; i <= tableRows; i++) {
    out.push(`| ${i} | 10.1000/fixture.${i} | publication_class | blocked; ${sentence(i, 8)} |`)
  }
  out.push('', '## Final marker heading', '', 'End of fixture.', '')
  return out.join('\n')
}

const lastHeadingText = (markdown: string): string => {
  const headings = markdown.split(/\r?\n/).filter((line) => /^#{1,6} /.test(line))
  return headings[headings.length - 1].replace(/^#{1,6} /, '').trim()
}

const installLongTaskRecorder = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const w = window as typeof window & {
      __perfLongTasks?: Array<{ start: number; duration: number }>
    }
    if (w.__perfLongTasks) return
    const tasks: Array<{ start: number; duration: number }> = []
    w.__perfLongTasks = tasks
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        tasks.push({ start: entry.startTime, duration: entry.duration })
      }
    }).observe({ type: 'longtask', buffered: false })
  })

type Trigger =
  | { kind: 'open-file'; pathname: string }
  | { kind: 'select-tab'; filename: string }
  | { kind: 'external' }

// Starts the clock in the renderer, performs the trigger, then waits until the
// target document is visible in the requested surface and one more frame has
// been produced, so the measurement includes the blocking render work.
const measure = async(
  page: Page,
  trigger: Trigger,
  expect: { mode: 'wysiwyg' | 'source'; marker: string },
  external?: () => Promise<void>
): Promise<Omit<Sample, 'round' | 'action'>> => {
  await page.evaluate((t) => {
    const w = window as typeof window & { __perfStart?: number }
    w.__perfStart = performance.now()
    if (t.kind === 'open-file') {
      window.electron.ipcRenderer.send('mt::open-file', t.pathname, {})
    } else if (t.kind === 'select-tab') {
      const tab = Array.from(document.querySelectorAll('.tabs-container > li')).find(
        (li) => li.querySelector('.tab-filename')?.textContent?.trim() === t.filename
      )
      const button = tab?.querySelector('.tab-select') as HTMLButtonElement | null
      if (!button) throw new Error('tab not found: ' + t.filename)
      button.click()
    }
  }, trigger)
  if (external) await external()
  return page.evaluate(
    ({ mode, marker }) =>
      new Promise<Omit<Sample, 'round' | 'action'>>((resolve, reject) => {
        const w = window as typeof window & {
          __perfStart: number
          __perfLongTasks: Array<{ start: number; duration: number }>
        }
        const start = w.__perfStart
        const deadline = start + 180000
        const ready = (): boolean => {
          if (mode === 'source') {
            const host = document.querySelector('.source-code .CodeMirror') as
              | (Element & {
                CodeMirror?: {
                  lastLine: () => number
                  getLine: (n: number) => string
                  getValue: () => string
                }
              })
              | null
            const cm = host?.CodeMirror
            return !!cm && cm.getValue().includes(marker)
          }
          if (document.querySelector('.source-code .CodeMirror')) return false
          const root = document.querySelector('.editor-component')
          if (!root) return false
          const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6')
          const last = headings[headings.length - 1]
          return !!last && (last.textContent ?? '').includes(marker)
        }
        const poll = (): void => {
          if (ready()) {
            requestAnimationFrame(() => {
              const end = performance.now()
              // Long-task observer callbacks are delivered asynchronously;
              // read them after the end timestamp is fixed.
              setTimeout(() => finish(end), 100)
            })
            return
          }
          if (performance.now() > deadline) {
            reject(new Error(`timed out waiting for ${mode} marker ${marker}`))
            return
          }
          requestAnimationFrame(poll)
        }
        const finish = (end: number): void => {
          const tasks = w.__perfLongTasks.filter(
            (task) => task.start >= start - 1 && task.start <= end
          )
          resolve({
            elapsedMs: Math.round(end - start),
            longTaskCount: tasks.length,
            longTaskMaxMs: Math.round(Math.max(0, ...tasks.map((task) => task.duration))),
            longTaskTotalMs: Math.round(tasks.reduce((sum, task) => sum + task.duration, 0))
          })
        }
        poll()
      }),
    expect
  )
}

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

test.describe('large document open and tab switch timing', () => {
  test.skip(!enabled, 'set MARKTEXT_PERF=1 to run the measurement harness')

  test('measures open, WYSIWYG switch, and Source switch', async() => {
    test.setTimeout(rounds * 15 * 60 * 1000)
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-perf-'))
    const largeMarkdown = process.env.MARKTEXT_PERF_DOC
      ? fs.readFileSync(process.env.MARKTEXT_PERF_DOC, 'utf-8')
      : generateLargeDocument()
    const largePath = path.join(workDir, 'large-document.md')
    const smallAPath = path.join(workDir, 'small-a.md')
    const smallBPath = path.join(workDir, 'small-b.md')
    fs.writeFileSync(largePath, largeMarkdown, 'utf-8')
    fs.writeFileSync(smallAPath, '# Small A heading\n\nShort note.\n', 'utf-8')
    fs.writeFileSync(smallBPath, '# Small B heading\n\nAnother short note.\n', 'utf-8')
    const large = { mode: 'wysiwyg' as const, marker: lastHeadingText(largeMarkdown) }
    const smallA = { mode: 'wysiwyg' as const, marker: 'Small A heading' }
    const samples: Sample[] = []
    let app: ElectronApplication | undefined

    try {
      for (let round = 1; round <= rounds; round++) {
        const launched = await launchElectron([smallAPath])
        app = launched.app
        const page = launched.page
        await waitForEditor(page)
        await waitForMenuReady(app)
        await installLongTaskRecorder(page)
        const record = (action: string, result: Omit<Sample, 'round' | 'action'>): void => {
          samples.push({ round, action, ...result })
          console.log(`[perf] round ${round} ${action}: ${JSON.stringify(result)}`)
        }

        record(
          'open-small-b',
          await measure(
            page,
            { kind: 'open-file', pathname: smallBPath },
            { mode: 'wysiwyg', marker: 'Small B heading' }
          )
        )
        await settle(1000)
        record(
          'open-large-wysiwyg',
          await measure(page, { kind: 'open-file', pathname: largePath }, large)
        )
        await settle(2000)

        for (let i = 0; i < switches; i++) {
          record(
            'switch-to-small',
            await measure(page, { kind: 'select-tab', filename: 'small-a.md' }, smallA)
          )
          await settle(1000)
          record(
            'switch-to-large-wysiwyg',
            await measure(page, { kind: 'select-tab', filename: 'large-document.md' }, large)
          )
          await settle(2000)
        }

        const currentApp = app
        record(
          'enter-source-large',
          await measure(page, { kind: 'external' }, { mode: 'source', marker: large.marker }, () =>
            clickMenuById(currentApp, 'sourceCodeModeMenuItem')
          )
        )
        await settle(2000)
        for (let i = 0; i < switches; i++) {
          record(
            'switch-to-small-from-source',
            await measure(page, { kind: 'select-tab', filename: 'small-a.md' }, smallA)
          )
          await settle(1000)
          record(
            'switch-to-large-source',
            await measure(
              page,
              { kind: 'select-tab', filename: 'large-document.md' },
              { mode: 'source', marker: large.marker }
            )
          )
          await settle(2000)
        }

        await app.close()
        app = undefined
      }
    } finally {
      if (app) await app.close().catch(() => undefined)
      fs.rmSync(workDir, { recursive: true, force: true })
    }

    const actions = [...new Set(samples.map((sample) => sample.action))]
    const summary = actions.map((action) => {
      const rows = samples.filter((sample) => sample.action === action)
      return {
        action,
        n: rows.length,
        medianElapsedMs: median(rows.map((row) => row.elapsedMs)),
        medianLongTaskMaxMs: median(rows.map((row) => row.longTaskMaxMs))
      }
    })
    console.table(summary)
    if (process.env.MARKTEXT_PERF_OUT) {
      fs.writeFileSync(
        process.env.MARKTEXT_PERF_OUT,
        JSON.stringify(
          {
            recordedAt: new Date().toISOString(),
            document: process.env.MARKTEXT_PERF_DOC
              ? 'external (MARKTEXT_PERF_DOC)'
              : 'generated fixture',
            largeBytes: Buffer.byteLength(largeMarkdown),
            largeLines: largeMarkdown.split('\n').length,
            rounds,
            switches,
            platform: `${process.platform} ${os.release()}`,
            cpu: os.cpus()[0]?.model,
            summary,
            samples
          },
          null,
          2
        )
      )
    }
  })
})
