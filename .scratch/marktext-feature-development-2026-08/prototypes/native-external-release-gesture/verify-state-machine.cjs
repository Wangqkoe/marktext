const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')
const { createGestureState } = require('./gesture-state.cjs')

const source = { x: 700, y: 300, width: 640, height: 420 }
const inside = (x, y) => x >= source.x && y >= source.y && x < source.x + source.width && y < source.y + source.height
const external = { x: 620, y: 480 }
const internal = { x: 800, y: 480 }
const physical = (type, point) => ({ type, ...point, injected: false })
const injected = (type, point) => ({ type, ...point, injected: true })

function harness () {
  const log = []
  const machine = createGestureState({ isInside: inside, emit: entry => log.push(entry) })
  return { machine, log }
}
function commits (log) { return log.filter(entry => entry.type === 'DETACH_COMMIT').length }
function runCase (name, act, expectedCommits) {
  const { machine, log } = harness()
  act(machine, log)
  assert.equal(commits(log), expectedCommits, name)
  return [name, { passed: true, commits: commits(log), log }]
}

const results = Object.fromEntries([
  runCase('external-up', machine => {
    machine.begin('test'); machine.native(physical('native-move', external)); machine.native(physical('native-up', external))
  }, 1),
  runCase('boundary-only', machine => {
    machine.begin('test'); machine.native(physical('native-move', external))
  }, 0),
  runCase('blur', machine => {
    machine.begin('test'); machine.native(physical('native-move', external)); machine.blur()
  }, 0),
  runCase('timeout', machine => {
    const a = machine.begin('test'); machine.native(physical('native-move', external)); machine.timeout(a.id)
  }, 0),
  runCase('reenter-inside-up', machine => {
    machine.begin('test'); machine.native(physical('native-move', external)); machine.native(physical('native-move', internal)); machine.native(physical('native-up', internal))
  }, 0),
  runCase('escape-outside-up', machine => {
    machine.begin('test'); machine.native(physical('native-move', external)); machine.native({ type: 'native-escape', source: 'WH_KEYBOARD_LL' }); machine.native(physical('native-up', external))
  }, 0),
  runCase('reenter-leave-again-outside-up', machine => {
    machine.begin('test'); machine.native(physical('native-move', external)); machine.native(physical('native-move', internal)); machine.native(physical('native-move', external)); machine.native(physical('native-up', external))
  }, 1),
  runCase('stale-timeout-cannot-affect-replacement-gesture', (machine, log) => {
    const a = machine.begin('A'); const b = machine.begin('B'); machine.timeout(a.id); assert.ok(log.some(entry => entry.type === 'timeout-stale-ignored' && entry.timedOutGestureId === a.id && entry.gestureId === b.id)); machine.native(physical('native-move', external)); machine.native(physical('native-up', external)); assert.notEqual(a.id, b.id)
  }, 1),
  runCase('injected-move-cannot-arm-physical-up', (machine, log) => {
    machine.begin('test'); machine.native(injected('native-move', external)); assert.equal(machine.snapshot().candidate, false); machine.native(physical('native-up', external)); assert.ok(log.some(entry => entry.type === 'native-injected-event-ignored'))
  }, 0),
  runCase('injected-up-cannot-commit', (machine, log) => {
    machine.begin('test'); machine.native(physical('native-move', external)); machine.native(injected('native-up', external)); assert.ok(log.some(entry => entry.type === 'native-injected-event-ignored'))
  }, 0)
])

const report = { passed: true, scope: 'shared probe state machine; not native-input evidence', results }
fs.writeFileSync(path.join(__dirname, 'evidence', 'state-machine-verification.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
