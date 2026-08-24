// Read-only, reproducible summarizer for the accepted Windows physical-input trace.
// It intentionally refuses a substituted, truncated, or reordered raw capture.
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const rawPath = process.argv[2]
if (!rawPath) throw new Error('Usage: node summarize-physical-trace.cjs <raw-manual-session.jsonl>')

const expectedRaw = {
  sha256: '373fc09c782b140ed3bea7a0f49bf182f0c1851150baaf80be0edbaf3bfbb49d',
  bytes: 3647637,
  lines: 4772
}

const raw = fs.readFileSync(rawPath)
const sha256 = crypto.createHash('sha256').update(raw).digest('hex')
const rawLines = raw.toString('utf8').split(/\r?\n/)
if (rawLines.at(-1) === '') rawLines.pop()
if (rawLines.length === 0 || rawLines.some(line => line === '')) throw new Error('Raw trace must be non-empty JSONL without blank records')
const entries = rawLines.map((line, index) => {
  try {
    return JSON.parse(line)
  } catch (error) {
    throw new Error(`Invalid JSON on raw line ${index + 1}: ${error.message}`)
  }
})
entries.forEach((entry, index) => {
  if (entry.n !== index + 1) throw new Error(`Raw n must be strictly continuous and unique: expected ${index + 1}, received ${entry.n}`)
})
for (const [key, value] of Object.entries(expectedRaw)) {
  const actual = key === 'sha256' ? sha256 : key === 'bytes' ? raw.length : entries.length
  if (actual !== value) throw new Error(`Unexpected raw ${key}: expected ${value}, received ${actual}`)
}

