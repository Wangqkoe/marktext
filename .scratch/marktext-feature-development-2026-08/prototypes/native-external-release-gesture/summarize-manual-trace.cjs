// Read-only summarizer for an external manual-session trace. It never rewrites raw input.
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const rawPath = process.argv[2]
if (!rawPath) throw new Error('Usage: node summarize-manual-trace.cjs <raw-manual-session.jsonl>')

const raw = fs.readFileSync(rawPath)
const lines = raw.toString('utf8').split(/\r?\n/).filter(Boolean)
const entries = lines.map((line, index) => {
  try { return JSON.parse(line) } catch (error) { throw new Error(`Invalid JSON on raw line ${index + 1}: ${error.message}`) }
})
if (entries.length === 0) throw new Error('Raw trace has no JSONL entries')

const count = predicate => entries.filter(predicate).length
const native = entries.filter(entry => entry.type === 'native-event' && entry.nativeEvent)
const nativeCount = (type, injected) => native.filter(entry => entry.nativeEvent.type === type && (injected === undefined || entry.nativeEvent.injected === injected)).length
const mouseTypes = new Set(['native-move', 'native-down', 'native-up'])
const nativeMouse = native.filter(entry => mouseTypes.has(entry.nativeEvent.type))
const trust = records => ({
  total: records.length,
  trusted: records.filter(entry => entry.nativeEvent.injected === false).length,
  injected: records.filter(entry => entry.nativeEvent.injected === true).length,
  missingTrustFlag: records.filter(entry => entry.nativeEvent.injected !== false && entry.nativeEvent.injected !== true).length
})
const sourceBounds = entries.find(entry => entry.type === 'manual-ready')?.sourceBounds || null
const sourceGestures = count(entry => entry.type === 'source-tab-mousedown')
const trustedRendererSourceGestures = count(entry => entry.type === 'renderer-mousedown trusted=true')
const verdict = trust(nativeMouse).total > 0 && trust(nativeMouse).total === trust(nativeMouse).injected
  ? 'Unavailable: human-operated session arrived entirely as injected input'
  : 'Review required: manual session includes non-injected or unclassified mouse input'

const filteredTypes = new Set([
  'manual-ready', 'hook-ready', 'source-tab-mousedown', 'gesture-replaced',
  'timeout-observed-no-detach', 'timeout-stale-ignored', 'cancelled',
  'external-candidate-armed', 'reentered-source', 'DETACH_COMMIT'
])
let currentGestureId = null
const filtered = []
for (const entry of entries) {
  if (entry.type === 'source-tab-mousedown') currentGestureId = entry.gestureId
  const keep = filteredTypes.has(entry.type) || (entry.type === 'native-event' && ['native-down', 'native-up', 'native-escape'].includes(entry.nativeEvent?.type))
  if (keep) {
    const nativeAuditEntry = entry.type === 'native-event' && entry.gestureId === undefined
      ? { ...entry, gestureId: currentGestureId }
      : entry
    filtered.push(nativeAuditEntry)
  }
  if (entry.type === 'cancelled' || entry.type === 'DETACH_COMMIT') currentGestureId = null
}

const summary = {
  schemaVersion: 1,
  raw: {
    path: path.resolve(rawPath),
    sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    bytes: raw.length,
    lines: entries.length,
    timeRange: { start: entries[0].at, end: entries.at(-1).at },
    sourceBounds
  },
  sourceGesture: {
    sourceTabMousedown: sourceGestures,
    rendererMousedownMarkedTrusted: trustedRendererSourceGestures,
    note: 'Renderer isTrusted does not override the native injected-input trust gate.'
  },
  native: {
    mouse: trust(nativeMouse),
    up: trust(native.filter(entry => entry.nativeEvent.type === 'native-up')),
    down: trust(native.filter(entry => entry.nativeEvent.type === 'native-down')),
    escape: trust(native.filter(entry => entry.nativeEvent.type === 'native-escape')),
    byType: {
      move: nativeCount('native-move'),
      down: nativeCount('native-down'),
      up: nativeCount('native-up'),
      escape: nativeCount('native-escape')
    }
  },
  lifecycleCounts: {
    candidate: count(entry => entry.type === 'external-candidate-armed'),
    reentry: count(entry => entry.type === 'reentered-source'),
    commit: count(entry => entry.type === 'DETACH_COMMIT'),
    timeout: count(entry => entry.type === 'timeout-observed-no-detach' || entry.type === 'timeout-stale-ignored'),
    replaced: count(entry => entry.type === 'gesture-replaced'),
    cancel: count(entry => entry.type === 'cancelled'),
    ignored: {
      injected: count(entry => entry.type === 'native-injected-event-ignored'),
      noActiveGesture: count(entry => entry.type === 'native-event-ignored-no-active-gesture'),
      total: count(entry => entry.type === 'native-injected-event-ignored' || entry.type === 'native-event-ignored-no-active-gesture')
    }
  },
  filtered: { lines: filtered.length, path: 'manual-injected-session-filtered.jsonl' },
  verdict
}

const evidence = path.join(__dirname, 'evidence')
fs.mkdirSync(evidence, { recursive: true })
fs.writeFileSync(path.join(evidence, 'manual-injected-session-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
fs.writeFileSync(path.join(evidence, 'manual-injected-session-filtered.jsonl'), `${filtered.map(entry => JSON.stringify(entry)).join('\n')}\n`)
console.log(JSON.stringify(summary, null, 2))
