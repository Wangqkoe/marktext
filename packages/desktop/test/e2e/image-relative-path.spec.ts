import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchElectron, waitForEditor, waitForMenuReady } from './helpers'

// Checklist 122 — integration coverage for the Phase G "G1" blocker: a
// relative-path image (`![](assets/cat.png)`) in a saved document must resolve
// to a DIRNAME-anchored `file://` URL so Chromium can load it off disk. The
// engine-unit half is pinned by packages/muya/src/utils/__tests__/image.spec.ts
// (getImageSrc). This spec drives the REAL built Electron app: it saves a doc
// next to a sibling `assets/cat.png`, opens it (so the renderer populates
// `window.DIRNAME` from the document directory), and asserts the rendered
// `<img>` src is `file://<docDir>/assets/cat.png` — not the broken,
// non-anchored `file://assets/cat.png` form the migration regressed to.

// A 1x1 transparent PNG so `loadImage` resolves (the engine swaps the wrapper
// to `.mu-image-success` only when the file actually loads off disk).
const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const createdDirs: string[] = []

const removeTemporaryRoot = (rootDir: string, prefix: string): void => {
  const resolvedRoot = path.resolve(rootDir)
  const resolvedTemp = path.resolve(os.tmpdir())
  if (path.dirname(resolvedRoot) !== resolvedTemp || !path.basename(resolvedRoot).startsWith(prefix)) {
    throw new Error(`Refusing to remove unexpected temporary directory: ${rootDir}`)
  }
  fs.rmSync(resolvedRoot, { recursive: true, force: true })
}

