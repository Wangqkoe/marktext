const { app, BrowserWindow, screen, ipcMain } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { createGestureState } = require('./gesture-state.cjs')

const root = __dirname
const evidence = path.join(root, 'evidence')
fs.mkdirSync(evidence, { recursive: true })
const automated = process.argv.includes('--automated')
const tracePath = path.join(evidence, automated ? 'automated-windows-primary.jsonl' : 'manual-session.jsonl')
fs.writeFileSync(tracePath, '')

let source
let machine
let scenario = null
let sequence = 0
const entries = []
const assertions = []

function sourceBounds () {
  const dip = source.getBounds()
  const physical = screen.dipToScreenRect(source, dip)
  const display = screen.getDisplayMatching(dip)
  return {
    dip,
    physical,
    display: { id: display.id, scaleFactor: display.scaleFactor, bounds: display.bounds, workArea: display.workArea },
    units: { dip: 'Electron display-independent pixels', physical: 'Windows physical screen pixels (WH_MOUSE_LL MSLLHOOKSTRUCT.pt)' }
  }
}
function hitTestSnapshot (event) {
  const bounds = sourceBounds()
  const physical = bounds.physical
  return {
    eventPoint: { x: event.x, y: event.y, units: 'Windows physical screen pixels (WH_MOUSE_LL MSLLHOOKSTRUCT.pt)' },
    inside: event.x >= physical.x && event.y >= physical.y && event.x < physical.x + physical.width && event.y < physical.y + physical.height,
    sourceBounds: bounds
  }
}
function write (type, fields = {}) {
  const entry = { n: ++sequence, at: new Date().toISOString(), scenario, type, state: machine && machine.snapshot() && machine.snapshot().state, ...fields }
  entries.push(entry)
  fs.appendFileSync(tracePath, `${JSON.stringify(entry)}\n`)
  if (!source.isDestroyed()) source.webContents.send('gesture:event', entry)
  return entry
}
function startGesture (origin) {
  const session = machine.begin(origin)
  setTimeout(() => machine.timeout(session.id), 500)
}
function nativeEvent (event) {
  const nativeEventWithHitTest = event.type === 'native-move' || event.type === 'native-up'
    ? { ...event, hitTest: hitTestSnapshot(event) }
    : event
  write('native-event', { nativeEvent: nativeEventWithHitTest })
  machine.native(nativeEventWithHitTest)
}
function spawnHook () {
  const hookMilliseconds = automated ? 30000 : 600000
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'native-mouse-hook.ps1'), '-Milliseconds', String(hookMilliseconds)], { windowsHide: true })
  let resolveReady
  let rejectReady
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  child.stdout.setEncoding('utf8')
  let buffer = ''
  child.stdout.on('data', chunk => {
    buffer += chunk
    let end
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1)
      if (!line) continue
      try {
        const event = JSON.parse(line)
        if (event.type === 'native-ready') { write('hook-ready', { nativeSource: event }); resolveReady() } else nativeEvent(event)
      } catch { write('hook-non-json', { line }) }
    }
  })
  child.stderr.on('data', data => write('hook-stderr', { text: String(data) }))
  child.on('exit', (code, signal) => { write('hook-exit', { code, signal }); rejectReady(new Error(`native hook exited before ready (${code || signal})`)) })
  return { child, ready }
}
function runDriver (name) {
  return new Promise((resolve, reject) => {
    scenario = name
    source.focus()
    const b = sourceBounds().physical
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'drive-input.ps1'), '-Scenario', name, '-SourceX', String(b.x + 100), '-SourceY', String(b.y + 40), '-ExternalX', String(b.x - 80), '-ExternalY', String(b.y + 180)], { windowsHide: true })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', data => String(data).split(/\r?\n/).filter(Boolean).forEach(line => write('driver-output', { line })))
    child.stderr.on('data', data => write('driver-stderr', { text: String(data) }))
    child.on('error', reject)
    child.on('exit', code => code === 0 ? setTimeout(resolve, 250) : reject(new Error(`${name} driver exited ${code}`)))
    if (name === 'blur-reenter') setTimeout(() => machine.blur(), 650)
  })
}
function evaluateScenario (name) {
  const events = entries.filter(entry => entry.scenario === name)
  const commits = events.filter(entry => entry.type === 'DETACH_COMMIT')
  const result = { scenario: name, passed: commits.length > 0, commits: commits.length, status: 'Unavailable without a source-tab renderer mousedown and event-level native hook input' }
  assertions.push(result)
  write('scenario-observation', result)
}
async function runAutomated () {
  const hook = spawnHook()
  await hook.ready
  const display = screen.getPrimaryDisplay()
  write('environment', { platform: process.platform, electron: process.versions.electron, primaryDisplay: display, sourceBounds: sourceBounds(), tracePath })
  try {
    for (const name of ['boundary-reenter', 'blur-reenter', 'timeout-external-release', 'escape-external-release', 'external-release']) {
      await runDriver(name)
      evaluateScenario(name)
    }
    const summary = { generatedAt: new Date().toISOString(), platform: process.platform, electron: process.versions.electron, automatedInput: 'Win32 SendInput attempted; this controlled session did not expose a source-tab renderer event or event-level native mouse transition', primaryDisplay: display, sourceBounds: sourceBounds(), assertions, passed: false, status: 'Unavailable' }
    fs.writeFileSync(path.join(evidence, 'automated-windows-primary-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
    write('suite-observation', { status: summary.status })
    setTimeout(() => { hook.child.kill(); app.quit() }, 600)
  } catch (error) {
    write('suite-error', { message: error.message })
    hook.child.kill(); app.quit()
  }
}

app.whenReady().then(() => {
  source = new BrowserWindow({ x: 700, y: 300, width: 640, height: 420, show: false, webPreferences: { preload: path.join(root, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  machine = createGestureState({
    isInside: (x, y) => {
      const physical = sourceBounds().physical
      return x >= physical.x && y >= physical.y && x < physical.x + physical.width && y < physical.y + physical.height
    },
    emit: entry => write(entry.type, entry)
  })
  source.loadFile(path.join(root, 'index.html'))
  source.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'mouseDown' || input.type === 'mouseUp' || input.type === 'keyDown') write('electron-before-input', { inputType: input.type, key: input.key, button: input.button })
  })
  source.on('blur', () => machine.blur())
  ipcMain.on('gesture:begin', () => startGesture('renderer-source-tab-mousedown'))
  ipcMain.on('gesture:cancel', (_event, reason) => machine.cancel(reason))
  ipcMain.on('gesture:renderer-event', (_event, name) => write(name))
  source.once('ready-to-show', () => {
    source.show(); source.focus()
    if (automated) setTimeout(runAutomated, 650)
    else { spawnHook(); write('manual-ready', { sourceBounds: sourceBounds() }) }
  })
})

app.on('window-all-closed', () => app.quit())
