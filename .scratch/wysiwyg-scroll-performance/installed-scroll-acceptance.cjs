'use strict'

const { _electron } = require('playwright')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const REQUIRED_SOURCE_SHA = 'ef5a10d062098baacdc39f278e5ab361691a0904'
const repositoryRoot = path.resolve(__dirname, '../..')
const harnessPath = path.resolve(__filename)
const fixturePath = path.join(
  repositoryRoot,
  'packages/desktop/test/e2e/data/wysiwyg-scroll-400-headings.md'
)

const requiredEnv = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return path.resolve(value)
}

const installedExecutable = requiredEnv('T05_INSTALLED_EXE')
const buildConfigPath = requiredEnv('T05_BUILD_CONFIG')
const profileRoot = requiredEnv('T05_PROFILE_ROOT')
const outputPath = requiredEnv('T05_OUTPUT')
const runCount = Number(process.env.T05_RUNS || 3)

const run = (file, args, options = {}) =>
  execFileSync(file, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
    ...options
  }).trim()

const sha256 = (file) => {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

const percentile = (values, fraction) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const summarizeGaps = (gaps) => ({
  count: gaps.length,
  medianMs: percentile(gaps, 0.5),
  p95Ms: percentile(gaps, 0.95),
  maximumMs: gaps.length ? Math.max(...gaps) : null,
  over50MsCount: gaps.filter((gap) => gap > 50).length,
  over50MsProportion: gaps.length ? gaps.filter((gap) => gap > 50).length / gaps.length : null
})

const gitIdentity = () => {
  const head = run('git', ['rev-parse', 'HEAD'])
  const branch = run('git', ['branch', '--show-current'])
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=all'])
  const harnessCommit = run('git', ['log', '-1', '--format=%H', '--', harnessPath])
  if (head !== REQUIRED_SOURCE_SHA && head !== harnessCommit) {
    throw new Error(`unexpected measured HEAD ${head}`)
  }
  if (dirty) throw new Error(`measurement requires a clean worktree:\n${dirty}`)
  if (harnessCommit !== head) {
    throw new Error(`harness must be committed at measured HEAD (harness=${harnessCommit}, HEAD=${head})`)
  }
  const productionDiffStatus = (() => {
    try {
      execFileSync(
        'git',
        [
          'diff',
          '--quiet',
          REQUIRED_SOURCE_SHA,
          '--',
          'packages',
          'scripts',
          'package.json',
          'pnpm-lock.yaml',
          'pnpm-workspace.yaml',
          'eslint.config.js'
        ],
        { cwd: repositoryRoot, windowsHide: true }
      )
      return 0
    } catch (error) {
      return typeof error.status === 'number' ? error.status : -1
    }
  })()
  if (productionDiffStatus !== 0) {
    throw new Error(`production inputs differ from ${REQUIRED_SOURCE_SHA}`)
  }
  return { head, branch, harnessCommit, productionDiffStatus }
}

const clickMenu = (app, id) =>
  app.evaluate(({ Menu, BrowserWindow }, menuId) => {
    const menu = Menu.getApplicationMenu()
    const item = menu?.getMenuItemById(menuId)
    if (!item) throw new Error(`menu item unavailable: ${menuId}`)
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (item.type === 'checkbox') item.checked = !item.checked
    item.click(undefined, win, win?.webContents)
  }, id)

const workspaceSnapshot = (page) =>
  page.evaluate(() => {
    const driver = window
    const snapshot = driver.__mtWorkspaceSnapshot?.()
    if (!snapshot) throw new Error('workspace snapshot driver unavailable')
    const pane = snapshot.projection.panes.find(
      (candidate) => candidate.paneId === snapshot.projection.focusedPaneId
    )
    const document = snapshot.documents.find((candidate) => candidate.viewId === pane?.activeViewId)
    if (!document) throw new Error('active workspace document unavailable')
    return {
      revision: snapshot.projection.workspaceRevision,
      scrollTop: document.scrollTop,
      mode: document.mode,
      tocCount: document.listToc?.length ?? null
    }
  })

const collectRaf = (page, durationMs) =>
  page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const gaps = []
        let previous
        const started = performance.now()
        const tick = (now) => {
          if (previous !== undefined) gaps.push(now - previous)
          previous = now
          if (now - started >= duration) resolve(gaps)
          else window.requestAnimationFrame(tick)
        }
        window.requestAnimationFrame(tick)
      }),
    durationMs
  )

