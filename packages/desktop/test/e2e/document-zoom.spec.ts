import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  clickMenuById,
  closeDiscardingChanges,
  enterSourceMode,
  getMarkdownContent,
  launchElectron,
  launchWithMarkdown,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const SVG_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNDAiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iNDAiIGZpbGw9InJlZCIvPjwvc3ZnPg=='

const markdown = [
  '# Document Zoom',
  '',
  ...Array.from({ length: 50 }, (_, index) => `Paragraph ${index + 1}. ${'zoom content '.repeat(12)}`),
  ''
].join('\n\n')

const setDocumentZoom = async(page: Page, percent: number): Promise<void> => {
  await page.locator('.document-zoom-slider').evaluate((element, value) => {
    const input = element as HTMLInputElement
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, percent)
  await expect(page.locator('.document-zoom-percent')).toHaveText(`${percent}%`)
}

const assertSourcePointerGeometry = async(page: Page, percent: number): Promise<void> => {
  await setDocumentZoom(page, percent)
  const target = await page.evaluate(async({ line, ch }) => {
    const wrapper = document.querySelector('.source-code .CodeMirror') as
      | (HTMLElement & { CodeMirror: { focus(): void; refresh(): void } })
      | null
    if (!wrapper) throw new Error('Source editor is unavailable')
    wrapper.CodeMirror.refresh()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const lineElement = document.querySelectorAll<HTMLElement>('.source-code .CodeMirror-line')[line]
    if (!lineElement) throw new Error('Source line is unavailable')
    lineElement.scrollIntoView({ block: 'center' })
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT)
    let remaining = ch
    let node = walker.nextNode() as Text | null
    while (node && remaining > node.data.length) {
      remaining -= node.data.length
      node = walker.nextNode() as Text | null
    }
    if (!node) throw new Error('Source text position is unavailable')
    const range = document.createRange()
    range.setStart(node, Math.min(remaining, node.data.length))
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    const x = rect.left
    const y = rect.top + rect.height / 2
    const container = document.querySelector<HTMLElement>('.source-code')!
    const lineStyle = getComputedStyle(lineElement)
    return {
      x,
      y,
      line,
      ch,
      debug: {
        hitClass: (document.elementFromPoint(x, y) as HTMLElement | null)?.className,
        lineRect: lineElement.getBoundingClientRect().toJSON(),
        containerRect: container.getBoundingClientRect().toJSON(),
        scrollTop: container.scrollTop,
        fontSize: getComputedStyle(wrapper).fontSize,
        point: { x, y },
        lineStyle: {
          paddingLeft: lineStyle.paddingLeft,
          textIndent: lineStyle.textIndent,
          fontSize: lineStyle.fontSize,
          lineHeight: lineStyle.lineHeight
        }
      }
    }
  }, { line: 12, ch: 4 })

  // CodeMirror tracks click repetition globally; separate zoom probes so a
  // click at the same source position is never interpreted as a double click.
  await page.waitForTimeout(500)
  await page.mouse.click(target.x, target.y)
  await page.waitForTimeout(100)
  const geometry = await page.evaluate(({ line, ch }) => {
    const wrapper = document.querySelector('.source-code .CodeMirror') as
      | (HTMLElement & { CodeMirror: { getCursor(): { line: number; ch: number } } })
      | null
    const lineElement = document.querySelectorAll<HTMLElement>('.source-code .CodeMirror-line')[line]
    if (!wrapper || !lineElement) throw new Error('Source editor is unavailable after click')
    const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT)
    let remaining = ch
    let node = walker.nextNode() as Text | null
    while (node && remaining > node.data.length) {
      remaining -= node.data.length
      node = walker.nextNode() as Text | null
    }
    if (!node) throw new Error('Source text position is unavailable after click')
    const range = document.createRange()
    range.setStart(node, Math.min(remaining, node.data.length))
    range.collapse(true)
    const expected = range.getBoundingClientRect()
    const cursors = Array.from(document.querySelectorAll<HTMLElement>('.CodeMirror-cursor'))
    const cursor = cursors[0]
    return {
      actual: wrapper.CodeMirror.getCursor(),
      expected: { left: expected.left, top: expected.top, height: expected.height },
      cursor: cursor?.getBoundingClientRect().toJSON(),
      focused: wrapper.classList.contains('CodeMirror-focused')
    }
  }, { line: target.line, ch: target.ch })

  expect(geometry.actual.line, JSON.stringify(target.debug)).toBe(target.line)
  expect(
    Math.abs(geometry.actual.ch - target.ch),
    `${percent}% ${JSON.stringify({ actual: geometry.actual, target: target.debug })}`
  ).toBeLessThanOrEqual(1)
  expect(geometry.cursor, JSON.stringify(geometry)).toBeDefined()
  expect(geometry.focused).toBe(true)
  expect(Math.abs(geometry.cursor!.left - geometry.expected.left)).toBeLessThanOrEqual(2)
  expect(geometry.cursor!.top).toBeLessThanOrEqual(geometry.expected.top + 1)
  expect(geometry.cursor!.bottom).toBeGreaterThanOrEqual(
    geometry.expected.top + geometry.expected.height - 1
  )
  expect(geometry.cursor!.height).toBeGreaterThan(geometry.expected.height * 0.75)
  expect(geometry.cursor!.height).toBeLessThan(geometry.expected.height * 1.75)

  const selectionEnd = await page.evaluate(({ line, ch }) => {
    const lineElement = document.querySelectorAll<HTMLElement>('.source-code .CodeMirror-line')[line]
    const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT)
    let remaining = ch
    let node = walker.nextNode() as Text | null
    while (node && remaining > node.data.length) {
      remaining -= node.data.length
      node = walker.nextNode() as Text | null
    }
    if (!node) throw new Error('Source selection endpoint is unavailable')
    const range = document.createRange()
    range.setStart(node, Math.min(remaining, node.data.length))
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    return { x: rect.left, y: rect.top + rect.height / 2, line, ch }
  }, { line: target.line, ch: 12 })
  await page.waitForTimeout(500)
  await page.mouse.move(target.x, target.y)
  await page.mouse.down()
  await page.mouse.move(selectionEnd.x, selectionEnd.y, { steps: 4 })
  await page.mouse.up()
  const selection = await page.locator('.source-code .CodeMirror').evaluate(element => {
    const cm = (element as unknown as {
      CodeMirror: {
        listSelections(): Array<{
          anchor: { line: number; ch: number }
          head: { line: number; ch: number }
        }>
      }
    }).CodeMirror
    return cm.listSelections()[0]
  })
  expect(selection.anchor.line).toBe(target.line)
  expect(selection.head.line).toBe(selectionEnd.line)
  expect(Math.abs(selection.anchor.ch - target.ch)).toBeLessThanOrEqual(1)
  expect(Math.abs(selection.head.ch - selectionEnd.ch)).toBeLessThanOrEqual(1)
}

