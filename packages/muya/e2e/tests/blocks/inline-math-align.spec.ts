import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/muya'

// Baseline alignment and horizontal reachability for hidden inline math.
// #4339: a long inline math must stay scrollable (not truncated) when hidden,
// and the popup/inline scrollbar is thinned. The parse-error message is short
// and never scrolls, so it keeps `overflow: visible` to stay on the text
// baseline (the popup's `overflow: auto` otherwise takes the inline-block's
// baseline from its bottom edge, pushing the message a few px above the text).
// A valid formula keeps `overflow: auto` on an inline-flex render box, which
// remains scrollable while exporting the KaTeX item's baseline.

async function renderVsTextTop(page: Page, md: string): Promise<number> {
  await page.evaluate((m) => window.muya!.setContent(m), md)
  await page.waitForTimeout(150)
  return page.evaluate(() => {
    const render = document.querySelector('.mu-math > .mu-math-render') as HTMLElement
    const p = document.querySelector('.mu-paragraph') as HTMLElement
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    let n: Node | null; let h: DOMRect | null = null
    while ((n = w.nextNode())) {
      const t = n as Text; const i = (t.textContent || '').indexOf('h')
      if (i >= 0) { const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); h = r.getBoundingClientRect(); break }
    }
    return Math.round(render.getBoundingClientRect().top) - Math.round(h!.top)
  })
}

async function mathVsTextBaseline(page: Page, md: string): Promise<number> {
  await page.evaluate((m) => window.muya!.setContent(m), md)
  await page.evaluate(() => document.fonts.ready)
  return page.evaluate(() => {
    const outer = document.querySelector('.mu-hide.mu-math') as HTMLElement
    const katex = outer.querySelector('.katex') as HTMLElement
    const base = katex.querySelector('.katex-html > .base') as HTMLElement
    const probeCss = [
      'display:inline-block',
      'width:0',
      'height:0',
      'padding:0',
      'margin:0',
      'border:0',
      'overflow:visible',
      'vertical-align:baseline',
    ].join(';')
    const textProbe = document.createElement('span')
    const mathProbe = document.createElement('span')
    textProbe.style.cssText = probeCss
    mathProbe.style.cssText = probeCss
    outer.before(textProbe)
    base.append(mathProbe)
    return mathProbe.getBoundingClientRect().top - textProbe.getBoundingClientRect().top
  })
}

test('hidden inline math exports the KaTeX body baseline to surrounding text', async ({ page }) => {
  for (const formula of [
    'x',
    'F=\\frac{1}{2}',
    'S_0',
    '|u\\rangle',
    '\\langle u|T^{\\dagger}T|v\\rangle',
    '(|0\\rangle+|1\\rangle)/\\sqrt2',
  ]) expect(Math.abs(await mathVsTextBaseline(page, `hxy $${formula}$ hxy`))).toBeLessThanOrEqual(0.5)
  expect(await page.evaluate(async () => {
    const [math, main] = await Promise.all([
      document.fonts.load('italic 19.36px KaTeX_Math', 'x'),
      document.fonts.load('normal 19.36px KaTeX_Main', 'M'),
    ])
    return {
      math: math.some(face => face.status === 'loaded' && face.style === 'italic'),
      main: main.some(face => face.status === 'loaded' && face.style === 'normal'),
    }
  })).toEqual({ math: true, main: true })
})

test('a hidden inline-math parse error sits on the surrounding text baseline', async ({ page }) => {
  expect(Math.abs(await renderVsTextTop(page, 'hello $\\invalidcmd$ www'))).toBeLessThanOrEqual(3)
  expect(await page.locator('.mu-math-render.mu-math-error').evaluate(el => getComputedStyle(el).display)).toBe('inline-block')
})

