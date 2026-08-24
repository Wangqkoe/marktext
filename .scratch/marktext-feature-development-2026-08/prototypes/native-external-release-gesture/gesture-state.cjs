// Throwaway state machine shared by the Electron harness and its semantic test.
function createGestureState ({ isInside, emit }) {
  let nextId = 1
  let active = null

  function record (type, fields = {}, session = active) {
    emit({ type, gestureId: session ? session.id : fields.gestureId || null, state: session ? session.state : null, ...fields })
  }

  function begin (origin) {
    if (active) record('gesture-replaced', { replacementOrigin: origin })
    active = { id: nextId++, state: 'source-pressed', candidate: false }
    record('source-tab-mousedown', { origin })
    return { id: active.id }
  }

  function cancel (reason) {
    if (!active) return false
    const session = active
    session.state = `cancelled:${reason}`
    record('cancelled', { reason }, session)
    active = null
    return true
  }

  function eventIsInside (event) {
    if (typeof event.hitTest?.inside === 'boolean') return event.hitTest.inside
    return isInside(event.x, event.y)
  }

  function native (event) {
    if (event.type === 'native-escape') return cancel('native-escape')
    if (event.type === 'native-move' || event.type === 'native-up') {
      if (event.injected === true) {
        record('native-injected-event-ignored', { nativeEvent: event })
        return false
      }
      if (event.injected !== false) {
        record('native-mouse-event-missing-injected-flag-ignored', { nativeEvent: event })
        return false
      }
    }
    if (!active) {
      record('native-event-ignored-no-active-gesture', { nativeEvent: event })
      return false
    }
    const session = active
    if (event.type === 'native-move') {
      if (!eventIsInside(event) && !session.candidate) {
        session.candidate = true
        session.state = 'external-candidate'
        record('external-candidate-armed', { nativeEvent: event }, session)
      } else if (eventIsInside(event) && session.candidate) {
        session.candidate = false
        session.state = 'reentered-source'
        record('reentered-source', { nativeEvent: event }, session)
      }
      return false
    }
    if (event.type !== 'native-up') return false
    const commits = session.candidate && !eventIsInside(event)
    if (commits) {
      session.state = 'detached'
      record('DETACH_COMMIT', { reason: 'native-left-button-release-outside-source', nativeEvent: event }, session)
    } else {
      record('native-up-no-detach', { nativeEvent: event }, session)
    }
    active = null
    return commits
  }

  function blur () {
    record('browser-window-blur-observed-no-detach')
  }

  function timeout (gestureId) {
    if (!active || active.id !== gestureId) {
      record('timeout-stale-ignored', { timedOutGestureId: gestureId })
      return
    }
    record('timeout-observed-no-detach', { timedOutGestureId: gestureId })
  }

  function snapshot () {
    return active ? { ...active } : null
  }

  return { begin, cancel, native, blur, timeout, snapshot }
}

module.exports = { createGestureState }
