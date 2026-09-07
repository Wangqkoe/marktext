/* eslint-disable @stylistic/space-before-function-paren */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance as nodePerformance } from 'node:perf_hooks'
import type { CDPSession, ElectronApplication, Page } from 'playwright'
import {
  launchElectron,
  waitForEditor,
  waitForMenuReady
} from '../../packages/desktop/test/e2e/helpers'

const counts = (process.env.OPENED_FILES_COUNTS ?? '10,50,100,150')
  .split(',')
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value > 0)
const trials = Number(process.env.OPENED_FILES_TRIALS ?? '3')
const outputPath = path.resolve(
  process.env.OPENED_FILES_OUTPUT ??
    '.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.raw.json'
)
const projectRoot = path.resolve(__dirname, '../..')
const baselineSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: projectRoot,
  encoding: 'utf8'
}).trim()

const fixtureBody = (index: number): string =>
  `# Opened file ${String(index).padStart(3, '0')}\n\n` +
  Array.from(
    { length: 40 },
    (_, paragraph) =>
      `Paragraph ${paragraph + 1} for deterministic opened-file fixture ${index}. ` +
      'The content is deliberately plain Markdown with no images, diagrams, math, or external resources.'
  ).join('\n\n') +
  '\n'

const percentile = (values: readonly number[], fraction: number): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const summarizeGaps = (gaps: readonly number[]) => ({
  samples: gaps.length,
  medianMs: percentile(gaps, 0.5),
  p95Ms: percentile(gaps, 0.95),
  maximumMs: Math.max(0, ...gaps),
  over50Ms: gaps.filter((gap) => gap > 50).length,
  over50Rate: gaps.length ? gaps.filter((gap) => gap > 50).length / gaps.length : 0
})

const readRevision = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const driver = window as typeof window & {
      __mtWorkspaceSnapshot?: () => { projection: { workspaceRevision: number } }
    }
    const snapshot = driver.__mtWorkspaceSnapshot?.()
    if (!snapshot) throw new Error('workspace snapshot driver is unavailable')
    return snapshot.projection.workspaceRevision
  })

const setOpenedFilesPreference = (page: Page, enabled: boolean): Promise<void> =>
  page.evaluate((value) => {
    const app = document.querySelector('#app') as
      | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
      | null
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, Record<string, unknown>> }
      | undefined
    const store = pinia?._s?.get('preferences')
    if (!store) throw new Error('preferences store is unavailable')
    store.openedFilesInSidebar = value
  }, enabled)

const startFrameCapture = (page: Page, key: string, durationMs: number): Promise<void> =>
  page.evaluate(`(() => {
    window.__openedFilesFrameCaptures ||= {};
    const capture = { timestamps: [], done: false };
    window.__openedFilesFrameCaptures[${JSON.stringify(key)}] = capture;
    const start = performance.now();
    requestAnimationFrame(function tick(timestamp) {
      capture.timestamps.push(timestamp);
      if (performance.now() - start < ${durationMs}) requestAnimationFrame(tick);
      else capture.done = true;
    });
  })()`)

const finishFrameCapture = async (page: Page, key: string): Promise<number[]> => {
  await page.waitForFunction(
    (captureKey) => {
      const driver = window as typeof window & {
        __openedFilesFrameCaptures?: Record<string, { done: boolean }>
      }
      return driver.__openedFilesFrameCaptures?.[captureKey]?.done === true
    },
    key,
    { timeout: 10000 }
  )
  return page.evaluate((captureKey) => {
    const driver = window as typeof window & {
      __openedFilesFrameCaptures?: Record<string, { timestamps: number[] }>
    }
    const timestamps = driver.__openedFilesFrameCaptures?.[captureKey]?.timestamps ?? []
    return timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index])
  }, key)
}

const profileAction = async <T>(session: CDPSession, action: () => Promise<T>) => {
  await session.send('Profiler.enable')
  await session.send('Profiler.setSamplingInterval', { interval: 100 })
  await session.send('Profiler.start')
  const result = await action()
  const stopped = (await session.send('Profiler.stop')) as {
    profile: {
      nodes: Array<{
        id: number
        callFrame: { functionName: string; url: string; lineNumber: number }
      }>
      samples?: number[]
    }
  }
  await session.send('Profiler.disable')
  const samplesByNode = new Map<number, number>()
  for (const nodeId of stopped.profile.samples ?? []) {
    samplesByNode.set(nodeId, (samplesByNode.get(nodeId) ?? 0) + 1)
  }
  const top = stopped.profile.nodes
    .map((node) => ({
      samples: samplesByNode.get(node.id) ?? 0,
      functionName: node.callFrame.functionName || '(anonymous)',
      url: node.callFrame.url,
      lineNumber: node.callFrame.lineNumber + 1
    }))
    .filter((node) => node.samples > 0)
    .sort((a, b) => b.samples - a.samples)
    .slice(0, 20)
  return { result, top, sampleCount: stopped.profile.samples?.length ?? 0 }
}

