/* global MutationObserver, requestAnimationFrame */
/* eslint-disable @stylistic/space-before-function-paren */

const cleanupSelfTestRequested = process.argv.includes('--self-test-cleanup')
const { _electron } = cleanupSelfTestRequested ? { _electron: null } : require('playwright')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const desktopRoot = path.resolve(__dirname, '../../packages/desktop')
const electronPath =
  process.platform === 'win32'
    ? path.join(desktopRoot, 'node_modules/.bin/electron.cmd')
    : path.join(desktopRoot, 'node_modules/electron/dist/electron')
const cpuProfileEnabled = process.argv.includes('--cpu-profile')
const profilePairRequested = process.argv.includes('--profile-pair')
const outputPath = path.resolve(
  __dirname,
  cpuProfileEnabled
    ? 'evidence/06-source-large-document-capacity.profile.raw.json'
    : 'evidence/06-source-large-document-capacity.raw.json'
)
const expectedBaselineSha = 'f15604cac0d7cc337bdb4d174157a89643854c53'
const repositoryRoot = path.resolve(desktopRoot, '../..')
const harnessRelativePath = '.scratch/wysiwyg-scroll-performance/source-large-document-capacity.cjs'
const harnessPath = path.resolve(repositoryRoot, harnessRelativePath)
const productionPathspecs = [
  'packages',
  'scripts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'eslint.config.js'
]
const scales = [10_000, 50_000]
const baselineRepetitions = 3
const timeoutsMs = {
  openThroughPopulatedEditorTotal: 120_000,
  sourceTriggerThroughFirstAcceptedVisibleInputTotal: 150_000,
  cadence: 8_000,
  wheel: 30_000,
  electronCloseGrace: 15_000,
  processTreeExitAfterKill: 15_000,
  directoryCleanupAttempts: 10,
  directoryCleanupRetryDelay: 500
}
const durationMetricNames = [
  'TaskDuration',
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration',
  'ThreadTime'
]
const countMetricNames = ['LayoutCount', 'RecalcStyleCount']
const maxTrialsArgument = process.argv.find((argument) => argument.startsWith('--max-trials='))
const maxTrials = maxTrialsArgument
  ? Number.parseInt(maxTrialsArgument.slice('--max-trials='.length), 10)
  : null
const variantArgument = process.argv.find((argument) => argument.startsWith('--variant='))
const requestedVariant = variantArgument ? variantArgument.slice('--variant='.length) : null
const scaleArgument = process.argv.find((argument) => argument.startsWith('--scale='))
const requestedScale = scaleArgument
  ? Number.parseInt(scaleArgument.slice('--scale='.length), 10)
  : null

function fixture(lineCount) {
  const lines = []
  for (let i = 1; i <= lineCount; i++) {
    if (i % 100 === 1) {
      lines.push(`# Section ${String(i).padStart(5, '0')} deterministic capacity heading`)
    } else {
      lines.push(
        `Line ${String(i).padStart(5, '0')} deterministic source capacity text alpha beta gamma delta epsilon.`
      )
    }
  }
  return `${lines.join('\n')}\n`
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function command(commandName, args, options = {}) {
  const child = spawnSync(commandName, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeout || 30_000,
    windowsHide: true
  })
  return {
    command: [commandName, ...args].join(' '),
    status: child.status,
    signal: child.signal,
    timedOut: child.error?.code === 'ETIMEDOUT',
    error: child.error ? errorText(child.error) : null,
    stdout: (child.stdout || '').trim(),
    stderr: (child.stderr || '').trim()
  }
}

function gitText(args) {
  const result = command('git', args, { cwd: repositoryRoot })
  if (result.status !== 0) throw new Error(`${result.command} failed: ${result.stderr}`)
  return result.stdout
}

function commandSucceeded(result) {
  return result.status === 0 && !result.signal && !result.timedOut && !result.error
}

function sha256Buffer(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex')
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath))
}

function filesUnder(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...filesUnder(entryPath))
    else if (entry.isFile()) files.push(entryPath)
  }
  return files
}

