import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithDoc, sendIpcToRenderer, waitForEditor } from './helpers'

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
    const launched = await launchWithDoc('test/e2e/data/wysiwyg-scroll-400-headings.md')
    app = launched.app
    page = launched.page
    await waitForEditor(page)
    await clickMenuById(app, 'tocMenuItem')
    await page.waitForSelector('.side-bar-toc .el-tree-node', { state: 'visible' })
    await settleRendererFrames(page)
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('keeps native scrolling local during a burst and converges once without replacing Outline', async() => {
    const before = await readScrollSnapshot(page)
    const result = await page.evaluate(async() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      const maximum = container.scrollHeight - container.clientHeight
      if (maximum < 160) throw new Error(`editor fixture does not overflow: ${maximum}`)
      const outlineNode = document.querySelector('.side-bar-toc .el-tree-node') as HTMLElement | null
      if (!outlineNode) throw new Error('Outline node is unavailable')
      outlineNode.dataset.scrollStabilityMarker = 'retained'
      const values = [40, 80, 120, 160]
      for (const scrollTop of values) {
        container.scrollTop = scrollTop
        container.dispatchEvent(new Event('scroll'))
        if (container.scrollTop !== scrollTop) {
          throw new Error(`native scrollTop did not update directly to ${scrollTop}`)
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      return {
        finalDomScrollTop: container.scrollTop,
        expectedScrollTop: values.at(-1) ?? 0,
        outlineRetainedDuringBurst: outlineNode.isConnected
      }
    })

    const duringBurst = await readScrollSnapshot(page)

    expect(result.finalDomScrollTop).toBe(result.expectedScrollTop)
    expect(result.outlineRetainedDuringBurst).toBe(true)
    expect(duringBurst).toEqual(before)

    await page.waitForTimeout(200)
    const afterIdle = await readScrollSnapshot(page)
    const outlineRetainedAfterIdle = await page.evaluate(
      () => !!document.querySelector('[data-scroll-stability-marker="retained"]')
    )

    expect(afterIdle.scrollTop).toBe(result.expectedScrollTop)
    expect(afterIdle.revision - before.revision).toBe(1)
    expect(outlineRetainedAfterIdle).toBe(true)
  })

  test('does not publish an unchanged value and publishes one new value after idle', async() => {
    const stable = await readScrollSnapshot(page)
    await page.evaluate((scrollTop) => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = scrollTop
      container.dispatchEvent(new Event('scroll'))
    }, stable.scrollTop)
    await page.waitForTimeout(200)
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
    await page.waitForTimeout(200)
    const next = await readScrollSnapshot(page)

    expect(next.revision - unchanged.revision).toBe(1)
    expect(next.scrollTop).toBe(nextScrollTop)
  })

  test('keeps TOC animation frames local and commits its destination at completion', async() => {
    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = 0
      container.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(200)
    const before = await readScrollSnapshot(page)
    const outlineNode = page.locator('.side-bar-toc').getByText('Heading 300', { exact: true })

    await outlineNode.click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
        )
      )
      .toBeGreaterThan(0)
    const during = await readScrollSnapshot(page)

    expect(during).toEqual(before)

    await page.waitForTimeout(350)
    const finalDomScrollTop = await page.evaluate(
      () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
    )
    const completed = await readScrollSnapshot(page)

    expect(completed.scrollTop).toBe(finalDomScrollTop)
    expect(completed.revision - before.revision).toBe(1)
  })

  test('lets native user scrolling supersede an in-flight TOC destination', async() => {
    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = 0
      container.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(200)
    const before = await readScrollSnapshot(page)

    await page.locator('.side-bar-toc').getByText('Heading 300', { exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
        )
      )
      .toBeGreaterThan(0)
    const userScrollTop = 900
    await page.locator('.editor-component').dispatchEvent('wheel', { deltaY: -240 })
    await page.evaluate((scrollTop) => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = scrollTop
      container.dispatchEvent(new Event('scroll'))
    }, userScrollTop)

    await page.waitForTimeout(500)
    const finalDomScrollTop = await page.evaluate(
      () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
    )
    const completed = await readScrollSnapshot(page)

    expect(finalDomScrollTop).toBe(userScrollTop)
    expect(completed.scrollTop).toBe(userScrollTop)
    expect(completed.revision - before.revision).toBe(1)
  })

  test('lets a replacement TOC animation commit alone and treats the same target as a no-op', async() => {
    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = 0
      container.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(200)
    const before = await readScrollSnapshot(page)

    await page.locator('.side-bar-toc').getByText('Heading 300', { exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(
          () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
        )
      )
      .toBeGreaterThan(0)
    await page.locator('.side-bar-toc').getByText('Heading 50', { exact: true }).click()
    await page.waitForTimeout(400)
    const replacement = await readScrollSnapshot(page)
    const replacementDomTop = await page.evaluate(
      () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
    )

    expect(replacement.scrollTop).toBe(replacementDomTop)
    expect(replacement.revision - before.revision).toBe(1)

    await page.locator('.side-bar-toc').getByText('Heading 50', { exact: true }).click()
    await page.waitForTimeout(400)
    const sameTarget = await readScrollSnapshot(page)

    expect(sameTarget).toEqual(replacement)
  })

  test('keeps search animation local and commits the active match once', async() => {
    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = 0
      container.dispatchEvent(new Event('scroll'))
      const outlineNode = document.querySelector(
        '.side-bar-toc .el-tree-node'
      ) as HTMLElement | null
      if (outlineNode) outlineNode.dataset.searchScrollMarker = 'retained'
    })
    await page.waitForTimeout(200)
    const before = await readScrollSnapshot(page)

    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
    const input = page.locator('.search-bar .search input')
    await expect(input).toBeVisible()
    await input.fill('Heading 250')
    await expect
      .poll(() => page.locator('.search-bar .search-result').innerText())
      .toContain('1 / 1')
    await expect
      .poll(() =>
        page.evaluate(
          () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
        )
      )
      .toBeGreaterThan(0)
    const during = await readScrollSnapshot(page)

    expect(during).toEqual(before)

    await page.waitForTimeout(400)
    const finalDomScrollTop = await page.evaluate(
      () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
    )
    const completed = await readScrollSnapshot(page)
    const outlineRetained = await page.evaluate(
      () => !!document.querySelector('[data-search-scroll-marker="retained"]')
    )

    expect(completed.scrollTop).toBe(finalDomScrollTop)
    expect(completed.revision - before.revision).toBe(1)
    expect(outlineRetained).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.locator('.search-bar')).toBeHidden()
  })

  test('keeps typewriter positioning local and commits its centered destination once', async() => {
    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = 0
      container.dispatchEvent(new Event('scroll'))
      const headings = Array.from(document.querySelectorAll('.mu-container > h2'))
      const target = headings.find((heading) => heading.textContent?.includes('Heading 350'))
      const text = target?.firstChild
      if (!text) throw new Error('typewriter target is unavailable')
      const selection = window.getSelection()
      const range = document.createRange()
      range.setStart(text, 0)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
    await page.waitForTimeout(200)
    const before = await readScrollSnapshot(page)

    await clickMenuById(app, 'typewriterModeMenuItem')
    await expect
      .poll(() =>
        page.evaluate(
          () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
        )
      )
      .toBeGreaterThan(0)
    const during = await readScrollSnapshot(page)

    expect(during).toEqual(before)

    await page.waitForTimeout(400)
    const finalDomScrollTop = await page.evaluate(
      () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
    )
    const completed = await readScrollSnapshot(page)

    expect(completed.scrollTop).toBe(finalDomScrollTop)
    expect(completed.revision - before.revision).toBe(1)
    await clickMenuById(app, 'typewriterModeMenuItem')
  })

  test('lets a wheel input move the native container without post-input continuation', async() => {
    await page.evaluate(() => {
      const container = document.querySelector('.editor-component') as HTMLElement | null
      if (!container) throw new Error('editor scroll container is unavailable')
      container.scrollTop = 0
      container.dispatchEvent(new Event('scroll'))
    })
    await page.waitForTimeout(200)

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
    await page.waitForTimeout(200)
    const afterPause = await page.evaluate(
      () => (document.querySelector('.editor-component') as HTMLElement | null)?.scrollTop ?? -1
    )
    const snapshot = await readScrollSnapshot(page)

    expect(afterPause).toBe(settled)
    expect(snapshot.scrollTop).toBe(settled)
  })
})
