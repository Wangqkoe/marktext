/* eslint-disable @stylistic/space-before-function-paren */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { performance as nodePerformance } from 'node:perf_hooks'
import { _electron, type CDPSession, type ElectronApplication, type Page } from 'playwright'
import {
  getElectronPath,
  waitForEditor,
  waitForMenuReady
} from '../../packages/desktop/test/e2e/helpers'
import {
  buildPowerShellReproduction,
  captureMeasurementIdentity,
  type RuntimeVersions
} from './opened-files-evidence-identity'

type Scenario =
  | 'baseline'
  | 'list-hidden'
  | 'tiny-content'
  | 'projection-detached'
  | 'watchers-disabled'

interface ProcessMetric {
  readonly pid: number
  readonly type: string
  readonly cpuPercent: number
  readonly workingSetKb: number
  readonly peakWorkingSetKb: number
}

interface BulkSample {
  readonly elapsedMs: number
  readonly observedDocuments: number
  readonly openedRows: number
  readonly rendererCpuPercent: number
  readonly applicationCpuPercent: number
  readonly totalWorkingSetKb: number
}

const countsSetting = process.env.OPENED_FILES_COUNTS ?? '20,100'
const trialsSetting = process.env.OPENED_FILES_TRIALS ?? '1'
const scenariosSetting = process.env.OPENED_FILES_SCENARIOS ?? 'baseline'
const deliverySetting =
  process.env.OPENED_FILES_DELIVERY === 'ready-batch' ? 'ready-batch' : 'startup'
const feedbackAssertSetting = process.env.OPENED_FILES_FEEDBACK_ASSERT === '1' ? '1' : '0'
const settledInputSetting = process.env.OPENED_FILES_SETTLED_INPUT === '1' ? '1' : '0'
const freshBuildSetting = process.env.OPENED_FILES_FRESH_BUILD === '1' ? '1' : '0'
const outputSetting =
  process.env.OPENED_FILES_OUTPUT ??
  '.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.raw-bulk.json'
const applicationSourceRevision =
  process.env.OPENED_FILES_APPLICATION_SOURCE_SHA ??
  '303dfa39b84b5bffedd9271b27cefbf34be66753'
const counts = countsSetting
  .split(',')
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value > 0)
const trials = Number(trialsSetting)
const scenarios = scenariosSetting
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean) as Scenario[]
const feedbackAssert = feedbackAssertSetting === '1'
const settledInput = settledInputSetting === '1'
const freshBuild = freshBuildSetting === '1'
const delivery = deliverySetting
const outputPath = path.resolve(outputSetting)
const projectRoot = path.resolve(__dirname, '../..')
const desktopRoot = path.join(projectRoot, 'packages', 'desktop')
const scriptPath = '.scratch/wysiwyg-scroll-performance/profile-opened-files-bulk.ts'
const referenceViewport = { width: 1280, height: 480 }

const median = (values: readonly number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

const percentile = (values: readonly number[], fraction: number): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const summarizeDurations = (values: readonly number[]) => ({
  count: values.length,
  totalMs: values.reduce((sum, value) => sum + value, 0),
  p95Ms: percentile(values, 0.95),
  maximumMs: Math.max(0, ...values)
})

const summarizeFrameGaps = (gaps: readonly number[]) => ({
  samples: gaps.length,
  medianMs: percentile(gaps, 0.5),
  p95Ms: percentile(gaps, 0.95),
  maximumMs: Math.max(0, ...gaps),
  over50Ms: gaps.filter((gap) => gap > 50).length,
  over50Rate: gaps.length ? gaps.filter((gap) => gap > 50).length / gaps.length : 0
})

const fixtureBody = (index: number, scenario: Scenario): string => {
  if (scenario === 'tiny-content') return `# Opened file ${String(index).padStart(3, '0')}\n`
  return (
    `# Opened file ${String(index).padStart(3, '0')}\n\n` +
    Array.from(
      { length: 40 },
      (_, paragraph) =>
        `Paragraph ${paragraph + 1} for deterministic opened-file fixture ${index}. ` +
        'The content is deliberately plain Markdown with no images, diagrams, math, or external resources.'
    ).join('\n\n') +
    '\n'
  )
}

const readProcessMetrics = async (app: ElectronApplication): Promise<ProcessMetric[]> =>
  app.evaluate(({ app }) =>
    app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      cpuPercent: metric.cpu.percentCPUUsage,
      workingSetKb: metric.memory.workingSetSize,
      peakWorkingSetKb: metric.memory.peakWorkingSetSize
    }))
  )

