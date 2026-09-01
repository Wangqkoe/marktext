import type { WorkspaceResult } from '@shared/workspace'

export interface ScrollReportFrameScheduler {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
  defer(callback: () => void, delayMs: number): number
  cancelDeferred(handle: number): void
}

export interface ScrollReportGate {
  request(scrollTop: number): void
  flush(): void
  dispose(): void
}

const browserFrameScheduler: ScrollReportFrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
  defer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelDeferred: (handle) => window.clearTimeout(handle)
}

const INITIAL_RETRY_DELAY_MS = 16
const MAX_RETRY_DELAY_MS = 250

const isTemporaryRejection = (result: WorkspaceResult): boolean =>
  result.status === 'rejected' && result.reason === 'workspace mutation is in progress'

/**
 * Keep native scrolling untouched while reducing its state-reporting side
 * effect to the final value observed in each renderer animation frame.
 */
export const createScrollReportGate = (
  report: (scrollTop: number) => WorkspaceResult,
  scheduler: ScrollReportFrameScheduler = browserFrameScheduler
): ScrollReportGate => {
  let frameHandle: number | undefined
  let deferredHandle: number | undefined
  let pendingScrollTop: number | undefined
  let lastReportedScrollTop: number | undefined
  let retryDelayMs = INITIAL_RETRY_DELAY_MS
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

  const scheduleRetry = () => {
    if (disposed || pendingScrollTop === undefined || deferredHandle !== undefined) return
    const delayMs = retryDelayMs
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
    if (Object.is(scrollTop, lastReportedScrollTop)) {
      pendingScrollTop = undefined
      retryDelayMs = INITIAL_RETRY_DELAY_MS
      return
    }
    const result = report(scrollTop)
    if (disposed) return
    if (result.status === 'applied') {
      lastReportedScrollTop = scrollTop
      retryDelayMs = INITIAL_RETRY_DELAY_MS
    } else if (isTemporaryRejection(result)) {
      scheduleRetry()
      return
    } else {
      retryDelayMs = INITIAL_RETRY_DELAY_MS
    }
    if (Object.is(pendingScrollTop, scrollTop)) pendingScrollTop = undefined
    scheduleFrame()
  }

  return {
    request(scrollTop) {
      if (disposed) return
      pendingScrollTop = scrollTop
      cancelDeferred()
      retryDelayMs = INITIAL_RETRY_DELAY_MS
      if (Object.is(scrollTop, lastReportedScrollTop)) {
        pendingScrollTop = undefined
        cancelFrame()
        return
      }
      scheduleFrame()
    },
    flush() {
      if (disposed || pendingScrollTop === undefined) return
      cancelFrame()
      cancelDeferred()
      publish()
    },
    dispose() {
      if (disposed) return
      disposed = true
      pendingScrollTop = undefined
      cancelFrame()
      cancelDeferred()
    }
  }
}
