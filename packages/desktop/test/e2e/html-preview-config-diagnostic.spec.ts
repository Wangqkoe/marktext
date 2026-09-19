import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, waitForEditor, waitForMenuReady } from './helpers'

// One-off diagnostic, not a performance gate. The temporary HTMLPreview probe
// must be present in the production renderer bundle used by this test.
const enabled = process.env.MARKTEXT_HTML_CONFIG_DIAGNOSTIC === '1'
const variant = process.env.MARKTEXT_HTML_CONFIG_VARIANT
const outputPath = process.env.MARKTEXT_HTML_CONFIG_OUT
const rounds = Number(process.env.MARKTEXT_HTML_CONFIG_ROUNDS ?? 2)

interface Probe {
  active: boolean
  variant: 'baseline' | 'candidate'
  sanitizeCalls: number
  sanitizeMs: number
  createCalls: number
  createMs: number
  updateCalls: number
  updateMs: number
  captureOutput?: boolean
  outputs?: string[]
}

interface Sample {
  round: number
  action: 'open' | 'switch'
  elapsedMs: number
  htmlBlocks: number
  topLevelBlocks: number
  probe: Probe
}

// Same synthetic literature-report shape as source-cursor-response-perf.spec.ts.
const generateLargeDocument = (entries = 300, tableRows = 300): string => {
  const words =
    'quantum photonic network memory lattice coherent optical cavity entangled spectral'.split(' ')
  const sentence = (seed: number, length: number): string =>
    Array.from({ length }, (_, index) => words[(seed * 7 + index * 3) % words.length]).join(' ')
  const out: string[] = ['# Synthetic literature report', '', '> Generated performance fixture.', '']
  for (let index = 1; index <= entries; index += 1) {
    const id = `R${String(index).padStart(3, '0')}`
    out.push(
      `## ${id} · ${sentence(index, 12)}`,
      '',
      `<strong><mark>Authors:</mark></strong> Author ${index}A；Author ${index}B；<mark>Author ${index}Z</mark>  `,
      '',
      '<details>',
      '<summary>All authors</summary>',
      '',
      `Author ${index}A；Author ${index}B；Author ${index}C；<mark>Author ${index}Z</mark>`,
      '',
      '</details>',
      '',
      `**Source:** Journal ${index % 17} · 2026-07-15 · Article  `,
      `**ID:** DOI 10.1000/fixture.${index} · [Page](<https://doi.org/10.1000/fixture.${index}>)`,
      '',
      `**Topics:** ${sentence(index + 1, 6)}  `,
      `**Score:** ${(index % 100).toFixed(1)}`,
      '',
      `**Summary:** ${sentence(index + 2, 45)}.`,
      '',
      '<details>',
      '<summary>Abstract</summary>',
      '',
      `${sentence(index + 3, 110)}.`,
      '',
      '</details>',
      '',
      `<!-- fixture:${id}:start -->`,
      '**Evidence:** abstract  ',
      `<!-- fixture:${id}:end -->`,
      ''
    )
  }
  out.push('## Cross check', '', '| # | DOI | Field | Status |', '| --- | --- | --- | --- |')
  for (let index = 1; index <= tableRows; index += 1) {
    out.push(`| ${index} | 10.1000/fixture.${index} | class | blocked; ${sentence(index, 8)} |`)
  }
  return out.join('\n') + '\n'
}

const newProbe = (captureOutput = false): Probe => ({
  active: true,
  variant: variant as Probe['variant'],
  sanitizeCalls: 0,
  sanitizeMs: 0,
  createCalls: 0,
  createMs: 0,
  updateCalls: 0,
  updateMs: 0,
  captureOutput,
  outputs: captureOutput ? [] : undefined
})

const armProbe = async(page: Page, captureOutput = false): Promise<void> => {
  await page.evaluate((probe) => {
    ;(window as typeof window & { __MT_HTML_CONFIG_PROBE__?: Probe }).__MT_HTML_CONFIG_PROBE__ = probe
  }, newProbe(captureOutput))
}

