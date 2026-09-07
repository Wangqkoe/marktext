const { _electron } = require('playwright')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const desktopRoot = path.resolve(__dirname, '../../packages/desktop')
const electronPath =
  process.platform === 'win32'
    ? path.join(desktopRoot, 'node_modules/.bin/electron.cmd')
    : path.join(desktopRoot, 'node_modules/electron/dist/electron')
const outputPath = path.resolve(__dirname, 'evidence/06-source-large-document-capacity.raw.json')
const scales = [10_000, 50_000]
const repetitions = 3

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

async function bounded(label, milliseconds, action) {
  let timer
  try {
    return await Promise.race([
      action(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded ${milliseconds} ms`)),
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
      clientHeight: container ? container.clientHeight : null,
      viewportMargin: cm
        ? Number.isFinite(cm.getOption('viewportMargin'))
          ? cm.getOption('viewportMargin')
          : String(cm.getOption('viewportMargin'))
        : null
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
      samples: gaps.length,
      medianMs: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: Math.max(...gaps),
      over50ms: gaps.filter((gap) => gap > 50).length
    }
  }, durationMs)
}

async function scrollProbe(page) {
  return await page.evaluate(async () => {
    const container = document.querySelector('.source-code')
    if (!container) throw new Error('Source scroll container unavailable')
    container.scrollTop = 0
    const gaps = []
    const positions = []
    let prior = performance.now()
    const start = prior
    await new Promise((resolve) => {
      let frameNumber = 0
      const frame = (now) => {
        gaps.push(now - prior)
        prior = now
        frameNumber += 1
        container.scrollTop = (container.scrollHeight - container.clientHeight) * (frameNumber / 60)
        positions.push(container.scrollTop)
        if (frameNumber >= 60) resolve()
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    const sorted = gaps.slice().sort((a, b) => a - b)
    return {
      elapsedMs: performance.now() - start,
      samples: gaps.length,
      medianGapMs: sorted[Math.floor(sorted.length / 2)],
      p95GapMs: sorted[Math.floor(sorted.length * 0.95)],
      maxGapMs: Math.max(...gaps),
      over50ms: gaps.filter((gap) => gap > 50).length,
      finalScrollTop: positions.at(-1),
      movedFrames: positions.filter((value, index) => index === 0 || value !== positions[index - 1])
        .length
    }
  })
}

async function inputProbe(page, marker) {
  await page.evaluate(() => {
    const cmNode = document.querySelector('.source-code .CodeMirror')
    const cm = cmNode && cmNode.CodeMirror
    if (!cm) throw new Error('CodeMirror unavailable')
    cm.focus()
    cm.setCursor({ line: 0, ch: 0 })
  })
  const start = performance.now()
  await page.keyboard.insertText(marker)
  await page.waitForFunction(
    (value) => {
      const cmNode = document.querySelector('.source-code .CodeMirror')
      const cm = cmNode && cmNode.CodeMirror
      const firstLine = document.querySelector('.source-code .CodeMirror-line')
      return (
        !!cm && cm.getValue().startsWith(value) && (firstLine?.textContent || '').startsWith(value)
      )
    },
    marker,
    { timeout: 15_000 }
  )
  return performance.now() - start
}

async function runOne(lineCount, repetition, fixturePath) {
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), `marktext-source-capacity-${lineCount}-${repetition}-`)
  )
  let app
  const result = { lineCount, repetition, profileIsolation: path.basename(profile) }
  const launchStarted = performance.now()
  try {
    app = await bounded('Electron launch', 45_000, () =>
      _electron.launch({
        executablePath: electronPath,
        args: [desktopRoot, '--user-data-dir', profile, fixturePath],
        cwd: desktopRoot,
        env: { ...process.env, PERF_TESTING: 'true', MARKTEXT_ERROR_INTERACTION: '1' },
        timeout: 40_000
      })
    )
    const page = await bounded('first window', 20_000, () => app.firstWindow())
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.editor-component', { state: 'attached', timeout: 45_000 })
    await page.waitForFunction(
      () => {
        const editor = document.querySelector('.editor-component')
        return !!editor && editor.children.length > 0
      },
      null,
      { timeout: 45_000 }
    )
    result.openReadyMs = performance.now() - launchStarted
    result.preSourceCadence = await bounded('pre-source cadence', 5_000, () => cadence(page))
    result.preSourceMetrics = await appMetrics(app)

    const sourceStarted = performance.now()
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById('sourceCodeModeMenuItem')
      if (!item) throw new Error('Source menu item unavailable')
      item.checked = !item.checked
      const win = BrowserWindow.getAllWindows()[0]
      item.click(undefined, win, win.webContents)
    })
    await page.waitForFunction(
      () => {
        const cmNode = document.querySelector('.source-code .CodeMirror')
        return !!cmNode && !!cmNode.CodeMirror
      },
      null,
      { timeout: 120_000 }
    )
    result.sourceEntryMs = performance.now() - sourceStarted
    result.baselineMaterialization = await materialization(page)
    result.baselineMetrics = await appMetrics(app)
    result.sourceIdleCadence = await bounded('source cadence', 8_000, () => cadence(page))
    result.baselineInputVisibleMs = await bounded('baseline input', 20_000, () =>
      inputProbe(page, `Z${repetition}`)
    )
    result.baselineScroll = await bounded('baseline scroll probe', 30_000, () => scrollProbe(page))

    const interventionStarted = performance.now()
    await page.evaluate(() => {
      const cmNode = document.querySelector('.source-code .CodeMirror')
      const cm = cmNode && cmNode.CodeMirror
      if (!cm) throw new Error('CodeMirror unavailable for intervention')
      cm.setOption('viewportMargin', 10)
      cm.refresh()
    })
    await page.waitForTimeout(500)
    result.viewportInterventionMs = performance.now() - interventionStarted
    result.finiteViewportMaterialization = await materialization(page)
    result.finiteViewportMetrics = await appMetrics(app)
    result.finiteViewportInputVisibleMs = await bounded('finite viewport input', 20_000, () =>
      inputProbe(page, `Y${repetition}`)
    )
    result.finiteViewportScroll = await bounded('finite viewport scroll probe', 30_000, () =>
      scrollProbe(page)
    )
    result.status = 'completed'
  } catch (error) {
    result.status = 'capacity-limit'
    result.failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    result.elapsedAtFailureMs = performance.now() - launchStarted
  } finally {
    if (app) {
      try {
        await bounded('Electron close', 15_000, () => app.close())
      } catch (error) {
        result.forcedProcessTreeCleanup = error instanceof Error ? error.message : String(error)
        if (process.platform === 'win32') {
          spawnSync('taskkill.exe', ['/PID', String(app.process().pid), '/T', '/F'], {
            windowsHide: true,
            timeout: 15_000
          })
        } else {
          try {
            app.process().kill('SIGKILL')
          } catch {}
        }
      }
    }
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    } catch (error) {
      result.profileCleanupFailure =
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  return result
}

async function main() {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-source-capacity-fixtures-'))
  const fixtures = []
  const results = []
  try {
    for (const lineCount of scales) {
      const contents = fixture(lineCount)
      const fixturePath = path.join(fixtureDir, `source-${lineCount}.md`)
      fs.writeFileSync(fixturePath, contents, 'utf8')
      fixtures.push({
        lineCount,
        bytes: Buffer.byteLength(contents),
        headings: Math.ceil(lineCount / 100),
        bodyLines: lineCount - Math.ceil(lineCount / 100),
        sha256: require('node:crypto').createHash('sha256').update(contents).digest('hex')
      })
      for (let repetition = 1; repetition <= repetitions; repetition++) {
        results.push(await runOne(lineCount, repetition, fixturePath))
      }
    }
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
  const artifact = {
    recordedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    electron: require(path.join(desktopRoot, 'node_modules/electron/package.json')).version,
    viewport: { width: 1280, height: 720 },
    fixtureDefinition:
      'UTF-8 LF; exactly N nonblank lines; every line 1 mod 100 is an ATX H1; remaining lines are unique fixed-shape plain text',
    repetitions,
    timeoutsMs: {
      launch: 45000,
      editorReady: 45000,
      sourceEntry: 120000,
      input: 20000,
      scroll: 30000
    },
    fixtures,
    results
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
  process.stdout.write(`Wrote ${outputPath}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