const writeDocWithRelativeImage = (): { docPath: string; docDir: string } => {
  const docDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-e2e-relimg-'))
  createdDirs.push(docDir)
  const assetsDir = path.join(docDir, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(path.join(assetsDir, 'cat.png'), Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'))
  const docPath = path.join(docDir, 'note.md')
  fs.writeFileSync(docPath, '![a cat](assets/cat.png)\n', 'utf-8')
  return { docPath, docDir }
}

const writeDocsWithRelativeImagesInDifferentDirectories = (): {
  rootDir: string
  firstPath: string
  firstDir: string
  secondPath: string
  secondDir: string
} => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-e2e-relimg-switch-'))
  createdDirs.push(rootDir)
  const writeDocument = (directory: string, imageName: string): string => {
    const assetsDir = path.join(directory, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    fs.writeFileSync(path.join(assetsDir, imageName), Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'))
    const documentPath = path.join(directory, 'note.md')
    fs.writeFileSync(documentPath, `![](${path.posix.join('assets', imageName)})\n`, 'utf-8')
    return documentPath
  }
  const firstDir = path.join(rootDir, 'first')
  const secondDir = path.join(rootDir, 'second')
  return {
    rootDir,
    firstPath: writeDocument(firstDir, 'first.png'),
    firstDir,
    secondPath: writeDocument(secondDir, 'second.png'),
    secondDir
  }
}

const writeDocsWithMatchingRelativeImagePaths = (): {
  rootDir: string
  firstPath: string
  firstDir: string
  secondPath: string
  secondDir: string
} => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-e2e-relimg-split-'))
  createdDirs.push(rootDir)
  const writeDocument = (directory: string, width: number): string => {
    const assetsDir = path.join(directory, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    fs.writeFileSync(
      path.join(assetsDir, 'image.svg'),
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="1"><rect width="100%" height="100%"/></svg>`,
      'utf-8'
    )
    const documentPath = path.join(directory, 'note.md')
    fs.writeFileSync(documentPath, '![](assets/image.svg)\n\n<div><img src="assets/image.svg"></div>\n', 'utf-8')
    return documentPath
  }
  const firstDir = path.join(rootDir, 'first')
  const secondDir = path.join(rootDir, 'second')
  return {
    rootDir,
    firstPath: writeDocument(firstDir, 101),
    firstDir,
    secondPath: writeDocument(secondDir, 202),
    secondDir
  }
}

const tabMenuAction = async(app: ElectronApplication, tab: ReturnType<Page['locator']>, label: string): Promise<void> => {
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function() {
      ;(global as unknown as { __relativeImageMenu: unknown }).__relativeImageMenu = this
    }
  })
  await tab.dispatchEvent('contextmenu', { clientX: 20, clientY: 20 })
  await expect.poll(() => app.evaluate(() => !!(global as unknown as { __relativeImageMenu?: unknown }).__relativeImageMenu)).toBe(true)
  await app.evaluate(({ BrowserWindow }, itemLabel) => {
    const state = global as unknown as {
      __relativeImageMenu?: { items: Array<{ label: string; enabled: boolean; click(...args: unknown[]): void }> }
    }
    const item = state.__relativeImageMenu?.items.find(item => item.label === itemLabel)
    if (!item?.enabled) throw new Error(`Menu action unavailable: ${itemLabel}`)
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    item.click(undefined, win, win?.webContents)
    delete state.__relativeImageMenu
  }, label)
}

test.describe('Relative-path image resolves to a DIRNAME-anchored file:// URL', () => {
  let app: ElectronApplication | null = null
  let page: Page
  let docDir: string

  test.beforeAll(async() => {
    const written = writeDocWithRelativeImage()
    docDir = written.docDir
    const launched = await launchElectron([written.docPath])
    app = launched.app
    page = launched.page
    await waitForEditor(page)
    await waitForMenuReady(app)
  })

  test.afterAll(async() => {
    if (app) await app.close()
    for (const dir of createdDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  test('window.DIRNAME tracks the opened document directory', async() => {
    // The renderer populates window.DIRNAME from the open file's dirname; the
    // engine reads it to anchor relative image paths (image.ts getImageSrc).
    await expect
      .poll(async() => page.evaluate(() => window.DIRNAME), { timeout: 10000 })
      .toBeTruthy()
    const dirname = await page.evaluate(() => window.DIRNAME)
    // file:// URLs always use forward slashes, and so does the engine's
    // resolveRelativePath; compare against the normalised doc dir.
    expect(dirname.replace(/\\/g, '/')).toBe(docDir.replace(/\\/g, '/'))
  })

  test('renders an <img> whose src is file://<docDir>/assets/cat.png', async() => {
    const imgLocator = page.locator('.editor-component .mu-image-container img')
    await imgLocator.first().waitFor({ state: 'attached', timeout: 10000 })

    // Wait for loadImageAsync to settle: a successful off-disk load swaps the
    // wrapper to `.mu-image-success` and sets the <img> src to the resolved
    // (optionally cache-busted) file:// URL.
    await expect
      .poll(async() => page.locator('.editor-component .mu-inline-image.mu-image-success').count(), {
        timeout: 10000
      })
      .toBeGreaterThanOrEqual(1)

    const src = await imgLocator.first().getAttribute('src')
    expect(src).not.toBeNull()
    const value = src as string

    // DIRNAME-anchored: must be a real file:// URL, never the regressed
    // non-anchored `file://assets/cat.png` (no leading slash after file://).
    expect(value.startsWith('file://')).toBe(true)
    expect(value).not.toContain('file://file://')

    // Strip any cache-busting query (`?mucache=…`/`&mucache=…`) the engine
    // appends to local files, then assert the path ends with the anchored
    // relative path and contains the document directory.
    const withoutQuery = value.split('?')[0]
    expect(withoutQuery.endsWith('assets/cat.png')).toBe(true)
    const expectedSrc = `file://${docDir.replace(/\\/g, '/')}/assets/cat.png`
    expect(withoutQuery).toBe(expectedSrc)
  })

  test('the anchored file:// URL points at a file that exists on disk', async() => {
    const src = await page
      .locator('.editor-component .mu-image-container img')
      .first()
      .getAttribute('src')
    expect(src).not.toBeNull()
    const withoutQuery = (src as string).split('?')[0]
    // Convert the file:// URL back to a filesystem path and confirm the engine
    // resolved it to the on-disk sibling we wrote in setup.
    const onDiskPath = withoutQuery.replace(/^file:\/\//, '')
    expect(fs.existsSync(onDiskPath)).toBe(true)
    expect(onDiskPath).toBe(path.join(docDir, 'assets', 'cat.png').replace(/\\/g, '/'))
  })
})

test('switching documents updates relative image resolution to the active document directory', async() => {
  const docs = writeDocsWithRelativeImagesInDifferentDirectories()
  const launched = await launchElectron([docs.firstPath])
  try {
    await waitForEditor(launched.page)
    await expect
      .poll(async() => launched.page.locator('.editor-component .mu-inline-image.mu-image-success').count(), {
        timeout: 10000
      })
      .toBeGreaterThanOrEqual(1)

    await launched.page.evaluate((documentPath) => {
      window.electron.ipcRenderer.send('mt::open-file', documentPath, {})
    }, docs.secondPath)

    await expect
      .poll(
        async() =>
          launched.page.evaluate(() => document.querySelector('.editor-component .mu-inline-image')?.getAttribute('data-raw')),
        { timeout: 10000 }
      )
      .toBe('![](assets/second.png)')
    await expect
      .poll(
        async() => launched.page.evaluate(() => window.DIRNAME.replace(/\\/g, '/')),
        { timeout: 10000 }
      )
      .toBe(docs.secondDir.replace(/\\/g, '/'))
    await expect
      .poll(async() => launched.page.locator('.editor-component .mu-inline-image.mu-image-success').count(), {
        timeout: 10000
      })
      .toBeGreaterThanOrEqual(1)

    const image = launched.page.locator('.editor-component .mu-image-container img').first()
    await expect.poll(async() => image.evaluate(element => (element as HTMLImageElement).naturalWidth), { timeout: 10000 }).toBe(1)
    const src = await image.getAttribute('src')
    expect(src?.split('?')[0]).toBe(
      `file://${path.join(docs.secondDir, 'assets', 'second.png').replace(/\\/g, '/')}`
    )
  } finally {
    await launched.app.close()
    removeTemporaryRoot(docs.rootDir, 'marktext-e2e-relimg-switch-')
  }
})

test('split panes resolve identical relative image paths from their own documents', async() => {
  const docs = writeDocsWithMatchingRelativeImagePaths()
  const launched = await launchElectron([docs.firstPath])
  try {
    await waitForEditor(launched.page)
    await expect.poll(async() => launched.page.locator('.mu-inline-image.mu-image-success').count(), {
      timeout: 10000
    }).toBeGreaterThanOrEqual(1)

    await tabMenuAction(launched.app, launched.page.locator('.tabs-container > li.active'), 'Split Right')
    await expect(launched.page.locator('.workspace-pane')).toHaveCount(2)
    await launched.page.locator('.workspace-pane').first().click()
    await launched.page.evaluate((documentPath) => {
      window.electron.ipcRenderer.send('mt::open-file', documentPath, {})
    }, docs.secondPath)

    await expect.poll(async() => launched.page.locator('.workspace-pane').first().locator('.tabs-container > li.active').getAttribute('title'), {
      timeout: 10000
    }).toBe(docs.secondPath)
    await expect.poll(async() => launched.page.locator('.workspace-pane').first().locator('.mu-inline-image').count(), {
      timeout: 10000
    }).toBeGreaterThanOrEqual(1)
    await expect.poll(async() => launched.page.locator('.workspace-pane').nth(1).locator('.mu-inline-image').count(), {
      timeout: 10000
    }).toBeGreaterThanOrEqual(1)
    for (const pane of await launched.page.locator('.workspace-pane').all()) {
      await expect(pane.locator('.mu-html-preview-action')).toHaveCount(1)
      await pane.locator('.mu-html-preview-action').dispatchEvent('click')
    }

    await expect.poll(async() => launched.page.locator('.workspace-pane').evaluateAll((panes) =>
      panes.map(pane => pane.querySelector<HTMLImageElement>('.mu-image-container img')?.naturalWidth)
    ), { timeout: 10000 }).toEqual([202, 101])
    const srcs = await launched.page.locator('.workspace-pane').evaluateAll((panes) =>
      panes.map(pane => pane.querySelector<HTMLImageElement>('.mu-image-container img')?.src.split('?')[0])
    )
    expect(srcs).toEqual([
      pathToFileURL(path.join(docs.secondDir, 'assets', 'image.svg')).href,
      pathToFileURL(path.join(docs.firstDir, 'assets', 'image.svg')).href
    ])
    await expect.poll(async() => launched.page.locator('.workspace-pane').evaluateAll((panes) =>
      panes.map(pane => pane.querySelector<HTMLImageElement>('.mu-html-preview img')?.naturalWidth)
    ), { timeout: 10000 }).toEqual([202, 101])
    const htmlSrcs = await launched.page.locator('.workspace-pane').evaluateAll((panes) =>
      panes.map(pane => pane.querySelector<HTMLImageElement>('.mu-html-preview img')?.src.split('?')[0])
    )
    expect(htmlSrcs).toEqual([
      pathToFileURL(path.join(docs.secondDir, 'assets', 'image.svg')).href,
      pathToFileURL(path.join(docs.firstDir, 'assets', 'image.svg')).href
    ])
  } finally {
    await launched.app.close()
    removeTemporaryRoot(docs.rootDir, 'marktext-e2e-relimg-split-')
  }
})
