/* eslint-disable @stylistic/space-before-function-paren */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance as nodePerformance } from 'node:perf_hooks'
import { _electron, type CDPSession, type ElectronApplication, type Page } from 'playwright'
import {
  getElectronPath,
  waitForEditor,
  waitForMenuReady
} from '../../packages/desktop/test/e2e/helpers'

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

const counts = (process.env.OPENED_FILES_COUNTS ?? '20,100')
  .split(',')
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value > 0)
const trials = Number(process.env.OPENED_FILES_TRIALS ?? '1')
const scenarios = (process.env.OPENED_FILES_SCENARIOS ?? 'baseline')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean) as Scenario[]
const feedbackAssert = process.env.OPENED_FILES_FEEDBACK_ASSERT === '1'
const delivery = process.env.OPENED_FILES_DELIVERY === 'ready-batch' ? 'ready-batch' : 'startup'
const outputPath = path.resolve(
  process.env.OPENED_FILES_OUTPUT ??
    '.scratch/wysiwyg-scroll-performance/evidence/07-opened-files-scale-pressure.raw-bulk.json'
)
const projectRoot = path.resolve(__dirname, '../..')
const desktopRoot = path.join(projectRoot, 'packages', 'desktop')
const baselineSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: projectRoot,
  encoding: 'utf8'
}).trim()

const median = (values: readonly number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

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

const readLightCounts = (page: Page, scenario: Scenario) =>
  page.evaluate((activeScenario) => {
    const app = document.querySelector('#app') as
      | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
      | null
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia as
      | { _s?: Map<string, Record<string, unknown>> }
      | undefined
    const editor = pinia?._s?.get('editor') as { tabs?: unknown[] } | undefined
    if (activeScenario !== 'projection-detached') {
      return {
        observedDocuments: editor?.tabs?.length ?? -1,
        openedRows: document.querySelectorAll('.opened-files-list .opened-file').length,
        observationMethod: 'Pinia editor tabs length'
      }
    }
    const driver = window as typeof window & {
      __mtWorkspaceSnapshot?: () => { documents: unknown[] }
    }
    return {
      observedDocuments: driver.__mtWorkspaceSnapshot?.().documents.length ?? -1,
      openedRows: document.querySelectorAll('.opened-files-list .opened-file').length,
      observationMethod:
        'workspace facade snapshot because the Pinia projection consumer is detached'
    }
  }, scenario)

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
  app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
    if (!window) throw new Error('editor window is unavailable for viewport configuration')
    window.setContentSize(1280, 720)
  })

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
        ...(delivery === 'startup' ? [corpus, ...files] : [])
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
    if (scenario === 'list-hidden') await setOpenedFilesPreference(page, false)
    if (scenario === 'projection-detached') await detachProjectionConsumer(page)
    if (delivery === 'ready-batch') {
      await resetMainProbe(app)
      await startProfile(session)
      await emitReadyBatch(app, files)
    }
    const samples: BulkSample[] = []
    const deadline = Date.now() + 90000
    const measurementStarted = delivery === 'ready-batch' ? nodePerformance.now() : launchStarted
    let observedDocuments = -1
    let openedRows = -1
    let observationMethod = ''
    let lastProgressAt = Date.now()
    let lastObservedDocuments = -1
    let reachedExactCount = false
    while (Date.now() < deadline) {
      const observed = await readLightCounts(page, scenario)
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
    const exactReadyMs = reachedExactCount ? nodePerformance.now() - measurementStarted : null
    const bulkProfile = await stopProfile(session)
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
            : 'isolated Electron profile reaches renderer/menu ready with one pristine blank, then main app-open-files-by-id delivers the exact child path set and replaces the blank'
      },
      delivery,
      observationMethod,
      reachedExactCount,
      exactReadyMs,
      settledAtMs,
      finalStructure: structure,
      observedWindows,
      mainProbe,
      samples,
      settledMetrics,
      bulkProfile,
      consoleErrors,
      rendererErrors
    }
  } finally {
    if (app) await app.close().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const resolvedRoot = path.resolve(root)
    const cleanupTargetIsSafe =
      path.dirname(resolvedRoot).toLowerCase() === path.resolve(driveRoot).toLowerCase() &&
      path.basename(resolvedRoot).startsWith('m7b-')
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
  const results: Awaited<ReturnType<typeof runTrial>>[] = []
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
        cpuModel: cpu[0]?.model ?? 'unknown',
        logicalProcessorCount: cpu.length,
        totalRamBytes: os.totalmem(),
        node: process.version,
        electron: '42.1.0',
        configuredContentViewport: { width: 1280, height: 720 },
        automation: 'Playwright-controlled Electron window',
        headless: false
      },
      counts,
      trials,
      scenarios,
      delivery,
      feedbackPolicy: {
        description:
          'RED when the 100-file median latency per requested file is more than 1.5 times the lower-count median latency per requested file; INCOMPLETE when an exact set is unavailable.',
        maximumNormalizedSlowdown: 1.5
      },
      feedbackAssessment,
      results
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  }
  for (const scenario of scenarios) {
    for (const count of counts) {
      for (let trial = 1; trial <= trials; trial++) {
        process.stdout.write(
          `bulk profiling ${scenario}, ${count} exact files, trial ${trial}/${trials}\n`
        )
        const result = await runTrial(count, trial, scenario)
        results.push(result)
        process.stdout.write(
          `result ${scenario}/${count}: exact=${result.reachedExactCount} ` +
            `ready=${result.exactReadyMs?.toFixed(1) ?? 'timeout'}ms ` +
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
      .filter((result) => result.count === lowerCount && result.exactReadyMs !== null)
      .map((result) => result.exactReadyMs as number)
    const hundredValues = baseline
      .filter((result) => result.count === 100 && result.exactReadyMs !== null)
      .map((result) => result.exactReadyMs as number)
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
      process.stderr.write('FEEDBACK RED: an exact requested set did not become ready\n')
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
  persist(new Date().toISOString())
  process.stdout.write(`wrote ${outputPath}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