const startProfile = async (session: CDPSession): Promise<void> => {
  await session.send('Profiler.enable')
  await session.send('Profiler.setSamplingInterval', { interval: 100 })
  await session.send('Profiler.start')
}

const stopProfile = async (session: CDPSession) => {
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
    .slice(0, 30)
  return { sampleCount: stopped.profile.samples?.length ?? 0, top }
}

const readStructure = (page: Page) =>
  page.evaluate(() => {
    const driver = window as typeof window & {
      __mtWorkspaceSnapshot?: () => { documents: unknown[] }
    }
    const list = document.querySelector('.opened-files-list') as HTMLElement | null
    const rect = list?.getBoundingClientRect()
    return {
      workspaceDocuments: driver.__mtWorkspaceSnapshot?.().documents.length ?? -1,
      openedRows: document.querySelectorAll('.opened-files-list .opened-file').length,
      editorComponents: document.querySelectorAll('.editor-component').length,
      sourceEditors: document.querySelectorAll('.source-code .CodeMirror').length,
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

const readLightCounts = (page: Page) =>
  page.evaluate(() => {
    const driver = window as typeof window & {
      __mtWorkspaceSnapshot?: () => { documents: unknown[] }
    }
    return {
      observedDocuments: driver.__mtWorkspaceSnapshot?.().documents.length ?? -1,
      openedRows: document.querySelectorAll('.opened-files-list .opened-file').length,
      observationMethod: 'workspace facade snapshot document count'
    }
  })

const readTaskDurationMs = async (session: CDPSession): Promise<number> => {
  const metrics = (await session.send('Performance.getMetrics')) as {
    metrics: Array<{ name: string; value: number }>
  }
  const taskDuration = metrics.metrics.find((metric) => metric.name === 'TaskDuration')?.value
  if (taskDuration === undefined) throw new Error('CDP TaskDuration metric is unavailable')
  return taskDuration * 1000
}

const captureSettledWindow = async (
  page: Page,
  session: CDPSession,
  key: string,
  durationMs: number,
  action?: () => Promise<void>
) => {
  await page.evaluate(`(() => {
    window.__openedFilesSettledCaptures ||= {};
    const captureKey = ${JSON.stringify(key)};
    const captureDurationMs = ${durationMs};
    const capture = { timestamps: [], longTasks: [], trustedWheelEvents: 0, done: false };
    window.__openedFilesSettledCaptures[captureKey] = capture;
    const list = document.querySelector('.opened-files-list');
    if (!list) throw new Error('Opened Files container is unavailable');
    const onWheel = event => { if (event.isTrusted) capture.trustedWheelEvents += 1; };
    list.addEventListener('wheel', onWheel);
    const observer = new PerformanceObserver(entries => {
      for (const entry of entries.getEntries()) capture.longTasks.push(entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: false });
    const started = performance.now();
    requestAnimationFrame(function tick(timestamp) {
      capture.timestamps.push(timestamp);
      if (performance.now() - started < captureDurationMs) requestAnimationFrame(tick);
      else {
        observer.disconnect();
        list.removeEventListener('wheel', onWheel);
        capture.done = true;
      }
    });
  })()`)
  const taskBeforeMs = await readTaskDurationMs(session)
  if (action) await action()
  await page.waitForFunction(
    (captureKey) => {
      const driver = window as typeof window & {
        __openedFilesSettledCaptures?: Record<string, { done: boolean }>
      }
      return driver.__openedFilesSettledCaptures?.[captureKey]?.done === true
    },
    key,
    { timeout: durationMs + 10000 }
  )
  const taskAfterMs = await readTaskDurationMs(session)
  const captured = await page.evaluate((captureKey) => {
    const driver = window as typeof window & {
      __openedFilesSettledCaptures?: Record<
        string,
        { timestamps: number[]; longTasks: number[]; trustedWheelEvents: number }
      >
    }
    const value = driver.__openedFilesSettledCaptures?.[captureKey]
    if (!value) throw new Error(`settled capture ${captureKey} is unavailable`)
    return value
  }, key)
  const gaps = captured.timestamps
    .slice(1)
    .map((timestamp, index) => timestamp - captured.timestamps[index])
  return {
    durationMs,
    frameGaps: summarizeFrameGaps(gaps),
    longTasks: summarizeDurations(captured.longTasks),
    taskDurationMs: taskAfterMs - taskBeforeMs,
    trustedWheelEvents: captured.trustedWheelEvents
  }
}

const measureSettledInput = async (page: Page, session: CDPSession, count: number, trial: number) => {
  await session.send('Performance.enable')
  const list = page.locator('.opened-files-list')
  const initiallyVisible = await list.isVisible()
  if (!initiallyVisible) {
    await page.locator('.opened-files .title').click()
    await list.waitFor({ state: 'visible' })
  }
  await list.evaluate((element) => {
    element.scrollTop = 0
  })
  const geometry = await list.evaluate((element) => ({
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    maximumScrollTop: element.scrollHeight - element.clientHeight,
    initialScrollTop: element.scrollTop
  }))
  if (geometry.maximumScrollTop <= 0) {
    throw new Error(
      `Opened Files container does not overflow at exact scale ${count}: ${JSON.stringify(geometry)}`
    )
  }
  const idle = await captureSettledWindow(page, session, `idle-${count}-${trial}`, 1800)
  const revisionBefore = await page.evaluate(() => {
    const driver = window as typeof window & {
      __mtWorkspaceSnapshot?: () => { projection: { workspaceRevision: number } }
    }
    const snapshot = driver.__mtWorkspaceSnapshot?.()
    if (!snapshot) throw new Error('workspace snapshot driver is unavailable')
    return snapshot.projection.workspaceRevision
  })
  await list.hover()
  const wheel = await captureSettledWindow(
    page,
    session,
    `wheel-${count}-${trial}`,
    2400,
    async () => {
      for (let index = 0; index < 80; index++) await page.mouse.wheel(0, 240)
    }
  )
  const finalScrollTop = await list.evaluate((element) => element.scrollTop)
  const revisionAfter = await page.evaluate(() => {
    const driver = window as typeof window & {
      __mtWorkspaceSnapshot?: () => { projection: { workspaceRevision: number } }
    }
    const snapshot = driver.__mtWorkspaceSnapshot?.()
    if (!snapshot) throw new Error('workspace snapshot driver is unavailable')
    return snapshot.projection.workspaceRevision
  })
  await session.send('Performance.disable')
  return {
    protocol:
      'after exact workspace Documents and Opened Files rows are both ready, wait 1000 ms, capture an idle window, then send trusted Playwright mouse-wheel input over the real container',
    openedFilesRegionInitiallyExpanded: initiallyVisible,
    geometry,
    idle,
    wheel: {
      ...wheel,
      method: 'Playwright page.mouse.wheel over the hovered Opened Files container',
      cadence: '80 wheel events with deltaY=240, issued serially without an inserted delay',
      finalScrollTop,
      reachedMaximum: Math.abs(finalScrollTop - geometry.maximumScrollTop) <= 1,
      revisionDelta: revisionAfter - revisionBefore,
      status:
        finalScrollTop > 0 &&
        wheel.trustedWheelEvents > 0 &&
        revisionAfter === revisionBefore
          ? 'Passed'
          : 'Failed'
    },
    scrollbarThumb: {
      status: 'Unavailable',
      limitation:
        'No physical human scrollbar-thumb measurement was performed. Automated pointer input is not classified as physical thumb acceptance.'
    },
    programmaticContainerPositioning: {
      status: 'NotApplicableToInputAcceptance',
      limitation:
        'scrollTop was reset only before measurement; no programmatic positioning was used to establish wheel movement or reachability.'
    }
  }
}

const readMainProbe = (app: ElectronApplication) =>
  app.evaluate(() => {
    const state = global as unknown as {
      __mtOpenedFilesBulkProbe?: {
        openTabMessages: number
        watcherRequests: number
        firstOpenTabAt: number | null
        lastOpenTabAt: number | null
      }
    }
    return (
      state.__mtOpenedFilesBulkProbe ?? {
        openTabMessages: -1,
        watcherRequests: -1,
        firstOpenTabAt: null,
        lastOpenTabAt: null
      }
    )
  })

const setReferenceViewport = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ BrowserWindow }, viewport) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
    if (!window) throw new Error('editor window is unavailable for viewport configuration')
    window.setContentSize(viewport.width, viewport.height)
  }, referenceViewport)