const startFrameAndInputProbe = (page, selector) =>
  page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector)
    if (!(target instanceof window.HTMLElement)) throw new Error(`missing probe target ${targetSelector}`)
    const probe = {
      active: true,
      startedAt: performance.now(),
      previousFrameAt: undefined,
      gaps: [],
      wheel: [],
      scroll: [],
      initialScrollTop: target.scrollTop
    }
    const frame = (now) => {
      if (!probe.active) return
      if (probe.previousFrameAt !== undefined) probe.gaps.push(now - probe.previousFrameAt)
      probe.previousFrameAt = now
      window.requestAnimationFrame(frame)
    }
    target.addEventListener(
      'wheel',
      (event) => probe.wheel.push({ at: performance.now(), trusted: event.isTrusted, deltaY: event.deltaY }),
      { passive: true }
    )
    target.addEventListener(
      'scroll',
      () => probe.scroll.push({ at: performance.now(), scrollTop: target.scrollTop }),
      { passive: true }
    )
    window.__t05Probe = probe
    window.requestAnimationFrame(frame)
  }, selector)

const stopFrameAndInputProbe = (page, selector) =>
  page.evaluate((targetSelector) => {
    const probe = window.__t05Probe
    const target = document.querySelector(targetSelector)
    if (!probe || !(target instanceof window.HTMLElement)) throw new Error('probe unavailable')
    probe.active = false
    return {
      durationMs: performance.now() - probe.startedAt,
      gaps: probe.gaps,
      wheel: probe.wheel,
      scroll: probe.scroll,
      initialScrollTop: probe.initialScrollTop,
      finalScrollTop: target.scrollTop,
      maximumScrollTop: target.scrollHeight - target.clientHeight,
      geometry: {
        clientWidth: target.clientWidth,
        clientHeight: target.clientHeight,
        scrollWidth: target.scrollWidth,
        scrollHeight: target.scrollHeight
      }
    }
  }, selector)

const installedTreePids = () => {
  const escaped = installedExecutable.replace(/'/g, "''")
  const script = [
    `$root=(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${escaped}' } | Select-Object -ExpandProperty ProcessId)`,
    '$all=@($root)',
    'do { $before=$all.Count; $children=Get-CimInstance Win32_Process | Where-Object { $all -contains $_.ParentProcessId } | Select-Object -ExpandProperty ProcessId; $all=@($all+$children | Sort-Object -Unique) } while($all.Count -gt $before)',
    '$all | ConvertTo-Json -Compress'
  ].join('; ')
  const value = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
  if (!value) return []
  const parsed = JSON.parse(value)
  return Array.isArray(parsed) ? parsed : [parsed]
}

const closeAndVerify = async (app) => {
  const before = installedTreePids()
  await app.close()
  const deadline = Date.now() + 15000
  let remaining = installedTreePids().filter((pid) => before.includes(pid))
  while (remaining.length && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    remaining = installedTreePids().filter((pid) => before.includes(pid))
  }
  if (remaining.length) throw new Error(`installed Electron processes remained after close: ${remaining}`)
  return { status: 'Passed', discoveredPids: before, remainingPids: [] }
}

const launchInstalled = async (profile, fixture = fixturePath) => {
  fs.mkdirSync(profile, { recursive: true })
  const app = await _electron.launch({
    executablePath: installedExecutable,
    args: ['--user-data-dir', profile, fixture],
    cwd: path.dirname(installedExecutable),
    timeout: 45000
  })
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setBounds({ x: 40, y: 40, width: 1280, height: 720 })
  })
  await page.waitForSelector('.editor-component', { state: 'attached', timeout: 30000 })
  await page.waitForFunction(() => document.querySelector('.editor-component')?.children.length > 0)
  return { app, page }
}

