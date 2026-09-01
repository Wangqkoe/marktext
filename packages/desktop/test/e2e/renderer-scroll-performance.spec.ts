import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, waitForEditor } from './helpers'

const buildLongDocument = (): string =>
  Array.from(
    { length: 160 },
    (_, index) => `Paragraph ${index + 1}. Renderer scroll performance fixture.`
  ).join('\n\n') + '\n'

interface ScrollSnapshot {
  readonly revision: number
  readonly scrollTop: number
}

const readScrollSnapshot = (page: Page): Promise<ScrollSnapshot> =>
  page.evaluate(() => {
    const driver = window as typeof window & {
      __mtWorkspaceSnapshot?: () => {
        projection: {
          workspaceRevision: number
          focusedPaneId: string
          panes: Array<{ paneId: string; activeViewId: string }>
        }
        documents: Array<{ viewId: string; scrollTop: number }>
      }
    }
    const snapshot = driver.__mtWorkspaceSnapshot?.()
    if (!snapshot) throw new Error('workspace snapshot driver is unavailable')
    const pane = snapshot.projection.panes.find(
      (candidate) => candidate.paneId === snapshot.projection.focusedPaneId
    )
    const document = snapshot.documents.find((candidate) => candidate.viewId === pane?.activeViewId)
    if (!document) throw new Error('active workspace document is unavailable')
    return { revision: snapshot.projection.workspaceRevision, scrollTop: document.scrollTop }
  })

const settleRendererFrames = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )

test.describe('renderer scroll reporting', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(buildLongDocument())
    app = launched.app
    page = launched.page
    await waitForEditor(page)
    await settleRendererFrames(page)
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('keeps native DOM scrolling direct while publishing one final value per frame', async() => {
    const before = await readScrollSnapshot(page)
    const result = await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      const maximum = container.scrollHeight - container.clientHeight
      if (maximum < 160) throw new Error(`editor fixture does not overflow: ${maximum}`)
      const values = [40, 80, 120, 160]
      for (const scrollTop of values) {
        container.scrollTop = scrollTop
        container.dispatchEvent(new Event('scroll'))
        if (container.scrollTop !== scrollTop) {
          throw new Error(`native scrollTop did not update directly to ${scrollTop}`)
        }
      }
      return { finalDomScrollTop: container.scrollTop, expectedScrollTop: values.at(-1) ?? 0 }
    })

    await settleRendererFrames(page)
    const after = await readScrollSnapshot(page)

    expect(result.finalDomScrollTop).toBe(result.expectedScrollTop)
    expect(after.scrollTop).toBe(result.expectedScrollTop)
    expect(after.revision - before.revision).toBe(1)
  })

  test('does not publish an unchanged value and publishes one new value next frame', async() => {
    const stable = await readScrollSnapshot(page)
    await page.evaluate((scrollTop) => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = scrollTop
      container.dispatchEvent(new Event('scroll'))
    }, stable.scrollTop)
    await settleRendererFrames(page)
    const unchanged = await readScrollSnapshot(page)

    expect(unchanged.revision).toBe(stable.revision)
    expect(unchanged.scrollTop).toBe(stable.scrollTop)

    const nextScrollTop = stable.scrollTop + 60
    await page.evaluate((scrollTop) => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = scrollTop
      container.dispatchEvent(new Event('scroll'))
    }, nextScrollTop)
    await settleRendererFrames(page)
    const next = await readScrollSnapshot(page)

    expect(next.revision - unchanged.revision).toBe(1)
    expect(next.scrollTop).toBe(nextScrollTop)
  })

  test('lets a wheel input move the native container without post-input continuation', async() => {
    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = 0
      container.dispatchEvent(new Event('scroll'))
    })
    await settleRendererFrames(page)

    await page.locator('.editor-component').hover()
    await page.mouse.wheel(0, 240)
    await expect
      .poll(() =>
        page.evaluate(
          () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
        )
      )
      .toBeGreaterThan(0)
    await settleRendererFrames(page)

    const settled = await page.evaluate(
      () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
    )
    await page.waitForTimeout(120)
    const afterPause = await page.evaluate(
      () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
    )
    const snapshot = await readScrollSnapshot(page)

    expect(afterPause).toBe(settled)
    expect(snapshot.scrollTop).toBe(settled)
  })
})
