export interface ScrollReportFrameScheduler {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

export interface ScrollReportGate {
  request(scrollTop: number): void
  flush(): void
  dispose(): void
}

const browserFrameScheduler: ScrollReportFrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle)
}

/**
 * Keep native scrolling untouched while reducing its state-reporting side
 * effect to the final value observed in each renderer animation frame.
 */
export const createScrollReportGate = (
  report: (scrollTop: number) => boolean,
  scheduler: ScrollReportFrameScheduler = browserFrameScheduler
): ScrollReportGate => {
  let frameHandle: number | undefined
  let pendingScrollTop: number | undefined
  let lastReportedScrollTop: number | undefined
  let disposed = false

  const publish = () => {
    frameHandle = undefined
    if (disposed || pendingScrollTop === undefined) return
    const scrollTop = pendingScrollTop
    pendingScrollTop = undefined
    if (Object.is(scrollTop, lastReportedScrollTop)) return
    if (report(scrollTop)) lastReportedScrollTop = scrollTop
  }

  return {
    request(scrollTop) {
      if (disposed) return
      pendingScrollTop = scrollTop
      frameHandle ??= scheduler.request(publish)
    },
    flush() {
      if (disposed || pendingScrollTop === undefined) return
      if (frameHandle !== undefined) scheduler.cancel(frameHandle)
      frameHandle = undefined
      publish()
    },
    dispose() {
      if (disposed) return
      disposed = true
      pendingScrollTop = undefined
      if (frameHandle !== undefined) scheduler.cancel(frameHandle)
      frameHandle = undefined
    }
  }
}
