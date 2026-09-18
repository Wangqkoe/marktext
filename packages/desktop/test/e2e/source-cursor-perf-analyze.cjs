const fs = require('node:fs')

const input = process.argv[2]
const output = process.argv[3]
if (!input || !output) {
  throw new Error('usage: node source-cursor-perf-analyze.cjs <all-results.json> <summary.json>')
}

const artifact = JSON.parse(fs.readFileSync(input, 'utf8'))

const percentile = (values, fraction) => {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

const stats = (values) => ({
  median: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  min: Math.min(...values),
  max: Math.max(...values)
})

const numberFrom = (sample, field) => Number(sample[field] ?? 0)
const actions = ['arrow', 'shift-selection', 'insert']
const summary = {
  recordedAt: artifact.recordedAt,
  method: {
    timing: 'trusted keydown to the first animation frame where both the CodeMirror model and the current-line DOM caret/text/selection are updated',
    internal: 'synchronous performance.now timing; component times are nested within processingTotal and are not added to eventTotal',
    percentile: 'nearest-rank',
    sessionScope: 'one fresh Electron application and user-data directory per fixture/variant group',
    caveat: 'one measurement session; medians and p95 describe repeated operations within that session, not between-session variance'
  },
  groups: []
}

for (const group of artifact.results) {
  const actionSummaries = []
  for (const action of actions) {
    const operations = group.samples.filter((sample) => sample.action === action)
    const detailedFor = (operation) => operation.eventSamples.filter((sample) =>
      sample.kind === 'save' || sample.kind === 'cursor-report')
    const eventFor = (operation) => operation.eventSamples.filter((sample) => sample.kind === 'event')
    const sumDetailed = (operation, field) =>
      detailedFor(operation).reduce((sum, sample) => sum + numberFrom(sample, field), 0)
    const countKind = (operation, kind, trigger) => operation.eventSamples.filter((sample) =>
      sample.kind === kind && (!trigger || sample.trigger === trigger)).length
    const componentFields = [
      'totalMs',
      'getValueMs',
      'cursorReadMs',
      'wordCountMs',
      'reportSourceMs'
    ]
    const components = Object.fromEntries(componentFields.map((field) => [
      field === 'totalMs' ? 'processingTotalMs' : field,
      stats(operations.map((operation) => sumDetailed(operation, field)))
    ]))
    const byTrigger = Object.fromEntries(['change', 'cursorActivity'].map((trigger) => [
      trigger,
      {
        detailedCallsPerOperation: stats(operations.map((operation) =>
          detailedFor(operation).filter((sample) => sample.trigger === trigger).length)),
        processingTotalMs: stats(operations.map((operation) =>
          detailedFor(operation)
            .filter((sample) => sample.trigger === trigger)
            .reduce((sum, sample) => sum + sample.totalMs, 0)))
      }
    ]))
    actionSummaries.push({
      action,
      operations: operations.length,
      keydownToVisibleRafMs: stats(operations.map((sample) => sample.keydownToVisibleRafMs)),
      frames: stats(operations.map((sample) => sample.frames)),
      eventTotalMs: stats(operations.map((operation) =>
        eventFor(operation).reduce((sum, sample) => sum + sample.totalMs, 0))),
      components,
      callsPerOperation: {
        changeEvents: stats(operations.map((operation) => countKind(operation, 'event', 'change'))),
        cursorActivityEvents: stats(operations.map((operation) =>
          countKind(operation, 'event', 'cursorActivity'))),
        fullSaves: stats(operations.map((operation) => countKind(operation, 'save'))),
        cursorReports: stats(operations.map((operation) => countKind(operation, 'cursor-report')))
      },
      byTrigger
    })
  }
  summary.groups.push({
    fixtureName: group.fixtureName,
    variant: group.variant,
    bytes: group.bytes,
    lineCount: group.lineCount,
    repetitions: group.repetitions,
    warmups: group.warmups,
    actions: actionSummaries
  })
}

fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n')
process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