const installWindowSendProbe = (app: ElectronApplication): Promise<void> =>
  app.evaluate(({ BrowserWindow }) => {
    const state = global as unknown as {
      __mtOpenedFilesBulkProbe?: {
        openTabMessages: number
        watcherRequests: number
        firstOpenTabAt: number | null
        lastOpenTabAt: number | null
      }
    }
    const probe = state.__mtOpenedFilesBulkProbe
    if (!probe) throw new Error('main bulk probe is unavailable')
    for (const window of BrowserWindow.getAllWindows()) {
      const contents = window.webContents as typeof window.webContents & {
        __mtOpenedFilesOriginalSend?: typeof window.webContents.send
      }
      if (contents.__mtOpenedFilesOriginalSend) continue
      const originalSend = contents.send.bind(contents)
      contents.__mtOpenedFilesOriginalSend = originalSend
      contents.send = ((channel: string, ...args: unknown[]) => {
        if (channel === 'mt::open-new-tab') {
          const now = Date.now()
          probe.openTabMessages += 1
          probe.firstOpenTabAt ??= now
          probe.lastOpenTabAt = now
        }
        return originalSend(channel, ...args)
      }) as typeof contents.send
    }
  })

const installMainProbe = async (
  app: ElectronApplication,
  disableWatchers: boolean
): Promise<void> => {
  const install = () =>
    app.evaluate(({ BrowserWindow, ipcMain }, shouldDisableWatchers) => {
      const state = global as unknown as {
        __mtOpenedFilesBulkProbe?: {
          openTabMessages: number
          watcherRequests: number
          firstOpenTabAt: number | null
          lastOpenTabAt: number | null
        }
      }
      state.__mtOpenedFilesBulkProbe = {
        openTabMessages: 0,
        watcherRequests: 0,
        firstOpenTabAt: null,
        lastOpenTabAt: null
      }
      const probe = state.__mtOpenedFilesBulkProbe
      const originalEmit = ipcMain.emit.bind(ipcMain)
      ipcMain.emit = ((channel: string, ...args: unknown[]) => {
        if (channel === 'watcher-watch-file') {
          probe.watcherRequests += 1
          if (shouldDisableWatchers) return true
        }
        return originalEmit(channel, ...args)
      }) as typeof ipcMain.emit
      ipcMain.on('mt::handle-renderer-error', (_event, error) => {
        const errors = global as unknown as { __mt_renderer_errors__?: unknown[] }
        errors.__mt_renderer_errors__ ??= []
        errors.__mt_renderer_errors__.push(error)
      })
      for (const window of BrowserWindow.getAllWindows()) {
        const contents = window.webContents as typeof window.webContents & {
          __mtOpenedFilesOriginalSend?: typeof window.webContents.send
        }
        if (contents.__mtOpenedFilesOriginalSend) continue
        const originalSend = contents.send.bind(contents)
        contents.__mtOpenedFilesOriginalSend = originalSend
        contents.send = ((channel: string, ...args: unknown[]) => {
          if (channel === 'mt::open-new-tab') {
            const now = Date.now()
            probe.openTabMessages += 1
            probe.firstOpenTabAt ??= now
            probe.lastOpenTabAt = now
          }
          return originalSend(channel, ...args)
        }) as typeof contents.send
      }
    }, disableWatchers)
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await install()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw lastError
}

