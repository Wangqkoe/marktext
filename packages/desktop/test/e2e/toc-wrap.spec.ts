import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { clickMenuById, launchWithMarkdown } from './helpers'

const LONG_HEADING = Array.from({ length: 18 }, (_, index) => `heading-${index + 1}`).join(' ')

const ensureSidebarVisible = async(app: ElectronApplication, page: Page): Promise<void> => {
  if (!(await page.locator('.side-bar').isVisible())) {
    await clickMenuById(app, 'sideBarMenuItem')
  }
  await expect(page.locator('.side-bar')).toBeVisible()
}

const setStoreValue = (page: Page, storeId: string, action: string, value: unknown) =>
  page.evaluate(
    ({ storeId: id, action: actionName, payload }) => {
      const root = document.querySelector('#app') as
        | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
        | null
      const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, unknown>> }
        | undefined
      const store = pinia?._s?.get(id) as Record<string, unknown> | undefined
      const storeAction = store?.[actionName]
      if (typeof storeAction !== 'function') return false
      ;(storeAction as (argument: unknown) => void)(payload)
      return true
    },
    { storeId, action, payload: value }
  )

const readWrapMetrics = (page: Page) =>
  page.evaluate(() => {
    const toc = document.querySelector('.side-bar-toc') as HTMLElement
    const content = document.querySelector('.side-bar-toc .el-tree-node__content') as HTMLElement
    const label = document.querySelector('.side-bar-toc .el-tree-node__label') as HTMLElement
    const style = getComputedStyle(label)
    return {
      tocWidth: toc.clientWidth,
      tocScrollWidth: toc.scrollWidth,
      contentHeight: content.getBoundingClientRect().height,
      contentScrollHeight: content.scrollHeight,
      labelHeight: label.getBoundingClientRect().height,
      labelScrollHeight: label.scrollHeight,
      labelRight: label.getBoundingClientRect().right,
      tocRight: toc.getBoundingClientRect().right,
      whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap,
      lineClamp: style.webkitLineClamp
    }
  })

const setRenderedSidebarWidth = (page: Page, width: number): Promise<void> =>
  page.locator('.side-bar').evaluate((element, nextWidth) => {
    ;(element as HTMLElement).style.width = `${nextWidth}px`
  }, width)

test.describe('Wrap text in TOC', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(`# ${LONG_HEADING}\n`)
    app = launched.app
    page = launched.page
    await ensureSidebarVisible(app, page)
    await page.getByRole('tab', { name: 'Outline' }).click()
    await page.waitForSelector('.side-bar-toc .el-tree-node__label', { state: 'visible' })
    await setRenderedSidebarWidth(page, 220)
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('defaults to the existing single-line behavior', async() => {
    const defaultValue = await page.evaluate(() => {
      const root = document.querySelector('#app') as
        | (Element & { __vue_app__?: { config?: { globalProperties?: Record<string, unknown> } } })
        | null
      const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia as
        | { _s?: Map<string, Record<string, unknown>> }
        | undefined
      return (pinia?._s?.get('preferences') as { wordWrapInToc?: boolean } | undefined)
        ?.wordWrapInToc
    })
    expect(defaultValue).toBe(false)

    const metrics = await readWrapMetrics(page)
    expect(metrics.contentHeight).toBeLessThanOrEqual(27)
    expect(metrics.labelHeight).toBeLessThanOrEqual(27)
    await expect(page.locator('.side-bar-toc')).toHaveClass(/side-bar-toc-overflow/)
    await expect(page.locator('.side-bar-toc')).not.toHaveClass(/side-bar-toc-wordwrap/)
  })

  test('wraps the complete heading to unlimited lines at the actual Sidebar width', async() => {
    expect(
      await setStoreValue(page, 'preferences', 'SET_USER_PREFERENCE', { wordWrapInToc: true })
    ).toBe(true)
    await page.waitForFunction(() =>
      document.querySelector('.side-bar-toc')?.classList.contains('side-bar-toc-wordwrap')
    )

    const narrow = await readWrapMetrics(page)
    expect(narrow.whiteSpace).toBe('normal')
    expect(narrow.overflowWrap).toBe('anywhere')
    expect(narrow.lineClamp).toBe('none')
    expect(narrow.labelHeight).toBeGreaterThan(80)
    expect(narrow.labelScrollHeight).toBeLessThanOrEqual(Math.ceil(narrow.labelHeight))
    expect(narrow.contentScrollHeight).toBeLessThanOrEqual(Math.ceil(narrow.contentHeight))
    expect(narrow.labelRight).toBeLessThanOrEqual(narrow.tocRight + 1)
    expect(narrow.tocScrollWidth).toBeLessThanOrEqual(narrow.tocWidth + 1)

    await setRenderedSidebarWidth(page, 420)
    await expect
      .poll(() => page.locator('.side-bar').evaluate((element) => element.clientWidth))
      .toBeGreaterThan(400)

    const wide = await readWrapMetrics(page)
    expect(wide.tocWidth).toBeGreaterThan(narrow.tocWidth)
    expect(wide.labelHeight).toBeLessThan(narrow.labelHeight)
    expect(wide.labelScrollHeight).toBeLessThanOrEqual(Math.ceil(wide.labelHeight))
    expect(wide.tocScrollWidth).toBeLessThanOrEqual(wide.tocWidth + 1)
  })

  test('restores the existing single-line behavior when wrap is turned off', async() => {
    expect(
      await setStoreValue(page, 'preferences', 'SET_USER_PREFERENCE', { wordWrapInToc: false })
    ).toBe(true)
    await page.waitForFunction(() =>
      document.querySelector('.side-bar-toc')?.classList.contains('side-bar-toc-overflow')
    )

    const metrics = await readWrapMetrics(page)
    expect(metrics.contentHeight).toBeLessThanOrEqual(27)
    expect(metrics.labelHeight).toBeLessThanOrEqual(27)
    await expect(page.locator('.side-bar-toc')).toHaveClass(/side-bar-toc-overflow/)
    await expect(page.locator('.side-bar-toc')).not.toHaveClass(/side-bar-toc-wordwrap/)
  })
})