test('a long hidden inline math stays scrollable, not truncated', async ({ page }) => {
  const longMath = `$${Array.from({ length: 40 }, (_, i) => `x_{${i}}`).join('+')}$`
  await page.evaluate((m) => window.muya!.setContent(`text ${m} end`), longMath)
  await page.waitForTimeout(250)
  const r = await page.evaluate(() => {
    const outer = document.querySelector('.mu-hide.mu-math') as HTMLElement
    const render = document.querySelector('.mu-math > .mu-math-render') as HTMLElement
    const base = render.querySelector('.katex-html > .base') as HTMLElement
    const lastAtom = [...render.querySelectorAll('.mord')].at(-1) as HTMLElement
    const probeCss = [
      'display:inline-block',
      'width:0',
      'height:0',
      'padding:0',
      'margin:0',
      'border:0',
      'overflow:visible',
      'vertical-align:baseline',
    ].join(';')
    const textProbe = document.createElement('span')
    const mathProbe = document.createElement('span')
    textProbe.style.cssText = probeCss
    mathProbe.style.cssText = probeCss
    const probeGroup = document.createElement('span')
    probeGroup.style.whiteSpace = 'nowrap'
    outer.before(probeGroup)
    probeGroup.append(outer, textProbe)
    base.append(mathProbe)
    const baseline = mathProbe.getBoundingClientRect().top - textProbe.getBoundingClientRect().top
    const viewport = render.getBoundingClientRect()
    const initiallyClipped = lastAtom.getBoundingClientRect().right > viewport.right + 1
    render.scrollLeft = render.scrollWidth
    const last = lastAtom.getBoundingClientRect()
    return {
      hidden: render.closest('.mu-math')!.classList.contains('mu-hide'),
      display: getComputedStyle(render).display,
      overflowX: getComputedStyle(render).overflowX,
      scrollable: render.scrollWidth > render.clientWidth + 2,
      baseline,
      initiallyClipped,
      lastAtomVisible: last.left >= viewport.left - 1 && last.right <= viewport.right + 1,
    }
  })
  expect(r.hidden).toBe(true)
  expect(r.display).toBe('inline-flex')
  expect(r.overflowX).toBe('auto')
  expect(r.scrollable).toBe(true) // content is reachable by scrolling, not cut off
  expect(Math.abs(r.baseline)).toBeLessThanOrEqual(0.5)
  expect(r.initiallyClipped).toBe(true)
  expect(r.lastAtomVisible).toBe(true)
})

test('a short inline math ending in a subscript shows no scrollbar (#4837)', async ({ page }) => {
  // KaTeX gives every sub/superscript a 2px `.vlist-s` strut that its
  // `.vlist-t2` margin cancels visually but not in scrollWidth; the popup's
  // `overflow: auto` then drew a spurious scrollbar under any short formula
  // ending in one. The rendered scroll extent must match the visible width.
  await page.evaluate(() => window.muya!.setContent('inline $x_1$ here'))
  await page.waitForTimeout(150)
  const r = await page.evaluate(() => {
    const render = document.querySelector('.mu-math > .mu-math-render') as HTMLElement
    return {
      hidden: render.closest('.mu-math')!.classList.contains('mu-hide'),
      overflowX: render.scrollWidth - render.clientWidth,
    }
  })
  expect(r.hidden).toBe(true)
  expect(r.overflowX).toBe(0) // no horizontal overflow, so no scrollbar
})

test('the inline-math scrollbar is thin (6px, matching code blocks)', async ({ page }) => {
  await page.evaluate(() => window.muya!.setContent('x'))
  await page.waitForTimeout(100)
  // The ::-webkit-scrollbar height rule is what thins the bar; assert it is wired.
  const height = await page.evaluate(() => {
    const sheets = [...document.styleSheets]
    for (const s of sheets) {
      let rules: CSSRuleList
      try { rules = s.cssRules } catch { continue }
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule && rule.selectorText?.includes('.mu-math > .mu-math-render::-webkit-scrollbar')) {
          return rule.style.height
        }
      }
    }
    return ''
  })
  expect(height).toBe('6px')
})