const measureWysiwyg = async (index) => {
  const profile = path.join(profileRoot, `automated-wysiwyg-run-${index}`)
  const { app, page } = await launchInstalled(profile)
  try {
    await clickMenu(app, 'tocMenuItem')
    await page.waitForSelector('.side-bar-toc .el-tree-node', { state: 'visible', timeout: 15000 })
    const runtime = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      return {
        appVersion: electronApp.getVersion(),
        isPackaged: electronApp.isPackaged,
        execPath: process.execPath,
        userData: electronApp.getPath('userData'),
        versions: { ...process.versions },
        windowBounds: win.getBounds()
      }
    })
    const viewport = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      visualViewport: window.visualViewport
        ? { width: window.visualViewport.width, height: window.visualViewport.height, scale: window.visualViewport.scale }
        : null
    }))
    const idleGaps = await collectRaf(page, 1200)
    await page.evaluate(() => {
      const container = document.querySelector('.editor-component')
      if (!(container instanceof window.HTMLElement)) throw new Error('WYSIWYG unavailable')
      container.scrollTop = 0
      container.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(250)
    const before = await workspaceSnapshot(page)
    await page.evaluate(() => {
      const outline = document.querySelector('.side-bar-toc .el-tree-node')
      if (!(outline instanceof window.HTMLElement)) throw new Error('Outline node unavailable')
      outline.dataset.t05Identity = 'retained'
    })
    await startFrameAndInputProbe(page, '.editor-component')
    await page.locator('.editor-component').hover()
    for (let pulse = 0; pulse < 80; pulse += 1) {
      await page.mouse.wheel(0, 300)
      await page.waitForTimeout(8)
    }
    const during = await workspaceSnapshot(page)
    const outlineRetainedDuring = await page.evaluate(
      () => document.querySelector('[data-t05-identity="retained"]')?.isConnected === true
    )
    await page.waitForTimeout(250)
    const final = await workspaceSnapshot(page)
    const probe = await stopFrameAndInputProbe(page, '.editor-component')
    const outlineRetainedFinal = await page.evaluate(
      () => document.querySelector('[data-t05-identity="retained"]')?.isConnected === true
    )
    const firstWheelAt = probe.wheel[0]?.at ?? null
    const firstMoved = probe.scroll.find((entry) => entry.scrollTop !== probe.initialScrollTop)
    const checks = {
      trustedWheel: probe.wheel.length === 80 && probe.wheel.every((entry) => entry.trusted),
      moved: probe.finalScrollTop > probe.initialScrollTop,
      noProjectionDuringBurst: during.revision === before.revision && during.scrollTop === before.scrollTop,
      outlineStableDuringBurst: outlineRetainedDuring,
      finalConvergence: final.scrollTop === probe.finalScrollTop,
      exactlyOneFinalProjection: final.revision - before.revision === 1,
      outlineStableAfterConvergence: outlineRetainedFinal
    }
    if (Object.values(checks).some((value) => !value)) {
      throw new Error(`WYSIWYG gate failed: ${JSON.stringify(checks)}`)
    }
    return {
      index,
      profile,
      runtime,
      viewport,
      inputSemantics: 'Playwright page.mouse.wheel -> trusted Chromium wheel event; automated protocol, not physical mouse/touchpad',
      pulseCount: 80,
      pulseDeltaY: 300,
      idle: { rawFrameGapsMs: idleGaps, summary: summarizeGaps(idleGaps) },
      active: {
        rawFrameGapsMs: probe.gaps,
        summary: summarizeGaps(probe.gaps),
        rawWheelEvents: probe.wheel,
        rawScrollEvents: probe.scroll,
        firstInputToMovementMs: firstWheelAt !== null && firstMoved ? firstMoved.at - firstWheelAt : null,
        startScrollTop: probe.initialScrollTop,
        responseScrollTop: firstMoved?.scrollTop ?? null,
        finalScrollTop: probe.finalScrollTop,
        maximumScrollTop: probe.maximumScrollTop,
        geometry: probe.geometry
      },
      snapshots: { before, during, final },
      checks
    }
  } finally {
    await closeAndVerify(app)
  }
}