const resetMainProbe = (app: ElectronApplication): Promise<void> =>
  app.evaluate(() => {
    const state = global as unknown as {
      __mtOpenedFilesBulkProbe?: {
        openTabMessages: number
        watcherRequests: number
        firstOpenTabAt: number | null
        lastOpenTabAt: number | null
      }
    }
    if (!state.__mtOpenedFilesBulkProbe) return
    state.__mtOpenedFilesBulkProbe.openTabMessages = 0
    state.__mtOpenedFilesBulkProbe.watcherRequests = 0
    state.__mtOpenedFilesBulkProbe.firstOpenTabAt = null
    state.__mtOpenedFilesBulkProbe.lastOpenTabAt = null
  })

const emitReadyBatch = (app: ElectronApplication, files: readonly string[]): Promise<void> =>
  app.evaluate(
    ({ BrowserWindow, ipcMain }, paths) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
      if (!window) throw new Error('editor window is unavailable for ready-batch delivery')
      ipcMain.emit('app-open-files-by-id', window.id, paths)
    },
    [...files]
  )

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

const detachProjectionConsumer = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const app = document.querySelector('#app') as
      | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
      | null
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, Record<string, unknown>> }
      | undefined
    const store = pinia?._s?.get('editor') as { DETACH_WORKSPACE_FACADE?: () => void } | undefined
    if (!store?.DETACH_WORKSPACE_FACADE) throw new Error('editor facade consumer is unavailable')
    store.DETACH_WORKSPACE_FACADE()
  })