const count = predicate => entries.filter(predicate).length
const records = type => entries.filter(entry => entry.type === type)
const native = records('native-event').filter(entry => entry.nativeEvent)
const nativeByType = type => native.filter(entry => entry.nativeEvent.type === type)
const mouseTypes = new Set(['native-move', 'native-down', 'native-up'])
const nativeMouse = native.filter(entry => mouseTypes.has(entry.nativeEvent.type))
const assertCount = (label, actual, expected) => {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`)
}
const allPhysical = records => records.every(entry => entry.nativeEvent.injected === false)

assertCount('native mouse events', nativeMouse.length, 2679)
assertCount('native up events', nativeByType('native-up').length, 17)
if (!allPhysical(nativeMouse)) throw new Error('Accepted physical trace contains injected or unclassified mouse input')
if (!allPhysical(nativeByType('native-up'))) throw new Error('Accepted physical trace contains injected or unclassified native-up input')
assertCount('source gestures', records('source-tab-mousedown').length, 7)
assertCount('candidate arms', records('external-candidate-armed').length, 7)
assertCount('reentries', records('reentered-source').length, 2)
assertCount('commits', records('DETACH_COMMIT').length, 4)
assertCount('inside up no-detach', records('native-up-no-detach').length, 2)
assertCount('cancels', records('cancelled').length, 1)
assertCount('timeouts', records('timeout-observed-no-detach').length, 6)
assertCount('blurs', records('browser-window-blur-observed-no-detach').length, 3)
assertCount('hook exits', records('hook-exit').length, 0)

const first = type => {
  const record = records(type)[0]
  if (!record) throw new Error(`Expected ${type}`)
  return record
}
const source = id => entries.find(entry => entry.type === 'source-tab-mousedown' && entry.gestureId === id)
const gestureRecords = id => entries.filter(entry => entry.gestureId === id)
const gestureEvent = (id, type, occurrence = 0) => {
  const record = gestureRecords(id).filter(entry => entry.type === type)[occurrence]
  if (!record) throw new Error(`Expected ${type} for gesture ${id}`)
  return record
}
const reference = record => ({ n: record.n, at: record.at, type: record.type })
const sourceStart = id => reference(source(id))
const g7Blur = gestureEvent(7, 'browser-window-blur-observed-no-detach')
const g7Commit = gestureEvent(7, 'DETACH_COMMIT')
const g7BlurDelayMs = Date.parse(g7Commit.at) - Date.parse(g7Blur.at)
assertCount('G7 blur-to-up delay', g7BlurDelayMs, 2971)
const noActiveAfterEscape = entries.find(entry => entry.type === 'native-event-ignored-no-active-gesture' && entry.n === 3015)
if (!noActiveAfterEscape || noActiveAfterEscape.nativeEvent?.type !== 'native-up' || noActiveAfterEscape.nativeEvent?.injected !== false) {
  throw new Error('Expected trusted outside up to be ignored after G6 Escape cancellation')
}

const filteredTypes = new Set([
  'manual-ready', 'hook-ready', 'source-tab-mousedown', 'external-candidate-armed',
  'reentered-source', 'timeout-observed-no-detach', 'timeout-stale-ignored',
  'browser-window-blur-observed-no-detach', 'cancelled', 'native-up-no-detach', 'DETACH_COMMIT'
])
let activeGestureId = null
const filtered = []
for (const entry of entries) {
  if (entry.type === 'source-tab-mousedown') activeGestureId = entry.gestureId
  const nativeType = entry.nativeEvent?.type
  const keep = filteredTypes.has(entry.type) ||
    (entry.type === 'native-event' && ['native-up', 'native-escape'].includes(nativeType)) ||
    (entry.type === 'native-event-ignored-no-active-gesture' && nativeType === 'native-up')
  if (keep) {
    // Raw native events are emitted before the state machine attaches a gesture id.
    filtered.push(entry.type === 'native-event' && entry.gestureId === undefined
      ? { ...entry, gestureId: activeGestureId }
      : entry)
  }
  if (entry.type === 'cancelled' || entry.type === 'DETACH_COMMIT') activeGestureId = null
}
if (filtered.some(entry => entry.type === 'native-event' && entry.nativeEvent?.type === 'native-move')) {
  throw new Error('Filtered trace must not contain standalone pointer-move records')
}

const timeouts = records('timeout-observed-no-detach')
const activeTimeouts = timeouts.filter(entry => entry.state === 'external-candidate')
const sourcePressedTimeouts = timeouts.filter(entry => entry.state === 'source-pressed')
const blurs = records('browser-window-blur-observed-no-detach')
const activeBlurs = blurs.filter(entry => entry.state === 'external-candidate')
const passiveBlurs = blurs.filter(entry => entry.state !== 'external-candidate')
const manualReady = first('manual-ready')
const hookReady = first('hook-ready')

const summary = {
  schemaVersion: 1,
  verdict: 'Passed: Windows single-primary physical external release contract',
  raw: {
    path: path.resolve(rawPath),
    sha256,
    bytes: raw.length,
    lines: entries.length,
    nSequence: 'strictly continuous and unique 1..4772',
    timeRange: { start: entries[0].at, end: entries.at(-1).at },
    sourceBoundsAtManualReady: manualReady.sourceBounds
  },
  probe: {
    integrationCommit: 'a9b76808',
    hitTestSnapshotCommit: 'b49389dc',
    lifecycleCommit: 'a9b76808'
  },
  captureLifecycle: {
    manualReady: reference(manualReady),
    hookReady: reference(hookReady),
    mainProcess: 'explicitly terminated; capture frozen at final recorded event',
    hookExitObserved: false,
    shutdownInterpretation: 'not graceful: no hook-exit record exists in the frozen trace'
  },
  environment: {
    os: 'Windows 11',
    electron: '42.1.0',
    displays: 1,
    primaryDisplay: {
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      scaleFactor: 1,
      systemDpi: 96,
      units: 'Windows physical screen pixels for WH_MOUSE_LL; Electron DIP for BrowserWindow bounds'
    }
  },
  nativeInput: {
    eventSource: hookReady.nativeSource,
    mouse: { total: nativeMouse.length, injectedFalse: nativeMouse.filter(entry => entry.nativeEvent.injected === false).length, injectedTrue: 0 },
    byType: { move: nativeByType('native-move').length, down: nativeByType('native-down').length, up: nativeByType('native-up').length, escape: nativeByType('native-escape').length },
    up: { total: nativeByType('native-up').length, injectedFalse: nativeByType('native-up').filter(entry => entry.nativeEvent.injected === false).length, injectedTrue: 0 }
  },
  lifecycleCounts: {
    sourceGesture: records('source-tab-mousedown').length,
    candidate: records('external-candidate-armed').length,
    reentry: records('reentered-source').length,
    commit: records('DETACH_COMMIT').length,
    insideUpNoDetach: records('native-up-no-detach').length,
    cancel: records('cancelled').length,
    timeout: { total: timeouts.length, activeCandidate: activeTimeouts.length, observedBeforeCandidate: sourcePressedTimeouts.length },
    blur: { total: blurs.length, activeCandidate: activeBlurs.length, noActiveCandidate: passiveBlurs.length },
    replaced: records('gesture-replaced').length,
    ignored: { injected: records('native-injected-event-ignored').length, noActiveGesture: records('native-event-ignored-no-active-gesture').length }
  },
  gestureOutcomes: [
    { gestureId: 1, start: sourceStart(1), outcome: 'outside commit after active timeout', timeout: reference(gestureEvent(1, 'timeout-observed-no-detach')), commit: reference(gestureEvent(1, 'DETACH_COMMIT')) },
    { gestureId: 2, start: sourceStart(2), outcome: 'reenter then inside up: no detach', reentry: reference(gestureEvent(2, 'reentered-source')), insideUp: reference(gestureEvent(2, 'native-up-no-detach')) },
    { gestureId: 3, start: sourceStart(3), outcome: 're-enter, leave again, re-arm, then outside commit', reentry: reference(gestureEvent(3, 'reentered-source')), rearm: reference(gestureEvent(3, 'external-candidate-armed', 1)), commit: reference(gestureEvent(3, 'DETACH_COMMIT')) },
    { gestureId: 4, start: sourceStart(4), outcome: 'inside-only up: no detach', insideUp: reference(gestureEvent(4, 'native-up-no-detach')) },
    { gestureId: 5, start: sourceStart(5), outcome: 'outside commit after active timeout', timeout: reference(gestureEvent(5, 'timeout-observed-no-detach')), commit: reference(gestureEvent(5, 'DETACH_COMMIT')) },
    { gestureId: 6, start: sourceStart(6), outcome: 'Escape cancels; subsequent trusted outside up ignored with no active gesture', cancel: reference(gestureEvent(6, 'cancelled')), ignoredUp: reference(noActiveAfterEscape) },
    { gestureId: 7, start: sourceStart(7), outcome: 'active blur does not commit; trusted outside up commits after blur', blur: reference(g7Blur), blurToCommitMs: g7BlurDelayMs, commit: reference(g7Commit) }
  ],
  filtered: { path: 'manual-windows-primary-filtered.jsonl', lines: filtered.length, excludesPointerMoves: true }
}

const evidenceDir = path.join(__dirname, 'evidence')
fs.mkdirSync(evidenceDir, { recursive: true })
fs.writeFileSync(path.join(evidenceDir, 'manual-windows-primary-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
fs.writeFileSync(path.join(evidenceDir, 'manual-windows-primary-filtered.jsonl'), `${filtered.map(entry => JSON.stringify(entry)).join('\n')}\n`)
console.log(JSON.stringify(summary, null, 2))