const measureSelectorWheel = async (page, name, selector, pulses = 20, deltaY = 240) => {
  const count = await page.locator(selector).count()
  if (!count) return { name, outcome: 'Unavailable', limitation: `selector unavailable: ${selector}` }
  const scrollable = await page.locator(selector).first().evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }))
  const axis = scrollable.scrollHeight > scrollable.clientHeight ? 'vertical' : scrollable.scrollWidth > scrollable.clientWidth ? 'horizontal' : null
  if (!axis) return { name, outcome: 'Unavailable', limitation: 'surface did not overflow under the installed fixture', geometry: scrollable }
  await page.locator(selector).first().hover()
  await startFrameAndInputProbe(page, selector)
  for (let index = 0; index < pulses; index += 1) {
    await page.mouse.wheel(axis === 'vertical' ? 0 : deltaY, axis === 'vertical' ? deltaY : 0)
    await page.waitForTimeout(8)
  }
  await page.waitForTimeout(100)
  const probe = await stopFrameAndInputProbe(page, selector)
  const moved = axis === 'vertical' ? probe.finalScrollTop !== probe.initialScrollTop : scrollable.scrollWidth > scrollable.clientWidth
  return {
    name,
    outcome: moved ? 'Passed' : 'Failed',
    fixture: '400-heading installed-build document',
    inputSemantics: 'Playwright page.mouse.wheel trusted Chromium protocol; not physical input',
    cadence: summarizeGaps(probe.gaps),
    rawFrameGapsMs: probe.gaps,
    responseLatencyMs: probe.wheel[0] && probe.scroll[0] ? probe.scroll[0].at - probe.wheel[0].at : null,
    axis,
    geometry: probe.geometry,
    limitations: axis === 'horizontal' ? 'horizontal movement inferred from overflow; scrollLeft is not captured by the generic vertical probe' : null
  }
}

const measureMatrix = async () => {
  const profile = path.join(profileRoot, 'automated-matrix')
  const { app, page } = await launchInstalled(profile)
  try {
    const entries = []
    await clickMenu(app, 'tocMenuItem')
    await page.waitForSelector('.side-bar-toc .el-tree-node', { state: 'visible', timeout: 15000 })
    entries.push(await measureSelectorWheel(page, 'Outline', '.side-bar-toc .el-scrollbar__wrap'))

    await clickMenu(app, 'sourceCodeModeMenuItem')
    await page.waitForSelector('.source-code .CodeMirror', { state: 'attached', timeout: 30000 })
    entries.push(await measureSelectorWheel(page, 'Source', '.source-code'))
    await clickMenu(app, 'sourceCodeModeMenuItem')
    await page.waitForSelector('.editor-component', { state: 'attached', timeout: 30000 })

    await app.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0].webContents.send(payload)
    }, 'mt::show-command-palette')
    await page.waitForSelector('.command-palette input.search', { state: 'visible', timeout: 10000 })
    entries.push(await measureSelectorWheel(page, 'Command palette', '.command-palette ul.commands'))
    await page.keyboard.press('Escape')

    const beforeSearch = await workspaceSnapshot(page)
    await app.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0].webContents.send(payload.channel, ...payload.args)
    }, { channel: 'mt::editor-edit-action', args: ['find'] })
    await page.waitForSelector('.search-bar input', { state: 'visible', timeout: 10000 })
    await page.locator('.search-bar input').fill('Heading 250')
    const searchStarted = Date.now()
    await page.waitForFunction(() => document.querySelector('.editor-component')?.scrollTop > 0)
    await page.waitForTimeout(400)
    const afterSearch = await workspaceSnapshot(page)
    entries.push({
      name: 'Search',
      outcome: afterSearch.scrollTop > 0 && afterSearch.revision - beforeSearch.revision === 1 ? 'Passed' : 'Failed',
      fixture: 'one exact heading match in 400-heading installed fixture',
      inputSemantics: 'Playwright text fill invokes production Search navigation; programmatic destination, not wheel/physical input',
      responseLatencyMs: Date.now() - searchStarted,
      finalConvergence: afterSearch,
      limitations: 'end-to-end elapsed includes polling and animation completion; raw rAF gaps not sampled in this matrix entry'
    })
    await page.keyboard.press('Escape')

    const staticEntries = [
      ['WYSIWYG', 'Covered by three-run installed benchmark and deterministic gate'],
      ['Files / Folder tree', 'No Folder root corpus is attached by the 400-heading fixture'],
      ['Preferences', 'Opens a separate window; automated scroll sampling not implemented in phase 1'],
      ['Opened Files', 'One-document fixture does not overflow; link T07 exact 20/100/150 settled evidence'],
      ['Tab-strip horizontal', 'One-document fixture does not overflow'],
      ['Image-viewer zoom', '400-heading fixture contains no image; physical/gesture zoom remains Pending'],
      ['Other scrollable popup', 'No representative overflowing popup was opened beyond command palette']
    ]
    for (const [name, limitation] of staticEntries) {
      entries.push({ name, outcome: name === 'WYSIWYG' ? 'Passed' : 'Untested', limitation })
    }
    return { profile, entries }
  } finally {
    await closeAndVerify(app)
  }
}

