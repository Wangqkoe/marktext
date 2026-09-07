import type { WorkspaceResult } from '@shared/workspace'

export interface ScrollReportFrameScheduler {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
  defer(callback: () => void, delayMs: number): number
  cancelDeferred(handle: number): void
}

export interface ScrollReportGate {
  request(scrollTop: number): void
  cancelPending(): void
  flush(): void
  dispose(): number | undefined
}

const browserFrameScheduler: ScrollReportFrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
  defer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelDeferred: (handle) => window.clearTimeout(handle)
}

const INITIAL_RETRY_DELAY_MS = 16
const MAX_RETRY_DELAY_MS = 250
const MAX_RETRY_ATTEMPTS = 3
const IDLE_COMMIT_DELAY_MS = 150

const isTemporaryRejection = (result: WorkspaceResult): boolean =>
  result.status === 'rejected' && result.reason === 'workspace mutation is in progress'

/**
 * Keep native scrolling untouched while committing only the latest position
 * after the native surface has been idle for 150 ms.
 */
export const createScrollReportGate = (
  report: (scrollTop: number) => WorkspaceResult,
  scheduler: ScrollReportFrameScheduler = browserFrameScheduler
): ScrollReportGate => {
  let frameHandle: number | undefined
  let deferredHandle: number | undefined
  let pendingScrollTop: number | undefined
  let uncommittedScrollTop: number | undefined
  let retryDelayMs = INITIAL_RETRY_DELAY_MS
  let retryAttempts = 0
  let disposed = false

  const cancelFrame = () => {
    if (frameHandle === undefined) return
    scheduler.cancel(frameHandle)
    frameHandle = undefined
  }

  const cancelDeferred = () => {
    if (deferredHandle === undefined) return
    scheduler.cancelDeferred(deferredHandle)
    deferredHandle = undefined
  }

  const scheduleFrame = () => {
    if (
      disposed ||
      pendingScrollTop === undefined ||
      frameHandle !== undefined ||
      deferredHandle !== undefined
    ) {
      return
    }
    const handle = scheduler.request(() => {
      if (frameHandle !== handle) return
      frameHandle = undefined
      publish()
    })
    frameHandle = handle
  }

  const scheduleIdleCommit = () => {
    if (
      disposed ||
      pendingScrollTop === undefined ||
      frameHandle !== undefined ||
      deferredHandle !== undefined
    ) {
      return
    }
    const handle = scheduler.defer(() => {
      if (deferredHandle !== handle) return
      deferredHandle = undefined
      publish()
    }, IDLE_COMMIT_DELAY_MS)
    deferredHandle = handle
  }

  const scheduleRetry = () => {
    if (
      disposed ||
      pendingScrollTop === undefined ||
      frameHandle !== undefined ||
      deferredHandle !== undefined
    ) {
      return
    }
    if (retryAttempts >= MAX_RETRY_ATTEMPTS) {
      pendingScrollTop = undefined
      retryDelayMs = INITIAL_RETRY_DELAY_MS
      return
    }
    const delayMs = retryDelayMs
    retryAttempts += 1
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS)
    const handle = scheduler.defer(() => {
      if (deferredHandle !== handle) return
      deferredHandle = undefined
      scheduleFrame()
    }, delayMs)
    deferredHandle = handle
  }

  const publish = () => {
    if (disposed || pendingScrollTop === undefined) return
    const scrollTop = pendingScrollTop
    const result = report(scrollTop)
    if (disposed) return
    if (result.status === 'applied') {
      if (Object.is(uncommittedScrollTop, scrollTop)) uncommittedScrollTop = undefined
      retryDelayMs = INITIAL_RETRY_DELAY_MS
      retryAttempts = 0
    } else if (isTemporaryRejection(result)) {
      scheduleRetry()
      return
    } else {
      retryDelayMs = INITIAL_RETRY_DELAY_MS
      retryAttempts = 0
    }
    if (Object.is(pendingScrollTop, scrollTop)) pendingScrollTop = undefined
    scheduleIdleCommit()
  }

  return {
    request(scrollTop) {
      if (disposed || !Number.isFinite(scrollTop)) return
      pendingScrollTop = scrollTop
      uncommittedScrollTop = scrollTop
      cancelDeferred()
      retryDelayMs = INITIAL_RETRY_DELAY_MS
      retryAttempts = 0
      scheduleIdleCommit()
    },
    cancelPending() {
      if (disposed) return
      pendingScrollTop = undefined
      uncommittedScrollTop = undefined
      retryDelayMs = INITIAL_RETRY_DELAY_MS
      retryAttempts = 0
      cancelFrame()
      cancelDeferred()
    },
    flush() {
      if (disposed || pendingScrollTop === undefined) return
      cancelFrame()
      cancelDeferred()
      publish()
    },
    dispose() {
      if (disposed) return undefined
      const finalScrollTop = uncommittedScrollTop
      disposed = true
      pendingScrollTop = undefined
      uncommittedScrollTop = undefined
      cancelFrame()
      cancelDeferred()
      return finalScrollTop
    }
  }
}