const selectTab = (page: Page, filename: string): Promise<void> =>
  page.evaluate((name) => {
    const tab = Array.from(document.querySelectorAll('.tabs-container > li')).find(
      (li) => li.querySelector('.tab-filename')?.textContent?.trim() === name
    )
    const button = tab?.querySelector('.tab-select') as HTMLButtonElement | null
    if (!button) throw new Error(`tab not found: ${name}`)
    button.click()
  }, filename)

const waitForMarker = async(page: Page, marker: string): Promise<void> => {
  await page.waitForFunction(
    (needle) => {
      if (document.querySelector('.source-code .CodeMirror')) return false
      const headings = document.querySelectorAll('.editor-component h1, .editor-component h2')
      return Array.from(headings).some(
        (heading) => heading.textContent?.includes(needle) && heading.getClientRects().length > 0
      )
    },
    marker,
    { timeout: 180000 }
  )
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

const measure = async(
  page: Page,
  round: number,
  action: Sample['action'],
  trigger: { filename: string } | { pathname: string }
): Promise<Sample> => {
  await armProbe(page)
  await page.evaluate((target) => {
    const w = window as typeof window & { __MT_HTML_CONFIG_START__?: number }
    w.__MT_HTML_CONFIG_START__ = performance.now()
    if ('pathname' in target) window.electron.ipcRenderer.send('mt::open-file', target.pathname, {})
    else {
      const tab = Array.from(document.querySelectorAll('.tabs-container > li')).find(
        (li) => li.querySelector('.tab-filename')?.textContent?.trim() === target.filename
      )
      const button = tab?.querySelector('.tab-select') as HTMLButtonElement | null
      if (!button) throw new Error(`tab not found: ${target.filename}`)
      button.click()
    }
  }, trigger)
  await waitForMarker(page, 'Cross check')
  const result = await page.evaluate(() => {
    const w = window as typeof window & {
      __MT_HTML_CONFIG_START__?: number
      __MT_HTML_CONFIG_PROBE__?: Probe
    }
    const probe = w.__MT_HTML_CONFIG_PROBE__
    if (!probe || w.__MT_HTML_CONFIG_START__ === undefined) throw new Error('HTML config probe unavailable')
    probe.active = false
    return {
      elapsedMs: performance.now() - w.__MT_HTML_CONFIG_START__,
      htmlBlocks: document.querySelectorAll('.mu-container > .mu-html-block').length,
      topLevelBlocks: document.querySelectorAll('.mu-container > *').length,
      probe: { ...probe }
    }
  })
  if (result.probe.sanitizeCalls === 0 && action === 'open') {
    throw new Error('The HTMLPreview sanitizer was not exercised during open')
  }
  return { round, action, ...result }
}

const securityMarkdown = [
  '# Sanitizer security fixture',
  '',
  '<details open ontoggle="alert(1)" onbeforetoggle="alert(2)">',
  '<summary onclick="alert(3)">Safe summary</summary>',
  '<p>Safe body <img src="data:image/png;base64,iVBORw0KGgo=" onerror="alert(4)"></p>',
  '<a href="javascript:alert(5)" onclick="alert(6)">Bad URL</a>',
  '<a href="sms:+15551212">Allowed URL</a>',
  '<script>alert(7)</script>',
  '</details>',
  ''
].join('\n')

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex')

test.describe('HTML preview fixed-config diagnostic', () => {
  test.skip(!enabled, 'set MARKTEXT_HTML_CONFIG_DIAGNOSTIC=1')

  test('records actual Electron preview sanitization and safety parity', async() => {
    test.setTimeout(15 * 60 * 1000)
    if (!outputPath) throw new Error('MARKTEXT_HTML_CONFIG_OUT is required')
    if (variant !== 'baseline' && variant !== 'candidate') {
      throw new Error('MARKTEXT_HTML_CONFIG_VARIANT must be baseline or candidate')
    }
    const markdown = generateLargeDocument()
    const fixtureBytes = Buffer.byteLength(markdown)
    const fixtureLines = markdown.split('\n').length
    if (fixtureBytes !== 626129 || fixtureLines !== 9309) {
      throw new Error(`Unexpected fixture shape: ${fixtureLines} lines, ${fixtureBytes} bytes`)
    }
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-html-config-'))
    const largePath = path.join(workDir, 'large-document.md')
    const smallPath = path.join(workDir, 'small.md')
    const warmupPath = path.join(workDir, 'warmup.md')
    const securityPath = path.join(workDir, 'security.md')
    fs.writeFileSync(largePath, markdown, 'utf-8')
    fs.writeFileSync(smallPath, '# Small heading\n\nShort note.\n', 'utf-8')
    fs.writeFileSync(warmupPath, '# Warmup heading\n\n' + '<details><summary>Warm</summary>Body</details>\n\n'.repeat(12), 'utf-8')
    fs.writeFileSync(securityPath, securityMarkdown, 'utf-8')
    const samples: Sample[] = []
    let security: unknown
    let app: ElectronApplication | undefined

    try {
      for (let round = 1; round <= rounds; round += 1) {
        const launched = await launchElectron([smallPath])
        app = launched.app
        const page = launched.page
        await waitForEditor(page)
        await waitForMenuReady(app)

        // Warm the preview purifier and Electron's document route before timing.
        await armProbe(page)
        await page.evaluate((pathname) => window.electron.ipcRenderer.send('mt::open-file', pathname, {}), warmupPath)
        await waitForMarker(page, 'Warmup heading')
        await selectTab(page, 'small.md')
        await waitForMarker(page, 'Small heading')

        samples.push(await measure(page, round, 'open', { pathname: largePath }))
        await selectTab(page, 'small.md')
        await waitForMarker(page, 'Small heading')
        samples.push(await measure(page, round, 'switch', { filename: 'large-document.md' }))

        if (round === 1) {
          await armProbe(page, true)
          await page.evaluate((pathname) => window.electron.ipcRenderer.send('mt::open-file', pathname, {}), securityPath)
          await waitForMarker(page, 'Sanitizer security fixture')
          const snapshot = await page.evaluate(() => {
            const probe = (window as typeof window & { __MT_HTML_CONFIG_PROBE__?: Probe }).__MT_HTML_CONFIG_PROBE__
            if (!probe) throw new Error('security probe unavailable')
            probe.active = false
            return {
              sanitized: probe.outputs ?? [],
              preview: Array.from(document.querySelectorAll('.editor-component .mu-html-preview'))
                .filter((element) => element.getClientRects().length > 0)
                .map((element) => element.innerHTML)
            }
          })
          const joined = snapshot.preview.join('\n')
          expect(joined).toContain('<details open="">')
          expect(joined).toContain('<summary>Safe summary</summary>')
          expect(joined).toContain('<img')
          expect(joined).not.toMatch(/\s(?:onerror|onclick|ontoggle|onbeforetoggle)=/i)
          expect(joined).not.toContain('javascript:')
          expect(joined).not.toContain('<script')
          expect(joined).toContain('href="sms:+15551212"')

          const exportPath = path.join(workDir, `${variant}-export.html`)
          await app.evaluate(({ BrowserWindow, dialog }, targetPath) => {
            const win = BrowserWindow.getAllWindows()[0]
            dialog.showSaveDialog = async() => ({ canceled: false, filePath: targetPath })
            win.webContents.send('mt::show-export-dialog', 'styledHtml')
          }, exportPath)
          await page.locator('.print-settings-dialog .button-primary').click()
          await expect.poll(() => fs.existsSync(exportPath), { timeout: 30000 }).toBe(true)
          const exported = fs.readFileSync(exportPath, 'utf-8')
          expect(exported).toContain('<details open="">')
          expect(exported).not.toMatch(/\s(?:onerror|onclick|ontoggle|onbeforetoggle)=/i)
          expect(exported).not.toContain('javascript:')
          security = {
            sanitized: snapshot.sanitized,
            preview: snapshot.preview,
            previewSha256: sha256(joined),
            exportedSha256: sha256(exported),
            exportLength: exported.length
          }
        }

        await app.close()
        app = undefined
      }
    } finally {
      if (app) await app.close().catch(() => undefined)
      fs.rmSync(workDir, { recursive: true, force: true })
    }

    const result = {
      recordedAt: new Date().toISOString(),
      variant,
      fixtureBytes,
      fixtureLines,
      rounds,
      platform: `${process.platform} ${os.release()}`,
      cpu: os.cpus()[0]?.model,
      samples,
      security
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
    console.log(`[html-config-diagnostic] ${JSON.stringify(result)}`)
  })
})