const main = async () => {
  if (!fs.existsSync(installedExecutable)) throw new Error(`installed executable missing: ${installedExecutable}`)
  if (!fs.existsSync(fixturePath)) throw new Error(`fixture missing: ${fixturePath}`)
  fs.mkdirSync(profileRoot, { recursive: true })
  const identity = gitIdentity()
  const results = []
  for (let index = 1; index <= runCount; index += 1) {
    console.log(`T05 installed WYSIWYG run ${index}/${runCount}`)
    results.push(await measureWysiwyg(index))
  }
  const proportions = results.map((result) => result.active.summary.over50MsProportion)
  const medianProportion = percentile(proportions, 0.5)
  const matrix = await measureMatrix()
  const output = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    execution: { status: medianProportion <= 0.05 ? 'Passed' : 'Failed', exitCode: medianProportion <= 0.05 ? 0 : 1 },
    identity: {
      ...identity,
      requiredSourceSha: REQUIRED_SOURCE_SHA,
      harnessPath,
      harnessSha256: sha256(harnessPath),
      buildConfigPath,
      buildConfigSha256: sha256(buildConfigPath),
      fixturePath,
      fixtureSha256: sha256(fixturePath),
      installedExecutable,
      installedExecutableSha256: sha256(installedExecutable)
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      version: os.version(),
      cpu: os.cpus()[0]?.model,
      logicalProcessors: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      harnessNode: process.version
    },
    acceptance: {
      threshold: 'median of three per-run proportions of requestAnimationFrame gaps >50 ms <= 5%',
      perRunProportions: proportions,
      medianProportion,
      outcome: medianProportion <= 0.05 ? 'Passed' : 'Failed'
    },
    runs: results,
    matrix,
    physicalAcceptance: {
      status: 'Pending',
      items: ['physical mouse wheel', 'physical touchpad if available', 'physical scrollbar thumb', 'switch/split/move/close/global interaction'],
      note: 'Automated Playwright protocol is not classified as physical input.'
    },
    crossPlatform: { windows: 'Measured', linux: 'Untested', macOS: 'Untested' },
    independentInvestigations: {
      source: 'T06: 50k Source remains P1/high; 10k Source P2/moderate',
      openedFiles: 'T07: P2/medium scale pressure plus startup delivery race'
    }
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n')
  console.log(JSON.stringify({ outputPath, acceptance: output.acceptance, matrix: matrix.entries }, null, 2))
  process.exitCode = output.execution.exitCode
}

main().catch((error) => {
  console.error(error?.stack || error)
  process.exitCode = 1
})