const runTrial = async (count: number, trial: number, scenario: Scenario) => {
  const driveRoot = path.parse(os.tmpdir()).root
  const root = fs.mkdtempSync(path.join(driveRoot, 'm7b-'))
  const profile = path.join(root, 'p')
  const corpus = path.join(root, 'c')
  fs.mkdirSync(profile, { recursive: true })
  fs.mkdirSync(corpus, { recursive: true })
  const files = Array.from({ length: count }, (_, index) => {
    const filePath = path.join(corpus, `${String(index + 1).padStart(3, '0')}.md`)
    fs.writeFileSync(filePath, fixtureBody(index + 1, scenario), 'utf8')
    return filePath
  })
  const firstFile = files[0]
  if (!firstFile) throw new Error('at least one fixture file is required')
  const fixtureBytes = fs.statSync(firstFile).size
  const consoleErrors: string[] = []
  const cleanup = {
    status: 'Pending',
    appClose: 'Pending',
    temporaryRoot: root,
    targetValidated: false,
    rootRemoved: false
  }
  let app: ElectronApplication | undefined
  try {
    const launchStarted = nodePerformance.now()
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value
    }
    env.PERF_TESTING = 'true'
    env.MARKTEXT_ERROR_INTERACTION = '1'
    app = await _electron.launch({
      executablePath: getElectronPath(),
      args: [
        desktopRoot,
        '--user-data-dir',
        profile,
        ...(delivery === 'startup'
          ? [corpus, ...files]
          : settledInput
            ? [corpus, firstFile]
            : [])
      ],
      cwd: desktopRoot,
      env,
      timeout: 30000
    })
    await installMainProbe(app, scenario === 'watchers-disabled')
    const page = await app.firstWindow()
    await installWindowSendProbe(app)
    await setReferenceViewport(app)
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))
    const session = await page.context().newCDPSession(page)
    if (delivery === 'startup') await startProfile(session)
    await page.waitForLoadState('domcontentloaded')
    await waitForEditor(page, 30000)
    await waitForMenuReady(app, 30000)
    const runtimeVersions = (await app.evaluate(() => ({
      electron: process.versions.electron,
      node: process.versions.node,
      chromium: process.versions.chrome,
      executablePath: process.execPath
    }))) as RuntimeVersions
    let measurementStarted = launchStarted
    if (scenario === 'list-hidden') await setOpenedFilesPreference(page, false)
    if (scenario === 'projection-detached') await detachProjectionConsumer(page)
    if (delivery === 'ready-batch') {
      await resetMainProbe(app)
      await startProfile(session)
      // Include dispatch itself in document-ready latency. Older evidence that
      // started this clock after emitReadyBatch measured post-dispatch latency.
      measurementStarted = nodePerformance.now()
      await emitReadyBatch(app, settledInput ? files.slice(1) : files)
    }
    const samples: BulkSample[] = []
    const deadline = Date.now() + 90000
    let observedDocuments = -1
    let openedRows = -1
    let observationMethod = ''
    let lastProgressAt = Date.now()
    let lastObservedDocuments = -1
    let reachedExactCount = false
    while (Date.now() < deadline) {
      const observed = await readLightCounts(page)
      observedDocuments = observed.observedDocuments
      openedRows = observed.openedRows
      observationMethod = observed.observationMethod
      if (observedDocuments === count) {
        reachedExactCount = true
        break
      }
      if (observedDocuments !== lastObservedDocuments) {
        lastObservedDocuments = observedDocuments
        lastProgressAt = Date.now()
      } else if (Date.now() - lastProgressAt >= 3000) {
        break
      }
      const metrics = await readProcessMetrics(app)
      const renderer = metrics.find((metric) => metric.type === 'Tab')
      samples.push({
        elapsedMs: nodePerformance.now() - measurementStarted,
        observedDocuments,
        openedRows,
        rendererCpuPercent: renderer?.cpuPercent ?? -1,
        applicationCpuPercent: metrics.reduce((sum, metric) => sum + metric.cpuPercent, 0),
        totalWorkingSetKb: metrics.reduce((sum, metric) => sum + metric.workingSetKb, 0)
      })
      await page.waitForTimeout(250)
    }
    const exactDocumentReadyMs = reachedExactCount
      ? nodePerformance.now() - measurementStarted
      : null
    const bulkProfile = await stopProfile(session)
    if (settledInput && (delivery !== 'ready-batch' || scenario !== 'baseline')) {
      throw new Error('settled input measurement requires ready-batch baseline')
    }
    if (settledInput && !reachedExactCount) {
      throw new Error(`exact ${count}-Document readiness was not reached`)
    }
    if (settledInput) {
      await page.waitForFunction(
        (exactCount) => {
          const driver = window as typeof window & {
            __mtWorkspaceSnapshot?: () => { documents: unknown[] }
          }
          return (
            driver.__mtWorkspaceSnapshot?.().documents.length === exactCount &&
            document.querySelectorAll('.opened-files-list .opened-file').length === exactCount
          )
        },
        count,
        { timeout: 30000 }
      )
    }
    await page.waitForTimeout(1000)
    const settledAtMs = nodePerformance.now() - measurementStarted
    const structure = await readStructure(page)
    const settledMetrics = await readProcessMetrics(app)
    const mainProbe = await readMainProbe(app)
    const windows = app.windows()
    const observedWindows = await Promise.all(
      windows.map(async (candidate) => ({
        url: candidate.url(),
        openedRows: await candidate
          .locator('.opened-files-list .opened-file')
          .count()
          .catch(() => -1)
      }))
    )
    const rendererErrors = await app.evaluate(() => {
      const state = global as unknown as { __mt_renderer_errors__?: unknown[] }
      return state.__mt_renderer_errors__?.length ?? 0
    })
    const settledInputMeasurement = settledInput
      ? await measureSettledInput(page, session, count, trial)
      : null
    return {
      scenario,
      count,
      trial,
      fixture: {
        exactFilesRequested: count,
        bytesPerFile: fixtureBytes,
        contentShape:
          scenario === 'tiny-content'
            ? 'one H1 and one trailing newline'
            : 'one H1 plus 40 plain paragraphs; no images, diagrams, math, or remote resources',
        openingMethod:
          delivery === 'startup'
            ? 'isolated Electron profile; CLI receives the corpus directory plus the exact child Markdown path set'
            : settledInput
              ? 'isolated Electron profile reaches renderer/menu ready with the corpus folder and fixture 1 already open, then main app-open-files-by-id delivers fixtures 2..N; the final requested corpus remains exactly N Documents/rows'
              : 'isolated Electron profile reaches renderer/menu ready with one pristine blank, then main app-open-files-by-id delivers the exact child path set and replaces the blank'
      },
      delivery,
      observationMethod,
      reachedExactDocumentCount: reachedExactCount,
      exactDocumentReadyMs,
      settledAtMs,
      finalStructure: structure,
      observedWindows,
      mainProbe,
      samples,
      settledMetrics,
      bulkProfile,
      consoleErrors,
      rendererErrors,
      runtimeVersions,
      settledInputMeasurement,
      cleanup
    }
  } finally {
    if (app) {
      try {
        await app.close()
        cleanup.appClose = 'Passed'
      } catch {
        cleanup.appClose = 'Failed'
      }
    } else {
      cleanup.appClose = 'NotLaunched'
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
    const resolvedRoot = path.resolve(root)
    const cleanupTargetIsSafe =
      path.dirname(resolvedRoot).toLowerCase() === path.resolve(driveRoot).toLowerCase() &&
      path.basename(resolvedRoot).startsWith('m7b-')
    if (cleanupTargetIsSafe) {
      cleanup.targetValidated = true
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
      cleanup.rootRemoved = !fs.existsSync(root)
      cleanup.status = cleanup.appClose === 'Passed' && cleanup.rootRemoved ? 'Passed' : 'Failed'
    } else {
      cleanup.status = 'Failed'
      process.stderr.write(`refusing to remove unexpected profile root: ${resolvedRoot}\n`)
      process.exitCode = 1
    }
  }
}