const tabMenuAction = async(
  app: ElectronApplication,
  tab: ReturnType<Page['locator']>,
  label: string
): Promise<void> => {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function() {
      ;(global as unknown as { __documentZoomTabMenu: unknown }).__documentZoomTabMenu = this
    }
  })
  await tab.dispatchEvent('contextmenu', { clientX: 20, clientY: 20 })
  await expect.poll(() => app.evaluate(() =>
    !!(global as unknown as { __documentZoomTabMenu?: unknown }).__documentZoomTabMenu
  )).toBe(true)
  await app.evaluate(({ BrowserWindow }, itemLabel) => {
    const state = global as unknown as {
      __documentZoomTabMenu?: {
        items: Array<{ label: string; enabled: boolean; click(...args: unknown[]): void }>
      }
    }
    const item = state.__documentZoomTabMenu?.items.find(candidate => candidate.label === itemLabel)
    if (!item?.enabled) throw new Error(`Menu action unavailable: ${itemLabel}`)
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    item.click(undefined, win, win?.webContents)
    delete state.__documentZoomTabMenu
  }, label)
}

test.describe('Document Zoom', () => {
  test('scales both editor modes and panes while preserving shell, content and reading anchor', async() => {
    test.setTimeout(90_000)
    const { app, page } = await launchWithMarkdown(markdown)
    try {
      await expect(page.locator('.tabs-container > li.active')).not.toHaveClass(/unsaved/)
      const before = await page.evaluate(() => {
        const container = document.querySelector<HTMLElement>('.editor-component')!
        const blocks = Array.from(container.querySelectorAll<HTMLElement>('.mu-container > *'))
        container.scrollTop = Math.max(1, blocks[22]?.offsetTop ?? 600)
        const containerTop = container.getBoundingClientRect().top
        const anchorIndex = blocks.findIndex(block => block.getBoundingClientRect().bottom >= containerTop)
        const anchorTop = blocks[anchorIndex]!.getBoundingClientRect().top - containerTop
        return {
          shellHeight: document.querySelector<HTMLElement>('.app-status-bar')!.getBoundingClientRect().height,
          headingHeight: document.querySelector<HTMLElement>('.mu-container > h1')!.getBoundingClientRect().height,
          anchorIndex,
          anchorTop
        }
      })

      await setDocumentZoom(page, 150)

      const after = await page.evaluate((anchorIndex) => {
        const container = document.querySelector<HTMLElement>('.editor-component')!
        const blocks = Array.from(container.querySelectorAll<HTMLElement>('.mu-container > *'))
        return {
          zoom: getComputedStyle(document.querySelector<HTMLElement>('.mu-container')!).zoom,
          shellHeight: document.querySelector<HTMLElement>('.app-status-bar')!.getBoundingClientRect().height,
          headingHeight: document.querySelector<HTMLElement>('.mu-container > h1')!.getBoundingClientRect().height,
          anchorTop: blocks[anchorIndex]!.getBoundingClientRect().top - container.getBoundingClientRect().top
        }
      }, before.anchorIndex)
      expect(Number(after.zoom)).toBeCloseTo(1.5, 5)
      expect(after.shellHeight).toBeCloseTo(before.shellHeight, 5)
      expect(after.headingHeight / before.headingHeight).toBeCloseTo(1.5, 1)
      expect(after.anchorTop).toBeCloseTo(before.anchorTop, 0)

      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.25)
      })
      await setDocumentZoom(page, 160)
      expect(await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor()
      )).toBeCloseTo(1.25, 5)
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1)
      })

      await enterSourceMode(page, app)
      await expect.poll(() => page.locator('.source-code .CodeMirror').evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize)
      )).toBeCloseTo(14 * 1.6, 5)
      const sourceBefore = await page.locator('.source-code .CodeMirror').evaluate((element) =>
        (element as unknown as { CodeMirror: { getValue(): string } }).CodeMirror.getValue()
      )
      expect(sourceBefore).toBe(markdown)
      await assertSourcePointerGeometry(page, 50)
      await assertSourcePointerGeometry(page, 150)
      await assertSourcePointerGeometry(page, 200)
      await expect(page.locator('.tabs-container > li.active')).not.toHaveClass(/unsaved/)

      await tabMenuAction(app, page.locator('.tabs-container > li.active'), 'Split Right')
      await expect(page.locator('.workspace-pane')).toHaveCount(2)
      await expect(page.locator('.workspace-pane .CodeMirror')).toHaveCount(2)
      await expect.poll(() => page.locator('.workspace-pane .CodeMirror').evaluateAll(
        elements => elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize))
      )).toEqual([28, 28])
    } finally {
      await app.close()
    }
  })

  test('restores the persisted document factor on restart', async() => {
    test.setTimeout(90_000)
    const first = await launchWithMarkdown('# Persisted zoom\n')
    await setDocumentZoom(first.page, 125)
    await first.app.close()

    const second = await launchElectron([first.filePath], {
      userDataDir: first.userDataDir,
      userDataDirOwnership: 'launcher'
    })
    try {
      await waitForEditor(second.page)
      await waitForMenuReady(second.app)
      await expect(second.page.locator('.document-zoom-percent')).toHaveText('125%')
      await expect.poll(() => second.page.locator('.mu-container').evaluate((element) =>
        Number(getComputedStyle(element).zoom)
      )).toBeCloseTo(1.25, 5)
    } finally {
      await second.app.close()
    }
  })

  test('uses scaled Source metrics for TOC navigation', async() => {
    test.setTimeout(90_000)
    const tocMarkdown = Array.from({ length: 20 }, (_, index) => [
      `# Zoom Heading ${index + 1}`,
      ...Array.from({ length: 6 }, (__, paragraph) =>
        `Filler ${paragraph + 1} under heading ${index + 1}.`
      )
    ].join('\n\n')).join('\n\n')
    const { app, page } = await launchWithMarkdown(tocMarkdown)
    try {
      await setDocumentZoom(page, 200)
      await enterSourceMode(page, app)
      const sidebarVisible = await page.locator('.side-bar').evaluate(element =>
        (element as HTMLElement).offsetParent !== null
      )
      if (!sidebarVisible) await clickMenuById(app, 'sideBarMenuItem')
      await clickMenuById(app, 'tocMenuItem')
      await expect(page.locator('.side-bar-toc').getByText('Zoom Heading 18', {
        exact: true
      })).toBeVisible()
      await page.locator('.source-code').evaluate(element => {
        element.scrollTop = 0
      })
      await page.locator('.side-bar-toc').getByText('Zoom Heading 18', { exact: true }).click()
      await expect.poll(() => page.locator('.source-code').evaluate(element =>
        element.scrollTop
      ), { timeout: 8_000 }).toBeGreaterThan(0)
      await expect.poll(() => page.evaluate(() => {
        const container = document.querySelector<HTMLElement>('.source-code')!
        const target = Array.from(
          document.querySelectorAll<HTMLElement>('.source-code .CodeMirror-line')
        ).find(line => line.textContent?.includes('# Zoom Heading 18'))!
        return target.getBoundingClientRect().top - container.getBoundingClientRect().top
      }), { timeout: 8_000 }).toBeLessThan(150)
    } finally {
      await app.close()
    }
  })

  test('converts rendered image-resize movement back to document width', async() => {
    test.setTimeout(90_000)
    const { app, page } = await launchWithMarkdown(`![zoom](${SVG_DATA_URI})\n`)
    try {
      await setDocumentZoom(page, 200)
      const image = page.locator(
        '.editor-component .mu-inline-image.mu-image-success .mu-image-container img'
      ).first()
      await image.waitFor({ state: 'attached', timeout: 15_000 })
      const renderedWidth = await image.evaluate(element =>
        element.closest<HTMLElement>('.mu-image-container')!.getBoundingClientRect().width
      )
      await image.click()
      const rightHandle = page.locator('.mu-transformer .bar.right')
      await expect(rightHandle).toBeVisible()
      const handleBox = await rightHandle.boundingBox()
      if (!handleBox) throw new Error('Image resize handle has no rendered box')
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(handleBox.x + handleBox.width / 2 + 80, handleBox.y + handleBox.height / 2)
      await page.mouse.up()

      const expectedWidth = Math.trunc((renderedWidth + 80) / 2)
      await expect.poll(async() => Number(await image.getAttribute('width'))).toBe(expectedWidth)
      await expect.poll(() => getMarkdownContent(page, app)).toContain(`width="${expectedWidth}"`)
    } finally {
      await closeDiscardingChanges(app)
    }
  })
})