const readProcessMetrics = async (app: ElectronApplication) =>
  app.evaluate(({ app }) =>
    app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      cpuPercent: metric.cpu.percentCPUUsage,
      workingSetKb: metric.memory.workingSetSize,
      peakWorkingSetKb: metric.memory.peakWorkingSetSize
    }))
  )

const runTrial = async (count: number, trial: number) => {
  // Keep CLI paths short enough for electron.cmd's Windows command-line limit.
  const driveRoot = path.parse(os.tmpdir()).root
  const root = fs.mkdtempSync(path.join(driveRoot, 'm7-'))
  const profile = path.join(root, 'p')
  const corpus = path.join(root, 'c')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(corpus, { recursive: true })
  // Some observed bulk starts settled with fewer rows than unique CLI paths.
  // Request spare real files, retain the actual observed count, and require the
  // requested scale floor rather than silently treating a short run as valid.
  const files = Array.from({ length: count + 10 }, (_, index) => {
    const filePath = path.join(corpus, `${index + 1}.md`)
    fs.writeFileSync(filePath, fixtureBody(index + 1), 'utf8')
    return filePath
  })
  const fixtureBytes = fs.statSync(files[0]).size
  let app: ElectronApplication | undefined
  try {
    const launchStarted = nodePerformance.now()
    const launched = await launchElectron([corpus, ...files], {
      userDataDir: profile,
      userDataDirOwnership: 'caller',
      suppressErrorDialog: true
    })
    app = launched.app
    let page = launched.page
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForEditor(page, 30000)
    await waitForMenuReady(app, 30000)
    const rowsDeadline = Date.now() + 60000
    let observedWindows: Array<{ url: string; rows: number }> = []
    while (Date.now() < rowsDeadline) {
      const windows = app.windows()
      observedWindows = await Promise.all(
        windows.map(async (candidate) => ({
          url: candidate.url(),
          rows: await candidate
            .locator('.opened-files-list .opened-file')
            .count()
            .catch(() => -1)
        }))
      )
      const matchIndex = observedWindows.findIndex((window) => window.rows >= count)
      if (matchIndex >= 0) {
        page = windows[matchIndex]
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (observedWindows.every((window) => window.rows < count)) {
      throw new Error(
        `expected at least ${count} Opened Files rows; observed ${JSON.stringify(observedWindows)}`
      )
    }
    const rowsReadyMs = nodePerformance.now() - launchStarted
    await page.waitForTimeout(1000)
    const setupMs = nodePerformance.now() - launchStarted
    const session = await page.context().newCDPSession(page)
    const structure = await page.evaluate(() => {
      const driver = window as typeof window & {
        __mtWorkspaceSnapshot?: () => { documents: unknown[] }
      }
      const list = document.querySelector('.opened-files-list') as HTMLElement | null
      const rect = list?.getBoundingClientRect()
      return {
        openedRows: document.querySelectorAll('.opened-files-list .opened-file').length,
        editorComponents: document.querySelectorAll('.editor-component').length,
        sourceEditors: document.querySelectorAll('.source-code .CodeMirror').length,
        workspaceDocuments: driver.__mtWorkspaceSnapshot?.().documents.length ?? -1,
        viewport: {
          innerWidth,
          innerHeight,
          devicePixelRatio
        },
        openedFilesContainer:
          list && rect
            ? {
              clientWidth: list.clientWidth,
              clientHeight: list.clientHeight,
              scrollWidth: list.scrollWidth,
              scrollHeight: list.scrollHeight,
              boundingWidth: rect.width,
              boundingHeight: rect.height,
              overflowY: getComputedStyle(list).overflowY
            }
            : null
      }
    })
    const settledMetrics = await readProcessMetrics(app)

    const idleKey = `idle-${count}-${trial}`
    await startFrameCapture(page, idleKey, 1200)
    const idleGaps = await finishFrameCapture(page, idleKey)

    const revisionBeforeWheel = await readRevision(page)
    const wheelProfile = await profileAction(session, async () => {
      const key = `wheel-${count}-${trial}`
      await page.locator('.opened-files-list').hover()
      await startFrameCapture(page, key, 1800)
      for (let index = 0; index < 40; index++) await page.mouse.wheel(0, 180)
      const gaps = await finishFrameCapture(page, key)
      return {
        gaps,
        scrollTop: await page.locator('.opened-files-list').evaluate((el) => el.scrollTop)
      }
    })
    const revisionAfterWheel = await readRevision(page)
    const wheelFrameGaps = summarizeGaps(wheelProfile.result.gaps)

    await page.locator('.opened-files-list').evaluate((el) => {
      el.scrollTop = 0
    })
    const box = await page.locator('.opened-files-list').boundingBox()
    if (!box) throw new Error('opened-files list has no bounding box')
    const revisionBeforeThumb = await readRevision(page)
    const thumbProfile = await profileAction(session, async () => {
      const key = `thumb-${count}-${trial}`
      await startFrameCapture(page, key, 1200)
      const x = box.x + box.width - 3
      const startY = box.y + 12
      const endY = box.y + box.height - 12
      await page.mouse.move(x, startY)
      await page.mouse.down()
      await page.mouse.move(x, endY, { steps: 20 })
      await page.mouse.up()
      const gaps = await finishFrameCapture(page, key)
      return {
        gaps,
        scrollTop: await page.locator('.opened-files-list').evaluate((el) => el.scrollTop)
      }
    })
    const revisionAfterThumb = await readRevision(page)
    const thumbFrameGaps = summarizeGaps(thumbProfile.result.gaps)

    const revisionBeforeDirectPosition = await readRevision(page)
    const directPositionKey = `direct-position-${count}-${trial}`
    await startFrameCapture(page, directPositionKey, 1200)
    const directPosition = await page.locator('.opened-files-list').evaluate((el) => {
      el.scrollTop = el.scrollHeight - el.clientHeight
      el.dispatchEvent(new Event('scroll'))
      return { scrollTop: el.scrollTop, maximum: el.scrollHeight - el.clientHeight }
    })
    const directPositionGaps = await finishFrameCapture(page, directPositionKey)
    const revisionAfterDirectPosition = await readRevision(page)

    const projectionRun = async (label: string) => {
      const before = await readRevision(page)
      const profiled = await profileAction(session, () =>
        page.evaluate(async () => {
          const container = document.querySelector('.editor-component') as HTMLElement | null
          if (!container) throw new Error('editor scroll container unavailable')
          const maximum = container.scrollHeight - container.clientHeight
          if (maximum < 20) throw new Error(`editor fixture does not overflow: ${maximum}`)
          const started = performance.now()
          for (let index = 0; index < 40; index++) {
            container.scrollTop = index % 2 ? Math.min(80, maximum) : 0
            container.dispatchEvent(new Event('scroll'))
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          }
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
          return { elapsedMs: performance.now() - started }
        })
      )
      const after = await readRevision(page)
      return {
        label,
        ...profiled.result,
        revisionDelta: after - before,
        profile: { sampleCount: profiled.sampleCount, top: profiled.top }
      }
    }

    const setRowsMounted = async (mounted: boolean) => {
      await setOpenedFilesPreference(page, mounted)
      if (mounted) {
        await page.waitForFunction(
          (minimum) => document.querySelectorAll('.opened-file').length >= minimum,
          count
        )
      } else {
        await page.waitForFunction(() => document.querySelectorAll('.opened-file').length === 0)
      }
    }
    await setRowsMounted(true)
    const projectionWithRows = await projectionRun('opened-files-dom-mounted')
    await setRowsMounted(false)
    const projectionWithoutRows = await projectionRun('opened-files-dom-unmounted')
    const documentsWhileRowsUnmounted = await page.evaluate(() => {
      const driver = window as typeof window & {
        __mtWorkspaceSnapshot?: () => { documents: unknown[] }
      }
      return driver.__mtWorkspaceSnapshot?.().documents.length ?? -1
    })

    return {
      count,
      trial,
      fixture: {
        targetFiles: count,
        filesPassedToCli: files.length,
        bytesPerFile: fixtureBytes,
        contentShape:
          'one H1 plus 40 plain paragraphs; no images, diagrams, math, or remote resources',
        openingMethod:
          'isolated Electron profile; CLI receives corpus directory plus every child Markdown path so one real folder-backed window opens all documents'
      },
      rowsReadyMs,
      setupMs,
      structure,
      settledMetrics,
      idleFrames: summarizeGaps(idleGaps),
      wheel: {
        status:
          wheelProfile.result.scrollTop > 0 &&
          wheelFrameGaps.over50Rate <= 0.05 &&
          revisionAfterWheel === revisionBeforeWheel
            ? 'Passed'
            : 'Failed',
        method: 'Playwright mouse wheel input over the Opened Files container',
        frameGaps: wheelFrameGaps,
        finalScrollTop: wheelProfile.result.scrollTop,
        revisionDelta: revisionAfterWheel - revisionBeforeWheel,
        profile: { sampleCount: wheelProfile.sampleCount, top: wheelProfile.top }
      },
      scrollbarThumb: {
        status:
          thumbProfile.result.scrollTop === 0
            ? 'Unavailable'
            : thumbFrameGaps.over50Rate <= 0.05 && revisionAfterThumb === revisionBeforeThumb
              ? 'Passed'
              : 'Failed',
        method: 'Playwright pointer drag along the right edge of the Opened Files container',
        limitation:
          thumbProfile.result.scrollTop > 0
            ? null
            : 'The automated pointer gesture did not move the overlay/native scrollbar, so this is not an input-acceptance result.',
        frameGaps: thumbFrameGaps,
        finalScrollTop: thumbProfile.result.scrollTop,
        revisionDelta: revisionAfterThumb - revisionBeforeThumb,
        profile: { sampleCount: thumbProfile.sampleCount, top: thumbProfile.top }
      },
      programmaticContainerPositioning: {
        status: 'NotApplicableToInputAcceptance',
        method: 'set the container scrollTop to its maximum and dispatch a DOM scroll event',
        limitation:
          'This verifies container scrollability and revision isolation only; it is not equivalent to physical scrollbar input.',
        frameGaps: summarizeGaps(directPositionGaps),
        finalScrollTop: directPosition.scrollTop,
        maximumScrollTop: directPosition.maximum,
        revisionDelta: revisionAfterDirectPosition - revisionBeforeDirectPosition
      },
      projectionWithRows,
      projectionWithoutRows,
      documentsWhileRowsUnmounted,
      rendererErrors: await app.evaluate(() => {
        const globalWithErrors = global as unknown as { __mt_renderer_errors__?: unknown[] }
        return globalWithErrors.__mt_renderer_errors__?.length ?? 0
      })
    }
  } finally {
    if (app) await app.close().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const resolvedRoot = path.resolve(root)
    const cleanupTargetIsSafe =
      path.dirname(resolvedRoot).toLowerCase() === path.resolve(driveRoot).toLowerCase() &&
      path.basename(resolvedRoot).startsWith('m7-')
    if (cleanupTargetIsSafe) {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    } else {
      process.stderr.write(`refusing to remove unexpected profile root: ${resolvedRoot}\n`)
      process.exitCode = 1
    }
  }
}

const main = async () => {
  const startedAt = new Date().toISOString()
  const results = []
  const persist = (finishedAt: string | null) => {
    const output = {
      schemaVersion: 2,
      startedAt,
      finishedAt,
      environment: {
        baselineSha,
        buildType: 'production electron-vite build, unpackaged Electron test launch',
        platform: process.platform,
        arch: process.arch,
        osType: os.type(),
        osRelease: os.release(),
        osVersion: os.version(),
        cpuModel: os.cpus()[0]?.model ?? 'unknown',
        logicalProcessorCount: os.cpus().length,
        totalRamBytes: os.totalmem(),
        node: process.version,
        electron: '42.1.0',
        configuredContentViewport: { width: 1280, height: 720 },
        automation: 'Playwright-controlled Electron window',
        headless: false
      },
      counts,
      trials,
      results
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  }
  for (const count of counts) {
    for (let trial = 1; trial <= trials; trial++) {
      process.stdout.write(`profiling ${count} opened files, trial ${trial}/${trials}\n`)
      results.push(await runTrial(count, trial))
      persist(null)
    }
  }
  persist(new Date().toISOString())
  process.stdout.write(`wrote ${outputPath}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