let persistFailure: ((error: unknown) => void) | null = null

const runFreshBuild = () => {
  if (!freshBuild) {
    return {
      status: 'Skipped',
      exitCode: null,
      command: 'pnpm run build',
      workingDirectory: projectRoot,
      detail: 'OPENED_FILES_FRESH_BUILD was not enabled.'
    }
  }
  const startedAt = new Date().toISOString()
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'build'], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false
  })
  const finishedAt = new Date().toISOString()
  const exitCode = result.status ?? 1
  return {
    status: exitCode === 0 ? 'Passed' : 'Failed',
    exitCode,
    command: 'pnpm run build',
    workingDirectory: projectRoot,
    startedAt,
    finishedAt,
    stdoutTail: result.stdout.slice(-4000),
    stderrTail: result.stderr.slice(-4000),
    detail: result.error?.message ?? 'Build process completed.'
  }
}

const main = async () => {
  const startedAt = new Date().toISOString()
  const results: Awaited<ReturnType<typeof runTrial>>[] = []
  const buildExecution = runFreshBuild()
  if (buildExecution.status === 'Failed') {
    throw new Error(`fresh production build failed with exit ${buildExecution.exitCode}`)
  }
  const measurementIdentity = captureMeasurementIdentity(
    projectRoot,
    applicationSourceRevision,
    getElectronPath()
  )
  const reproduction = buildPowerShellReproduction(projectRoot, scriptPath, {
    OPENED_FILES_APPLICATION_SOURCE_SHA: measurementIdentity.applicationSourceSha,
    OPENED_FILES_COUNTS: countsSetting,
    OPENED_FILES_TRIALS: trialsSetting,
    OPENED_FILES_SCENARIOS: scenariosSetting,
    OPENED_FILES_DELIVERY: deliverySetting,
    OPENED_FILES_FEEDBACK_ASSERT: feedbackAssertSetting,
    OPENED_FILES_SETTLED_INPUT: settledInputSetting,
    OPENED_FILES_FRESH_BUILD: freshBuildSetting,
    OPENED_FILES_OUTPUT: outputSetting
  })
  let execution: {
    status: 'Running' | 'Passed' | 'Failed'
    exitCode: number | null
    detail: string
  } = {
    status: 'Running',
    exitCode: null,
    detail: 'Measurement is in progress; partial results are retained after each completed trial.'
  }
  let feedbackAssessment:
    | {
      lowerCount: number
      lowerMedianMs: number | null
      hundredMedianMs: number | null
      latencyRatio: number | null
      scaleRatio: number
      normalizedSlowdown: number | null
      verdict: 'RED' | 'GREEN' | 'INCOMPLETE'
    }
    | null = null
  const persist = (finishedAt: string | null) => {
    const cpu = os.cpus()
    const output = {
      schemaVersion: 3,
      startedAt,
      finishedAt,
      measurementIdentity: {
        ...measurementIdentity,
        runtimeVersions: results[0]?.runtimeVersions ?? null
      },
      reproduction,
      buildExecution,
      execution,
      limitations: [
        'Windows-only unpackaged Electron measurement; installed packages and Linux/macOS are untested.',
        'CPU values are Electron process metrics, not total host CPU utilization.',
        'projection-detached reaches document-ready through the same workspace snapshot milestone as every other scenario; its rows intentionally remain stale and are not compared as row-ready.'
      ],
      environment: {
        buildType: 'production electron-vite build, unpackaged Electron test launch',
        platform: process.platform,
        arch: process.arch,
        osType: os.type(),
        osRelease: os.release(),
        osVersion: os.version(),
        cpuModel: cpu[0]?.model ?? 'unknown',
        logicalProcessorCount: cpu.length,
        totalRamBytes: os.totalmem(),
        harnessNode: process.version,
        configuredContentViewport: referenceViewport,
        automation: 'Playwright-controlled Electron window',
        headless: false
      },
      counts,
      trials,
      scenarios,
      delivery,
      feedbackPolicy: {
        description:
          'RED when the 100-file median document-ready latency per requested file is more than 1.5 times the lower-count median document-ready latency per requested file; INCOMPLETE when an exact workspace document set is unavailable.',
        maximumNormalizedSlowdown: 1.5
      },
      feedbackAssessment,
      results
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  }
  persistFailure = (error) => {
    execution = {
      status: 'Failed',
      exitCode: 1,
      detail: error instanceof Error ? error.message : String(error)
    }
    persist(new Date().toISOString())
  }
  for (const scenario of scenarios) {
    for (const count of counts) {
      for (let trial = 1; trial <= trials; trial++) {
        process.stdout.write(
          `bulk profiling ${scenario}, ${count} exact files, trial ${trial}/${trials}\n`
        )
        const result = await runTrial(count, trial, scenario)
        results.push(result)
        if (result.cleanup.status !== 'Passed') {
          throw new Error(
            `cleanup failed for ${scenario}/${count}/trial-${trial}: ${JSON.stringify(result.cleanup)}`
          )
        }
        process.stdout.write(
          `result ${scenario}/${count}: exact=${result.reachedExactDocumentCount} ` +
            `documentReady=${result.exactDocumentReadyMs?.toFixed(1) ?? 'timeout'}ms ` +
            `documents=${result.finalStructure.workspaceDocuments} rows=${result.finalStructure.openedRows}\n`
        )
        persist(null)
      }
    }
  }
  if (feedbackAssert) {
    const baseline = results.filter((result) => result.scenario === 'baseline')
    const lowerCount = Math.min(...counts)
    const lowerValues = baseline
      .filter((result) => result.count === lowerCount && result.exactDocumentReadyMs !== null)
      .map((result) => result.exactDocumentReadyMs as number)
    const hundredValues = baseline
      .filter((result) => result.count === 100 && result.exactDocumentReadyMs !== null)
      .map((result) => result.exactDocumentReadyMs as number)
    const lowerMedianMs = median(lowerValues)
    const hundredMedianMs = median(hundredValues)
    const scaleRatio = 100 / lowerCount
    if (
      lowerValues.length !== trials ||
      hundredValues.length !== trials ||
      lowerMedianMs === null ||
      hundredMedianMs === null
    ) {
      feedbackAssessment = {
        lowerCount,
        lowerMedianMs,
        hundredMedianMs,
        latencyRatio: null,
        scaleRatio,
        normalizedSlowdown: null,
        verdict: 'INCOMPLETE'
      }
      process.stderr.write('FEEDBACK RED: an exact workspace document set did not become ready\n')
      process.exitCode = 1
    } else {
      const latencyRatio = hundredMedianMs / lowerMedianMs
      const normalizedSlowdown = latencyRatio / scaleRatio
      const red = normalizedSlowdown > 1.5
      feedbackAssessment = {
        lowerCount,
        lowerMedianMs,
        hundredMedianMs,
        latencyRatio,
        scaleRatio,
        normalizedSlowdown,
        verdict: red ? 'RED' : 'GREEN'
      }
      process.stdout.write(
        `feedback: lower=${lowerMedianMs.toFixed(1)}ms ` +
          `hundred=${hundredMedianMs.toFixed(1)}ms ratio=${latencyRatio.toFixed(2)} ` +
          `normalized=${normalizedSlowdown.toFixed(2)} ` +
          `verdict=${red ? 'RED' : 'GREEN'}\n`
      )
      if (red) process.exitCode = 1
    }
  }
  execution =
    process.exitCode === 1
      ? {
        status: 'Failed',
        exitCode: 1,
        detail:
            feedbackAssessment?.verdict === 'RED'
              ? 'The command completed all trials and exited 1 because the retained feedback assertion is RED.'
              : 'The command completed with a failed or incomplete feedback assertion.'
      }
      : {
        status: 'Passed',
        exitCode: 0,
        detail: 'The command completed every configured measurement trial.'
      }
  persist(new Date().toISOString())
  process.stdout.write(`wrote ${outputPath}\n`)
}

main().catch((error) => {
  persistFailure?.(error)
  console.error(error)
  process.exitCode = 1
})