function outManifest() {
  const outRoot = path.join(desktopRoot, 'out')
  if (!fs.existsSync(outRoot)) throw new Error(`Build output directory missing: ${outRoot}`)
  const entries = filesUnder(outRoot)
    .map((filePath) => ({
      path: path.relative(outRoot, filePath).split(path.sep).join('/'),
      bytes: fs.statSync(filePath).size,
      sha256: sha256File(filePath)
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  for (const requiredPrefix of ['main/', 'preload/', 'renderer/']) {
    if (!entries.some((entry) => entry.path.startsWith(requiredPrefix))) {
      throw new Error(`Build output manifest has no ${requiredPrefix} entry`)
    }
  }
  const serialized = entries
    .map((entry) => `${entry.sha256} ${entry.bytes} ${entry.path}`)
    .join('\n')
  return {
    root: 'packages/desktop/out',
    entryCount: entries.length,
    algorithm: 'SHA-256 over sorted "file-sha256 bytes relative-path" lines',
    bundleManifestSha256: sha256Buffer(`${serialized}\n`),
    entries
  }
}

async function boundedTotal(label, milliseconds, action) {
  const deadline = Date.now() + milliseconds
  let timer
  try {
    return await Promise.race([
      action({
        remaining() {
          return Math.max(1, deadline - Date.now())
        }
      }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded one total ${milliseconds} ms deadline`)),
          milliseconds
        )
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function appMetrics(app) {
  return await app.evaluate(({ app }) =>
    app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      cpuPercent: metric.cpu.percentCPUUsage,
      workingSetKiB: metric.memory.workingSetSize,
      privateBytesKiB: metric.memory.privateBytes
    }))
  )
}

async function materialization(page) {
  return await page.evaluate(() => {
    const container = document.querySelector('.source-code')
    const cmNode = document.querySelector('.source-code .CodeMirror')
    const cm = cmNode && cmNode.CodeMirror
    return {
      lineCount: cm ? cm.lineCount() : null,
      codeChildren: document.querySelectorAll('.source-code .CodeMirror-code > div').length,
      renderedLines: document.querySelectorAll('.source-code .CodeMirror-line').length,
      gutterWrappers: document.querySelectorAll('.source-code .CodeMirror-gutter-wrapper').length,
      allDomElements: document.getElementsByTagName('*').length,
      scrollHeight: container ? container.scrollHeight : null,
      scrollWidth: container ? container.scrollWidth : null,
      clientHeight: container ? container.clientHeight : null,
      clientWidth: container ? container.clientWidth : null,
      viewportMargin: cm
        ? Number.isFinite(cm.getOption('viewportMargin'))
          ? cm.getOption('viewportMargin')
          : String(cm.getOption('viewportMargin'))
        : null
    }
  })
}

async function measuredEnvironment(page) {
  return await page.evaluate(() => {
    const container = document.querySelector('.source-code')
    const containerRect = container?.getBoundingClientRect()
    const codeMirror = document.querySelector('.source-code .CodeMirror')
    const codeMirrorRect = codeMirror?.getBoundingClientRect()
    return {
      window: {
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      layoutViewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight
      },
      visualViewport: window.visualViewport
        ? {
            width: window.visualViewport.width,
            height: window.visualViewport.height,
            scale: window.visualViewport.scale
          }
        : null,
      sourceContainer: container
        ? {
            clientWidth: container.clientWidth,
            clientHeight: container.clientHeight,
            scrollWidth: container.scrollWidth,
            scrollHeight: container.scrollHeight,
            boundingWidth: containerRect.width,
            boundingHeight: containerRect.height
          }
        : null,
      codeMirror: codeMirror
        ? {
            clientWidth: codeMirror.clientWidth,
            clientHeight: codeMirror.clientHeight,
            boundingWidth: codeMirrorRect.width,
            boundingHeight: codeMirrorRect.height
          }
        : null,
      documentVisibility: document.visibilityState
    }
  })
}

async function cadence(page, durationMs = 1500) {
  return await page.evaluate(async (duration) => {
    const gaps = []
    const start = performance.now()
    let previous = start
    await new Promise((resolve) => {
      const frame = (now) => {
        gaps.push(now - previous)
        previous = now
        if (now - start >= duration) resolve()
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    const sorted = gaps.slice().sort((a, b) => a - b)
    const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
    return {
      requestedDurationMs: duration,
      elapsedMs: performance.now() - start,
      samples: gaps.length,
      medianMs: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: Math.max(...gaps),
      over50ms: gaps.filter((gap) => gap > 50).length
    }
  }, durationMs)
}

function metricMap(result) {
  return Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]))
}

async function performanceSnapshot(cdp) {
  return metricMap(await cdp.send('Performance.getMetrics'))
}

function performanceDelta(before, after) {
  const seconds = Object.fromEntries(
    durationMetricNames.map((name) => [name, (after[name] || 0) - (before[name] || 0)])
  )
  const counts = Object.fromEntries(
    countMetricNames.map((name) => [name, (after[name] || 0) - (before[name] || 0)])
  )
  return {
    units: { durations: 'seconds', counts: 'events' },
    durations: seconds,
    counts,
    derived: {
      scriptShareOfTask:
        seconds.TaskDuration > 0 ? seconds.ScriptDuration / seconds.TaskDuration : null,
      layoutAndStyleShareOfTask:
        seconds.TaskDuration > 0
          ? (seconds.LayoutDuration + seconds.RecalcStyleDuration) / seconds.TaskDuration
          : null,
      taskMinusScriptLayoutStyleSeconds:
        seconds.TaskDuration -
        seconds.ScriptDuration -
        seconds.LayoutDuration -
        seconds.RecalcStyleDuration
    }
  }
}

function summarizeCpuProfile(profile) {
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]))
  const aggregate = new Map()
  for (let index = 0; index < (profile.samples || []).length; index++) {
    const node = nodesById.get(profile.samples[index])
    if (!node) continue
    const frame = node.callFrame
    const key = [
      frame.functionName || '(anonymous)',
      frame.url || '',
      frame.lineNumber,
      frame.columnNumber
    ].join('|')
    const entry = aggregate.get(key) || {
      functionName: frame.functionName || '(anonymous)',
      url: frame.url || '',
      lineNumberZeroBased: frame.lineNumber,
      columnNumberZeroBased: frame.columnNumber,
      samples: 0,
      sampledTimeMicroseconds: 0
    }
    entry.samples += 1
    entry.sampledTimeMicroseconds += profile.timeDeltas?.[index] || 0
    aggregate.set(key, entry)
  }
  const aggregatedNodes = [...aggregate.values()].sort(
    (a, b) => b.sampledTimeMicroseconds - a.sampledTimeMicroseconds
  )
  return {
    method: 'Chromium DevTools V8 CPU profiler at a 1000 microsecond sampling interval',
    profileStartTimeMicroseconds: profile.startTime,
    profileEndTimeMicroseconds: profile.endTime,
    totalSamples: (profile.samples || []).length,
    totalSampledTimeMicroseconds: (profile.timeDeltas || []).reduce(
      (total, value) => total + value,
      0
    ),
    aggregatedNodes
  }
}

async function armSourceProbe(page, variant, marker) {
  await page.waitForFunction(() => typeof window.CodeMirror?.defineInitHook === 'function', null, {
    timeout: 10_000
  })
  await page.evaluate(
    ({ trialVariant, inputMarker }) => {
      const probe = {
        variant: trialVariant,
        marker: inputMarker,
        preTriggerArmAtMs: performance.now(),
        codeMirrorObservedAtMs: null,
        cursorPreparationStartedAtMs: null,
        cursorPreparationFinishedAtMs: null,
        inputArmedAtMs: null,
        keydownAtMs: null,
        keydownTrusted: null,
        changeEventObservedAtMs: null,
        visibleMutationObservedAtMs: null,
        productionHandlersRemoved: null,
        finiteViewportInitHook: null
      }
      window.__sourceCapacityProbe = probe

      if (trialVariant === 'finite-viewport-plus-fixed-height') {
        const style = document.createElement('style')
        style.dataset.sourceCapacityIntervention = trialVariant
        style.textContent = '.source-code .CodeMirror { height: 100% !important; }'
        document.head.appendChild(style)
      }

      if (
        trialVariant === 'finite-viewport-init-hook' ||
        trialVariant === 'finite-viewport-plus-fixed-height'
      ) {
        window.CodeMirror.defineInitHook((cm) => {
          if (!cm.getWrapperElement()?.closest('.source-code')) return
          const startedAtMs = performance.now()
          const before = cm.getOption('viewportMargin')
          cm.setOption('viewportMargin', 10)
          probe.finiteViewportInitHook = {
            startedAtMs,
            finishedAtMs: performance.now(),
            before: Number.isFinite(before) ? before : String(before),
            after: cm.getOption('viewportMargin')
          }
        })
      }

      let visibleObserver
      const documentObserver = new MutationObserver(() => installInputProbe())
      const installInputProbe = () => {
        if (probe.inputArmedAtMs !== null) return
        const cmNode = document.querySelector('.source-code .CodeMirror')
        const cm = cmNode && cmNode.CodeMirror
        const input = cm?.getInputField()
        const code = document.querySelector('.source-code .CodeMirror-code')
        if (!cm || !input || !code) return

        probe.codeMirrorObservedAtMs = performance.now()
        if (trialVariant === 'without-source-sync-handlers') {
          const removed = {}
          for (const eventName of ['change', 'cursorActivity']) {
            const handlers = Array.isArray(cm._handlers?.[eventName])
              ? cm._handlers[eventName].slice()
              : []
            removed[eventName] = handlers.length
            for (const handler of handlers) cm.off(eventName, handler)
          }
          probe.productionHandlersRemoved = removed
        }

        probe.cursorPreparationStartedAtMs = performance.now()
        cm.focus()
        cm.setCursor({ line: 0, ch: 0 })
        probe.cursorPreparationFinishedAtMs = performance.now()

        input.addEventListener(
          'keydown',
          (event) => {
            if (event.key.toLowerCase() !== inputMarker) return
            probe.keydownAtMs = performance.now()
            probe.keydownTrusted = event.isTrusted
          },
          { capture: true, once: true }
        )
        cm.on('change', (instance) => {
          if (
            probe.changeEventObservedAtMs === null &&
            instance.getLine(0).startsWith(inputMarker)
          ) {
            probe.changeEventObservedAtMs = performance.now()
          }
        })
        visibleObserver = new MutationObserver(() => {
          const firstLine = document.querySelector('.source-code .CodeMirror-line')
          if ((firstLine?.textContent || '').startsWith(inputMarker)) {
            probe.visibleMutationObservedAtMs = performance.now()
            visibleObserver.disconnect()
          }
        })
        visibleObserver.observe(code, { childList: true, characterData: true, subtree: true })
        probe.inputArmedAtMs = performance.now()
        documentObserver.disconnect()
      }
      documentObserver.observe(document.documentElement, { childList: true, subtree: true })
      installInputProbe()
    },
    { trialVariant: variant, inputMarker: marker }
  )
}

async function triggerSourceAndFirstInput(app, page, cdp, variant, marker) {
  await armSourceProbe(page, variant, marker)
  if (cpuProfileEnabled) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 1_000 })
    await cdp.send('Profiler.start')
  }
  const performanceBeforeSource = await performanceSnapshot(cdp)
  const sourceTriggerStartedAtNodeMs = performance.now()

  return await boundedTotal(
    'Source trigger through first accepted and visible input',
    timeoutsMs.sourceTriggerThroughFirstAcceptedVisibleInputTotal,
    async (deadline) => {
      await app.evaluate(({ Menu, BrowserWindow }) => {
        const item = Menu.getApplicationMenu()?.getMenuItemById('sourceCodeModeMenuItem')
        if (!item) throw new Error('Source menu item unavailable')
        item.checked = !item.checked
        const win = BrowserWindow.getAllWindows()[0]
        item.click(undefined, win, win.webContents)
      })
      const sourceCommandReturnedAtNodeMs = performance.now()

      await page.waitForFunction(
        () => Number.isFinite(window.__sourceCapacityProbe?.inputArmedAtMs),
        null,
        { timeout: deadline.remaining() }
      )
      const inputArmedAtNodeMs = performance.now()
      const sourceEntryCpuProfile = cpuProfileEnabled
        ? summarizeCpuProfile((await cdp.send('Profiler.stop')).profile)
        : null
      const performanceAfterSourceEntry = await performanceSnapshot(cdp)
      if (cpuProfileEnabled) await cdp.send('Profiler.start')
      const keyboardDispatchStartedAtNodeMs = performance.now()
      await page.keyboard.press(marker)
      await page.waitForFunction(
        () => {
          const probe = window.__sourceCapacityProbe
          return (
            Number.isFinite(probe?.keydownAtMs) &&
            Number.isFinite(probe?.changeEventObservedAtMs) &&
            Number.isFinite(probe?.visibleMutationObservedAtMs)
          )
        },
        null,
        { timeout: deadline.remaining() }
      )
      const acceptedAndVisibleAtNodeMs = performance.now()
      const firstInputCpuProfile = cpuProfileEnabled
        ? summarizeCpuProfile((await cdp.send('Profiler.stop')).profile)
        : null
      const performanceAfterInput = await performanceSnapshot(cdp)
      const rendererProbe = await page.evaluate(() => {
        const probe = window.__sourceCapacityProbe
        const cmNode = document.querySelector('.source-code .CodeMirror')
        const cm = cmNode && cmNode.CodeMirror
        return {
          ...probe,
          valueAccepted: !!cm && cm.getLine(0).startsWith(probe.marker),
          visibleTextAccepted: (
            document.querySelector('.source-code .CodeMirror-line')?.textContent || ''
          ).startsWith(probe.marker)
        }
      })

      return {
        timeoutMs: timeoutsMs.sourceTriggerThroughFirstAcceptedVisibleInputTotal,
        timingBoundary:
          'one total deadline begins immediately before invoking the Source menu command and ends only after the first Playwright keydown is observed in CodeMirror change state and visible line DOM',
        sourceCommandStartToReturnMs: sourceCommandReturnedAtNodeMs - sourceTriggerStartedAtNodeMs,
        sourceCommandStartToInputArmedMs: inputArmedAtNodeMs - sourceTriggerStartedAtNodeMs,
        sourceCommandStartToFirstAcceptedAndVisibleMs:
          acceptedAndVisibleAtNodeMs - sourceTriggerStartedAtNodeMs,
        keyboardDispatchStartToAcceptedAndVisibleMs:
          acceptedAndVisibleAtNodeMs - keyboardDispatchStartedAtNodeMs,
        rendererProbe: {
          ...rendererProbe,
          preTriggerArmToCodeMirrorObservedMs:
            rendererProbe.codeMirrorObservedAtMs - rendererProbe.preTriggerArmAtMs,
          cursorPreparationMs:
            rendererProbe.cursorPreparationFinishedAtMs -
            rendererProbe.cursorPreparationStartedAtMs,
          keydownToChangeEventObservedMs:
            rendererProbe.changeEventObservedAtMs - rendererProbe.keydownAtMs,
          keydownToVisibleMutationMs:
            rendererProbe.visibleMutationObservedAtMs - rendererProbe.keydownAtMs
        },
        sourceEntryPerformance: performanceDelta(
          performanceBeforeSource,
          performanceAfterSourceEntry
        ),
        firstInputPerformance: performanceDelta(performanceAfterSourceEntry, performanceAfterInput),
        cpuProfile: cpuProfileEnabled
          ? { sourceEntry: sourceEntryCpuProfile, firstInput: firstInputCpuProfile }
          : null
      }
    }
  )
}

async function wheelProbe(page) {
  const container = page.locator('.source-code')
  const box = await container.boundingBox()
  if (!box) throw new Error('Source scroll container has no bounding box')
  const requestedPulses = 8
  const deltaY = 600
  await page.evaluate(() => {
    const outer = document.querySelector('.source-code')
    const cmNode = document.querySelector('.source-code .CodeMirror')
    const cm = cmNode && cmNode.CodeMirror
    const codeMirrorScroller = cm?.getScrollerElement()
    if (!outer || !codeMirrorScroller) throw new Error('Source scroll candidates unavailable')
    const candidates = [
      { name: 'outer-source-container', element: outer },
      { name: 'codemirror-scroller', element: codeMirrorScroller }
    ]
    for (const candidate of candidates) candidate.element.scrollTop = 0
    const active = candidates
      .slice()
      .sort(
        (a, b) =>
          b.element.scrollHeight -
          b.element.clientHeight -
          (a.element.scrollHeight - a.element.clientHeight)
      )[0]
    const probe = {
      armedAtMs: performance.now(),
      activeTarget: active.name,
      initialScrollTop: active.element.scrollTop,
      wheelEvents: [],
      scrollEvents: []
    }
    window.__sourceWheelProbe = probe
    outer.addEventListener(
      'wheel',
      (event) => {
        probe.wheelEvents.push({
          atMs: performance.now(),
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          isTrusted: event.isTrusted
        })
      },
      { capture: true }
    )
    for (const candidate of candidates) {
      candidate.element.addEventListener('scroll', () => {
        probe.scrollEvents.push({
          atMs: performance.now(),
          target: candidate.name,
          scrollTop: candidate.element.scrollTop
        })
      })
    }
  })

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const driverStartedAt = performance.now()
  for (let i = 0; i < requestedPulses; i++) await page.mouse.wheel(0, deltaY)
  await page.waitForFunction(
    () => {
      const probe = window.__sourceWheelProbe
      return (
        probe?.wheelEvents.length > 0 && probe?.scrollEvents.some((event) => event.scrollTop > 0)
      )
    },
    null,
    { timeout: timeoutsMs.wheel }
  )
  await page.waitForTimeout(250)
  const driverElapsedMs = performance.now() - driverStartedAt
  return await page.evaluate(
    ({ pulses, requestedDeltaY, elapsed }) => {
      const probe = window.__sourceWheelProbe
      const outer = document.querySelector('.source-code')
      const cmNode = document.querySelector('.source-code .CodeMirror')
      const cm = cmNode && cmNode.CodeMirror
      const codeMirrorScroller = cm?.getScrollerElement()
      const active = probe.activeTarget === 'codemirror-scroller' ? codeMirrorScroller : outer
      const firstWheel = probe.wheelEvents[0]
      const firstMovedScroll = probe.scrollEvents.find((event) => event.scrollTop > 0)
      const wheelTimes = probe.wheelEvents.map((event) => event.atMs)
      const wheelEventGaps = wheelTimes.slice(1).map((time, index) => time - wheelTimes[index])
      return {
        mechanism: 'Playwright page.mouse.wheel through Chromium input dispatch',
        requestedPulses: pulses,
        requestedDeltaY,
        driverElapsedMs: elapsed,
        observedWheelEvents: probe.wheelEvents.length,
        allObservedWheelEventsTrusted: probe.wheelEvents.every((event) => event.isTrusted),
        wheelEvents: probe.wheelEvents,
        observedScrollEvents: probe.scrollEvents.length,
        activeScrollTarget: probe.activeTarget,
        firstWheelToFirstMovedScrollMs:
          firstWheel && firstMovedScroll ? firstMovedScroll.atMs - firstWheel.atMs : null,
        wheelEventGapMedianMs: wheelEventGaps.length
          ? wheelEventGaps.slice().sort((a, b) => a - b)[Math.floor(wheelEventGaps.length / 2)]
          : null,
        initialScrollTop: probe.initialScrollTop,
        finalScrollTop: active?.scrollTop ?? null,
        maximumScrollTop: active ? active.scrollHeight - active.clientHeight : null,
        outerFinalScrollTop: outer?.scrollTop ?? null,
        codeMirrorScrollerFinalScrollTop: codeMirrorScroller?.scrollTop ?? null
      }
    },
    { pulses: requestedPulses, requestedDeltaY: deltaY, elapsed: driverElapsedMs }
  )
}

function windowsProcessTree(rootPid, runCommand = command) {
  const snapshot = runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId) | ConvertTo-Json -Compress'
  ])
  if (!commandSucceeded(snapshot)) {
    return {
      method: 'Win32_Process parent traversal',
      successful: false,
      failure: 'Win32_Process inventory command failed',
      snapshot,
      pids: []
    }
  }
  try {
    const parsed = JSON.parse(snapshot.stdout)
    const processes = Array.isArray(parsed) ? parsed : [parsed]
    if (
      !processes.length ||
      processes.some(
        (processInfo) =>
          !Number.isSafeInteger(processInfo?.ProcessId) ||
          !Number.isSafeInteger(processInfo?.ParentProcessId)
      )
    ) {
      throw new Error('process inventory did not contain valid integer PID relationships')
    }
    const pids = new Set([rootPid])
    let changed = true
    while (changed) {
      changed = false
      for (const processInfo of processes) {
        if (pids.has(processInfo.ParentProcessId) && !pids.has(processInfo.ProcessId)) {
          pids.add(processInfo.ProcessId)
          changed = true
        }
      }
    }
    return {
      method: 'Win32_Process parent traversal',
      successful: true,
      snapshot: { ...snapshot, stdout: '<process inventory parsed; omitted>' },
      pids: [...pids].sort((a, b) => a - b)
    }
  } catch (error) {
    return {
      method: 'Win32_Process parent traversal',
      successful: false,
      failure: 'Win32_Process inventory JSON could not be validated',
      snapshot: { ...snapshot, stdout: '<unparseable process inventory omitted>' },
      parseError: errorText(error),
      pids: []
    }
  }
}

function queryExistingPids(pids, runCommand = command, platform = process.platform) {
  if (platform === 'win32') {
    const snapshot = runCommand('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '@(Get-CimInstance Win32_Process | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress'
    ])
    if (!commandSucceeded(snapshot)) {
      return {
        successful: false,
        failure: 'Win32_Process PID verification command failed',
        snapshot,
        existingPids: []
      }
    }
    try {
      const parsed = JSON.parse(snapshot.stdout)
      const allPids = (Array.isArray(parsed) ? parsed : [parsed]).map(Number)
      if (allPids.some((pid) => !Number.isSafeInteger(pid))) {
        throw new Error('PID inventory contained a non-integer value')
      }
      const allPidSet = new Set(allPids)
      return {
        successful: true,
        snapshot: { ...snapshot, stdout: '<PID inventory parsed; omitted>' },
        existingPids: pids.filter((pid) => allPidSet.has(pid))
      }
    } catch (error) {
      return {
        successful: false,
        failure: 'Win32_Process PID verification JSON could not be validated',
        snapshot: { ...snapshot, stdout: '<unparseable PID inventory omitted>' },
        parseError: errorText(error),
        existingPids: []
      }
    }
  }

  const existingPids = []
  for (const pid of pids) {
    try {
      process.kill(pid, 0)
      existingPids.push(pid)
    } catch (error) {
      if (error?.code === 'EPERM') existingPids.push(pid)
      else if (error?.code !== 'ESRCH') {
        return {
          successful: false,
          failure: `PID ${pid} verification failed`,
          queryError: errorText(error),
          existingPids
        }
      }
    }
  }
  return { successful: true, existingPids }
}

async function pollPidsGone(pids, timeoutMs, queryPids = queryExistingPids, wait = delay) {
  const startedAt = performance.now()
  const queries = []
  let query = queryPids(pids)
  queries.push(query)
  while (
    query.successful &&
    query.existingPids.length &&
    performance.now() - startedAt < timeoutMs
  ) {
    await wait(Math.min(250, Math.max(1, timeoutMs - (performance.now() - startedAt))))
    query = queryPids(pids)
    queries.push(query)
  }
  return {
    checkedPids: pids,
    elapsedMs: performance.now() - startedAt,
    queryCount: queries.length,
    querySuccessful: query.successful,
    queryFailure: query.successful ? null : query,
    remainingPids: query.existingPids,
    allExited: query.successful && query.existingPids.length === 0,
    timedOut: query.successful && query.existingPids.length > 0
  }
}

function deadlineError(error) {
  return errorText(error).includes('exceeded one total')
}

async function closeAndVerifyProcessTree(app, rootPid, operations = {}) {
  const platform = operations.platform || process.platform
  const runCommand = operations.command || command
  const discover = operations.windowsProcessTree || windowsProcessTree
  const poll = operations.pollPidsGone || pollPidsGone
  const discovery =
    platform === 'win32'
      ? discover(rootPid, runCommand)
      : { method: 'Electron application root process only', successful: true, pids: [rootPid] }
  const cleanupErrors = []
  if (!discovery.successful) cleanupErrors.push(discovery.failure)

  let courtesyClose
  try {
    await boundedTotal('Electron courtesy close', timeoutsMs.electronCloseGrace, () => app.close())
    courtesyClose = { status: 'resolved', timeoutMs: timeoutsMs.electronCloseGrace }
  } catch (error) {
    courtesyClose = {
      status: deadlineError(error) ? 'timed-out' : 'failed',
      timeoutMs: timeoutsMs.electronCloseGrace,
      error: errorText(error)
    }
  }

  if (!discovery.successful) {
    if (courtesyClose.status === 'timed-out') {
      cleanupErrors.push('Electron courtesy close timed out after discovery failed')
    } else if (courtesyClose.status === 'failed') {
      cleanupErrors.push('Electron courtesy close failed after discovery failed')
    }
    return {
      rootPid,
      discovery,
      courtesyClose,
      afterCourtesyClose: { status: 'skipped-because-discovery-failed' },
      beforeForcedKill: { status: 'skipped-because-discovery-failed' },
      forcedKillResults: [],
      afterForcedCleanup: { status: 'skipped-because-discovery-failed' },
      cleanupErrors,
      successful: false
    }
  }

  const afterCourtesyClose = await poll(discovery.pids, 2_000)
  if (!afterCourtesyClose.querySuccessful) {
    cleanupErrors.push('PID verification after courtesy close failed')
  }
  if (courtesyClose.status === 'timed-out') {
    cleanupErrors.push('Electron courtesy close timed out')
  } else if (courtesyClose.status === 'failed') {
    if (afterCourtesyClose.allExited) {
      courtesyClose.status = 'already-exited-during-close'
      courtesyClose.disposition =
        'non-timeout close error accepted only because successful PID verification proved every discovered process already exited'
    } else {
      cleanupErrors.push('Electron courtesy close failed while discovered processes remained')
    }
  }

  const kills = []
  let beforeForcedKill = {
    status: afterCourtesyClose.allExited ? 'not-required-all-processes-exited' : 'pending'
  }
  if (afterCourtesyClose.querySuccessful && !afterCourtesyClose.allExited) {
    beforeForcedKill = await poll(afterCourtesyClose.remainingPids, 0)
    if (!beforeForcedKill.querySuccessful) {
      cleanupErrors.push('PID verification immediately before forced kill failed')
    } else if (!beforeForcedKill.allExited && platform === 'win32') {
      const targets = beforeForcedKill.remainingPids.includes(rootPid)
        ? [rootPid]
        : beforeForcedKill.remainingPids
      for (const pid of targets) {
        const kill = runCommand('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
          timeout: timeoutsMs.processTreeExitAfterKill
        })
        kills.push({ pid, ...kill, successful: commandSucceeded(kill) })
      }
    } else if (!beforeForcedKill.allExited) {
      for (const pid of beforeForcedKill.remainingPids) {
        try {
          process.kill(pid, 'SIGKILL')
          kills.push({ pid, status: 0, signal: 'SIGKILL', error: null, successful: true })
        } catch (error) {
          kills.push({
            pid,
            status: null,
            signal: 'SIGKILL',
            error: errorText(error),
            successful: false
          })
        }
      }
    }
  }
  if (kills.some((kill) => !kill.successful)) {
    cleanupErrors.push('one or more forced-kill commands failed')
  }

  const afterForcedCleanup =
    afterCourtesyClose.querySuccessful && beforeForcedKill.querySuccessful !== false
      ? await poll(discovery.pids, timeoutsMs.processTreeExitAfterKill)
      : { status: 'skipped-because-an-earlier-PID-query-failed', allExited: false }
  if (afterForcedCleanup.querySuccessful === false) {
    cleanupErrors.push('final PID verification failed')
  } else if (afterForcedCleanup.timedOut) {
    cleanupErrors.push('not all discovered PIDs exited within the bounded wait')
  }
  return {
    rootPid,
    discovery,
    courtesyClose,
    afterCourtesyClose,
    beforeForcedKill,
    forcedKillResults: kills,
    afterForcedCleanup,
    cleanupErrors,
    successful: cleanupErrors.length === 0 && afterForcedCleanup.allExited === true
  }
}

async function removePathWithRetries(targetPath, expectedParent) {
  const resolvedTarget = path.resolve(targetPath)
  const resolvedParent = path.resolve(expectedParent)
  if (
    resolvedTarget === resolvedParent ||
    !resolvedTarget.startsWith(`${resolvedParent}${path.sep}`)
  ) {
    throw new Error(`Refused cleanup outside expected parent: ${resolvedTarget}`)
  }
  const attempts = []
  for (let attempt = 1; attempt <= timeoutsMs.directoryCleanupAttempts; attempt++) {
    try {
      fs.rmSync(resolvedTarget, { recursive: true, force: true, maxRetries: 0 })
      attempts.push({ attempt, error: null, existsAfter: fs.existsSync(resolvedTarget) })
    } catch (error) {
      attempts.push({
        attempt,
        error: errorText(error),
        existsAfter: fs.existsSync(resolvedTarget)
      })
    }
    if (!fs.existsSync(resolvedTarget)) {
      return {
        pathName: path.basename(resolvedTarget),
        attempts,
        removed: true,
        boundedMaximumMs:
          timeoutsMs.directoryCleanupAttempts * timeoutsMs.directoryCleanupRetryDelay
      }
    }
    if (attempt < timeoutsMs.directoryCleanupAttempts) {
      await delay(timeoutsMs.directoryCleanupRetryDelay)
    }
  }
  return {
    pathName: path.basename(resolvedTarget),
    attempts,
    removed: false,
    isolation:
      'retained under the unique OS-temporary trial root; harness aborts before next trial',
    boundedMaximumMs: timeoutsMs.directoryCleanupAttempts * timeoutsMs.directoryCleanupRetryDelay
  }
}

async function cleanupTrialPaths(trialRoot, profilePath, fixturePath) {
  const temporaryRoot = os.tmpdir()
  const profile = await removePathWithRetries(profilePath, trialRoot)
  if (!profile.removed) {
    return {
      profile,
      fixtureFile: { status: 'retained-after-earlier-path-cleanup-failure' },
      trialRoot: { status: 'retained-after-earlier-path-cleanup-failure' },
      successful: false
    }
  }
  const fixtureFile = await removePathWithRetries(fixturePath, trialRoot)
  if (!fixtureFile.removed) {
    return {
      profile,
      fixtureFile,
      trialRoot: { status: 'retained-after-earlier-path-cleanup-failure' },
      successful: false
    }
  }
  const root = await removePathWithRetries(trialRoot, temporaryRoot)
  return {
    profile,
    fixtureFile,
    trialRoot: root,
    successful: profile.removed && fixtureFile.removed && root.removed
  }
}

async function finalizeTrialCleanup(resources, operations = {}) {
  const closeProcesses = operations.closeAndVerifyProcessTree || closeAndVerifyProcessTree
  const cleanupPaths = operations.cleanupTrialPaths || cleanupTrialPaths
  let processCleanup
  if (resources.app && resources.rootPid) {
    processCleanup = await closeProcesses(resources.app, resources.rootPid)
  } else if (!resources.app && !resources.rootPid) {
    processCleanup = {
      successful: true,
      status: 'no Electron process handle was returned',
      rootPid: null
    }
  } else {
    processCleanup = {
      successful: false,
      status: 'incomplete Electron process identity',
      rootPid: resources.rootPid || null
    }
  }

  if (!processCleanup.successful) {
    return {
      processCleanup,
      pathCleanup: {
        status: 'skipped-and-retained-because-process-cleanup-was-not-verified',
        successful: false,
        retainedTrialRootName: path.basename(resources.trialRoot)
      },
      cleanupSuccessful: false,
      harnessDisposition: 'abort-before-next-trial'
    }
  }

  try {
    const pathCleanup = await cleanupPaths(
      resources.trialRoot,
      resources.profilePath,
      resources.fixturePath
    )
    return {
      processCleanup,
      pathCleanup,
      cleanupSuccessful: pathCleanup.successful,
      harnessDisposition: pathCleanup.successful ? 'continue' : 'abort-before-next-trial'
    }
  } catch (error) {
    return {
      processCleanup,
      pathCleanup: {
        status: 'failed-and-trial-root-retained',
        successful: false,
        retainedTrialRootName: path.basename(resources.trialRoot),
        error: errorText(error)
      },
      cleanupSuccessful: false,
      harnessDisposition: 'abort-before-next-trial'
    }
  }
}

async function runTrial(lineCount, repetition, variant) {
  const trialRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `marktext-source-${lineCount}-${variant}-${repetition}-`)
  )
  const fixturePath = path.join(trialRoot, `fixture-${lineCount}-${crypto.randomUUID()}.md`)
  const profilePath = path.join(trialRoot, `profile-${crypto.randomUUID()}`)
  const contents = fixture(lineCount)
  fs.writeFileSync(fixturePath, contents, 'utf8')
  fs.mkdirSync(profilePath)
  let app
  let rootPid
  const trialStartedAtNodeMs = performance.now()
  const result = {
    lineCount,
    repetition,
    variant,
    fixture: {
      fileName: path.basename(fixturePath),
      bytes: Buffer.byteLength(contents),
      headings: Math.ceil(lineCount / 100),
      bodyLines: lineCount - Math.ceil(lineCount / 100),
      sha256: crypto.createHash('sha256').update(contents).digest('hex')
    },
    isolation: {
      temporaryRootName: path.basename(trialRoot),
      profileDirectoryName: path.basename(profilePath),
      scope: 'unique fixture, profile, and OS-temporary root for this trial only'
    }
  }

  try {
    const launched = await boundedTotal(
      'process launch through populated WYSIWYG editor readiness',
      timeoutsMs.openThroughPopulatedEditorTotal,
      async (deadline) => {
        app = await _electron.launch({
          executablePath: electronPath,
          args: [desktopRoot, '--user-data-dir', profilePath, fixturePath],
          cwd: desktopRoot,
          env: { ...process.env, PERF_TESTING: 'true', MARKTEXT_ERROR_INTERACTION: '1' },
          timeout: Math.min(40_000, deadline.remaining())
        })
        rootPid = app.process().pid
        const firstPage = await app.firstWindow({ timeout: deadline.remaining() })
        await firstPage.waitForLoadState('domcontentloaded', { timeout: deadline.remaining() })
        await firstPage.waitForSelector('.editor-component', {
          state: 'attached',
          timeout: deadline.remaining()
        })
        await firstPage.waitForFunction(
          () => {
            const editor = document.querySelector('.editor-component')
            return !!editor && editor.children.length > 0
          },
          null,
          { timeout: deadline.remaining() }
        )
        return firstPage
      }
    )
    const page = launched
    result.launchedRuntime = await app.evaluate(({ process }) => ({
      execPath: process.execPath,
      versions: process.versions
    }))
    result.rendererRuntime = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform
    }))
    result.openReadyMs = performance.now() - trialStartedAtNodeMs
    result.openReadinessTimeoutMs = timeoutsMs.openThroughPopulatedEditorTotal
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable', { timeDomain: 'threadTicks' })
    result.preSourceCadence = await boundedTotal('pre-source cadence', timeoutsMs.cadence, () =>
      cadence(page)
    )
    result.preSourceMetrics = await appMetrics(app)
    const marker = String.fromCharCode(113 + ((lineCount / 10_000 + repetition) % 8))
    result.sourceReadiness = await triggerSourceAndFirstInput(app, page, cdp, variant, marker)
    result.measuredEnvironment = await measuredEnvironment(page)
    result.materialization = await materialization(page)
    result.postInputMetrics = await appMetrics(app)
    result.sourceIdleCadence = await boundedTotal('source idle cadence', timeoutsMs.cadence, () =>
      cadence(page)
    )
    result.wheel = await boundedTotal('real Playwright wheel probe', timeoutsMs.wheel, () =>
      wheelProbe(page)
    )
    result.postWheelMetrics = await appMetrics(app)
    await cdp.detach()
    result.measurementStatus = 'completed'
  } catch (error) {
    result.measurementStatus = 'capacity-limit-or-infrastructure-failure'
    result.failure = errorText(error)
    result.elapsedAtFailureMs = performance.now() - trialStartedAtNodeMs
  } finally {
    const cleanup = await finalizeTrialCleanup({
      app,
      rootPid,
      trialRoot,
      profilePath,
      fixturePath
    })
    Object.assign(result, cleanup)
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  return result
}

function trialPlans() {
  const plans = []
  for (const lineCount of scales) {
    for (let repetition = 1; repetition <= baselineRepetitions; repetition++) {
      plans.push({ lineCount, repetition, variant: 'production-baseline' })
    }
    plans.push({ lineCount, repetition: 1, variant: 'finite-viewport-init-hook' })
    plans.push({ lineCount, repetition: 1, variant: 'finite-viewport-plus-fixed-height' })
    plans.push({ lineCount, repetition: 1, variant: 'without-source-sync-handlers' })
  }
  return plans
}

function repositoryIdentity() {
  const repositoryHeadAtRun = gitText(['rev-parse', 'HEAD'])
  const branchAtRun = gitText(['branch', '--show-current'])
  const repositoryStatus = command('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repositoryRoot
  })
  const productionStatus = command(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '--', ...productionPathspecs],
    { cwd: repositoryRoot }
  )
  const productionBaselineDiff = command(
    'git',
    ['diff', '--quiet', expectedBaselineSha, '--', ...productionPathspecs],
    { cwd: repositoryRoot }
  )
  const harnessStatus = command(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '--', harnessRelativePath],
    { cwd: repositoryRoot }
  )
  const harnessCommitSha = gitText(['log', '-1', '--format=%H', '--', harnessRelativePath])
  return {
    requiredStartingSha: expectedBaselineSha,
    repositoryHeadAtRun,
    branchAtRun,
    repositoryCleanAtStart: commandSucceeded(repositoryStatus) && repositoryStatus.stdout === '',
    repositoryStatus,
    productionPathspecs,
    productionPathsClean: commandSucceeded(productionStatus) && productionStatus.stdout === '',
    productionStatus,
    productionPathsMatchRequiredStartingSha: productionBaselineDiff.status === 0,
    productionBaselineDiff,
    harnessPath: harnessRelativePath,
    harnessClean: commandSucceeded(harnessStatus) && harnessStatus.stdout === '',
    harnessStatus,
    harnessCommitSha,
    harnessCommitIsHead: harnessCommitSha === repositoryHeadAtRun,
    harnessSha256: sha256File(harnessPath)
  }
}

function verifyRepositoryIdentity(identity) {
  const requirements = [
    ['repository was clean before build and measurement', identity.repositoryCleanAtStart],
    ['production paths were clean', identity.productionPathsClean],
    [
      'production paths matched the required starting SHA',
      identity.productionPathsMatchRequiredStartingSha
    ],
    ['harness file was clean', identity.harnessClean],
    ['HEAD was the commit that last changed the harness', identity.harnessCommitIsHead]
  ]
  const failures = requirements.filter(([, satisfied]) => !satisfied).map(([label]) => label)
  if (failures.length) throw new Error(`Refused measurement: ${failures.join('; ')}`)
}

function executeAndIdentifyBuild() {
  const buildCommandName = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const execution = command(buildCommandName, ['--filter', 'marktext', 'build'], {
    cwd: repositoryRoot,
    timeout: 300_000
  })
  if (!commandSucceeded(execution)) {
    return {
      type: 'local production Electron build',
      applicationSource: 'verified clean production paths matching the required starting SHA',
      execution,
      status: 'failed',
      successful: false
    }
  }

  const electronVersionExecution = command(electronPath, ['--version'], {
    cwd: desktopRoot,
    timeout: 30_000
  })
  let manifest
  try {
    manifest = outManifest()
  } catch (error) {
    return {
      type: 'local production Electron build',
      applicationSource: 'verified clean production paths matching the required starting SHA',
      execution,
      status: 'failed-output-validation',
      successful: false,
      outputValidationError: errorText(error),
      electronVersionExecution,
      electronVersionCommandSuccessful: commandSucceeded(electronVersionExecution)
    }
  }
  return {
    type: 'local production Electron build',
    applicationSource: 'verified clean production paths matching the required starting SHA',
    execution,
    status: 'completed',
    successful: true,
    electronVersionExecution,
    electronVersionCommandSuccessful: commandSucceeded(electronVersionExecution),
    outManifest: manifest
  }
}

function baseArtifact() {
  const identity = repositoryIdentity()
  return {
    recordedAt: new Date().toISOString(),
    baseline: identity,
    build: {
      type: 'local production Electron build',
      status: 'not-started',
      measurementCommand: ['node', harnessRelativePath, ...process.argv.slice(2)].join(' ')
    },
    runtime: {
      harnessNode: {
        execPath: process.execPath,
        versions: process.versions,
        platform: process.platform,
        arch: process.arch
      },
      launchedMainProcess: null,
      launchedRenderer: null
    },
    application: require(path.join(desktopRoot, 'package.json')).version,
    packageManager: require(path.resolve(desktopRoot, '../../package.json')).packageManager,
    operatingSystem: {
      type: os.type(),
      release: os.release(),
      version: os.version()
    },
    machine: {
      cpuModel: os.cpus()[0]?.model || null,
      physicalMemoryBytes: os.totalmem(),
      logicalProcessors: os.cpus().length
    },
    hypotheses: [
      {
        id: 'H1',
        prediction:
          'If Infinity viewport full DOM materialization dominates Source entry, changing viewportMargin to 10 in a CodeMirror init hook before the initial operation is committed will sharply reduce Source readiness, rendered nodes, memory growth, and wheel cost.'
      },
      {
        id: 'H2',
        prediction:
          'If Source change/cursorActivity full-text synchronization dominates first-input latency, removing those production event handlers before the first real keydown will sharply reduce keydown-to-change/visible time and input ScriptDuration.'
      },
      {
        id: 'H3',
        prediction:
          'If style/layout work dominates Source entry or input, DevTools LayoutDuration plus RecalcStyleDuration will exceed ScriptDuration in the matching bounded phase and scale materially from 10k to 50k.'
      },
      {
        id: 'H4',
        prediction:
          'If disk loading/Markdown parsing dominates total time-to-use, the pre-Source populated-WYSIWYG phase will account for most scale growth; otherwise a separately large Source-trigger phase proves a Source-local remediation boundary exists.'
      }
    ],
    measurementProtocol: {
      readiness:
        'Armed before Source activation. One total deadline starts immediately before the Source menu command and covers CodeMirror creation, focus/cursor preparation, first Playwright keydown, CodeMirror change-state observation, and visible first-line DOM mutation.',
      performanceAttribution:
        'Chromium DevTools Performance domain counters are differenced separately for Source entry and the first input. ScriptDuration, LayoutDuration, RecalcStyleDuration, TaskDuration, counts, and ThreadTime are retained.',
      optionalCpuProfile: cpuProfileEnabled
        ? 'Enabled: V8 CPU samples are aggregated by call frame in separate Source-entry and first-input windows.'
        : 'Disabled in the timing matrix to avoid profiler overhead; see the paired CPU-profile artifact.',
      finiteViewportIntervention:
        'Disposable trial-only CodeMirror init hook changes viewportMargin from Infinity to 10 before the constructor endOperation commits the initial display. No production source or saved preference is changed.',
      finiteViewportFixedHeightIntervention:
        'A separate trial holds finite viewportMargin constant and adds a trial-only fixed CodeMirror height before Source construction, changing viewport ownership relative to the finite-margin-only trial.',
      sourceSyncHandlerIntervention:
        'Disposable trial-only removal of CodeMirror change and cursorActivity listeners after Source mounts but before focus/cursor preparation and the first keydown. The measurement change listener is attached afterward.',
      wheel:
        'Eight real Playwright page.mouse.wheel inputs are dispatched over the Source container; renderer wheel trust, events, scroll movement, and timing are retained.',
      viewport:
        'Measured from each live renderer; no requested or assumed viewport size is reported.'
    },
    interactionCoverage: {
      wheel: 'Automated with Playwright page.mouse.wheel and renderer isTrusted capture.',
      physicalScrollbarThumb: {
        status: 'Unavailable / Pending manual',
        reason:
          'Protocol-generated pointer input cannot establish the behavior of a physical mouse grabbing the OS/Chromium scrollbar thumb on this host.',
        manualSteps: [
          'Run the production build and open each generated 10k and 50k fixture in a fresh profile.',
          'Enter Source mode and wait until the first typed character is visibly accepted.',
          'With a physical mouse, grab the Source vertical scrollbar thumb, drag to approximately 50%, then to the bottom, and back to the top.',
          'Record whether the thumb tracks continuously, whether content visibly follows, the longest apparent freeze, final reachability, and any crash or lost input.',
          'Repeat three times per scale and attach OS build, display scale, viewport, input device, and a timestamped screen recording.'
        ]
      }
    },
    fixtureDefinition:
      'UTF-8 LF; exactly N nonblank lines; every line 1 mod 100 is an ATX H1; remaining lines are unique fixed-shape plain text',
    isolation:
      'Every trial creates a unique OS-temporary root containing one unique fixture filename and one unique Electron profile; verified cleanup must finish before the next trial starts.',
    baselineRepetitions,
    interventionRepetitionsPerVariantPerScale: 1,
    requestedMaximumTrials: maxTrials,
    requestedVariant,
    requestedScale,
    profilePairRequested,
    cpuProfileEnabled,
    timeoutsMs,
    results: []
  }
}

function writeArtifact(artifact) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
}

function verifiedPoll(remainingPids = []) {
  return {
    checkedPids: [100, 101],
    elapsedMs: 0,
    queryCount: 1,
    querySuccessful: true,
    queryFailure: null,
    remainingPids,
    allExited: remainingPids.length === 0,
    timedOut: remainingPids.length > 0
  }
}

async function runCleanupSelfTests() {
  const successfulDiscovery = {
    method: 'self-test',
    successful: true,
    pids: [100, 101]
  }
  const commandFailure = {
    command: 'self-test-command',
    status: 1,
    signal: null,
    timedOut: false,
    error: null,
    stdout: '',
    stderr: 'injected failure'
  }
  const commandSuccess = { ...commandFailure, status: 0, stderr: '' }
  const cases = []

  if (process.platform === 'win32') {
    const liveDiscovery = windowsProcessTree(process.pid)
    assert.equal(liveDiscovery.successful, true)
    assert.equal(liveDiscovery.pids.includes(process.pid), true)
    const liveQuery = queryExistingPids([process.pid, 2_147_483_647])
    assert.equal(liveQuery.successful, true)
    assert.deepEqual(liveQuery.existingPids, [process.pid])
    cases.push('live Windows discovery and PID query distinguish present from absent processes')
  }

  const discoveryCommandFailure = windowsProcessTree(100, () => commandFailure)
  assert.equal(discoveryCommandFailure.successful, false)
  cases.push('process discovery command failure is fatal')

  const discoveryParseFailure = windowsProcessTree(100, () => ({
    ...commandSuccess,
    stdout: '{not-json'
  }))
  assert.equal(discoveryParseFailure.successful, false)
  cases.push('process discovery parse failure is fatal')

  const discoveryFailure = await closeAndVerifyProcessTree({ close: async () => {} }, 100, {
    platform: 'win32',
    windowsProcessTree: () => ({
      method: 'self-test',
      successful: false,
      failure: 'injected discovery failure',
      pids: []
    })
  })
  assert.equal(discoveryFailure.successful, false)
  cases.push('failed discovery cannot become successful cleanup')

  const queryFailure = await closeAndVerifyProcessTree({ close: async () => {} }, 100, {
    platform: 'win32',
    windowsProcessTree: () => successfulDiscovery,
    pollPidsGone: async () => ({
      ...verifiedPoll([]),
      querySuccessful: false,
      allExited: false,
      queryFailure: 'injected query failure'
    })
  })
  assert.equal(queryFailure.successful, false)
  cases.push('PID query failure is fatal')

  const killPolls = [verifiedPoll([100, 101]), verifiedPoll([100, 101]), verifiedPoll([])]
  const killFailure = await closeAndVerifyProcessTree({ close: async () => {} }, 100, {
    platform: 'win32',
    windowsProcessTree: () => successfulDiscovery,
    pollPidsGone: async () => killPolls.shift(),
    command: () => commandFailure
  })
  assert.equal(killFailure.afterForcedCleanup.allExited, true)
  assert.equal(killFailure.successful, false)
  cases.push('failed taskkill is fatal even when later verification finds no PIDs')

  const timeoutPolls = [verifiedPoll([100, 101]), verifiedPoll([100, 101]), verifiedPoll([101])]
  const exitTimeout = await closeAndVerifyProcessTree({ close: async () => {} }, 100, {
    platform: 'win32',
    windowsProcessTree: () => successfulDiscovery,
    pollPidsGone: async () => timeoutPolls.shift(),
    command: () => commandSuccess
  })
  assert.equal(exitTimeout.successful, false)
  cases.push('bounded exit verification timeout is fatal')

  const naturallyExited = await closeAndVerifyProcessTree(
    {
      close: async () => {
        throw new Error('application was already closed')
      }
    },
    100,
    {
      platform: 'win32',
      windowsProcessTree: () => successfulDiscovery,
      pollPidsGone: async () => verifiedPoll([]),
      command: () => {
        throw new Error('taskkill must not run for already-exited processes')
      }
    }
  )
  assert.equal(naturallyExited.successful, true)
  assert.equal(naturallyExited.courtesyClose.status, 'already-exited-during-close')
  cases.push('verified natural exit is accepted without taskkill')

  let pathCleanupCalls = 0
  const retained = await finalizeTrialCleanup(
    {
      app: { close: async () => {} },
      rootPid: 100,
      trialRoot: path.join(os.tmpdir(), 'self-test-retained-root'),
      profilePath: 'unused',
      fixturePath: 'unused'
    },
    {
      closeAndVerifyProcessTree: async () => ({ successful: false }),
      cleanupTrialPaths: async () => {
        pathCleanupCalls++
        return { successful: true }
      }
    }
  )
  assert.equal(pathCleanupCalls, 0)
  assert.equal(retained.cleanupSuccessful, false)
  assert.equal(
    retained.pathCleanup.status,
    'skipped-and-retained-because-process-cleanup-was-not-verified'
  )
  cases.push('failed process cleanup retains the trial root and aborts before the next trial')

  process.stdout.write(`${JSON.stringify({ status: 'passed', cases }, null, 2)}\n`)
}

async function main() {
  if (cleanupSelfTestRequested) {
    await runCleanupSelfTests()
    return
  }
  const artifact = baseArtifact()
  try {
    verifyRepositoryIdentity(artifact.baseline)
    artifact.build = {
      ...artifact.build,
      ...executeAndIdentifyBuild()
    }
    artifact.recordedAt = new Date().toISOString()
    writeArtifact(artifact)
    if (!artifact.build.successful) {
      throw new Error(
        `Build failed with status ${artifact.build.execution.status}: ${artifact.build.execution.stderr}`
      )
    }
    if (!artifact.build.electronVersionCommandSuccessful) {
      throw new Error('Built Electron runtime version command did not complete successfully')
    }

    let plans = trialPlans()
    if (profilePairRequested) {
      plans = plans.filter(
        (plan) =>
          plan.lineCount === 50_000 &&
          ((plan.variant === 'production-baseline' && plan.repetition === 1) ||
            plan.variant === 'finite-viewport-plus-fixed-height')
      )
    }
    if (requestedVariant !== null) {
      plans = plans.filter((plan) => plan.variant === requestedVariant)
    }
    if (requestedScale !== null) plans = plans.filter((plan) => plan.lineCount === requestedScale)
    if (maxTrials !== null) plans = plans.slice(0, maxTrials)
    for (const plan of plans) {
      const result = await runTrial(plan.lineCount, plan.repetition, plan.variant)
      artifact.results.push(result)
      if (!artifact.runtime.launchedMainProcess && result.launchedRuntime) {
        artifact.runtime.launchedMainProcess = result.launchedRuntime
        artifact.runtime.launchedRenderer = result.rendererRuntime
      }
      artifact.recordedAt = new Date().toISOString()
      writeArtifact(artifact)
      if (!result.cleanupSuccessful) {
        throw new Error(
          `Trial ${plan.lineCount}/${plan.variant}/${plan.repetition} cleanup failed; no next trial started`
        )
      }
    }
    artifact.runStatus = 'completed'
  } catch (error) {
    artifact.runStatus = 'aborted'
    artifact.runFailure = errorText(error)
    throw error
  } finally {
    artifact.recordedAt = new Date().toISOString()
    writeArtifact(artifact)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
