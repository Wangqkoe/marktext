import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createAuditRun } from './audit-fixtures'
import {
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  getMarkdownContent,
  launchElectron,
  placeCaretInEditor,
  sendIpcToRenderer,
  setSourceMarkdown,
  waitForEditor,
  waitForMenuReady,
  closeDiscardingChanges
} from './helpers'

const UNSAVED_DOT = '.editor-tabs li.unsaved'

const normalizeToLf = (value: string): string => value.replace(/\r\n?/g, '\n')

const restoreLineEnding = (value: string, original: string): string =>
  original.includes('\r\n') ? value.replace(/\n/g, '\r\n') : value

const isDirty = (page: Page): Promise<boolean> =>
  page.evaluate((selector) => !!document.querySelector(selector), UNSAVED_DOT)

const save = async(app: ElectronApplication): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
}

const undo = async(app: ElectronApplication): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
}

const redo = async(app: ElectronApplication): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'redo')
}

// Documents decide own save versus external change in DocumentIO, so these
// tests read its verdicts from the main process.
const recordDocumentIoObservations = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ BrowserWindow }) => {
    const state = global as unknown as { __mt_audit_document_io_observations__?: string[] }
    state.__mt_audit_document_io_observations__ = []
    const webContents = BrowserWindow.getAllWindows()[0]?.webContents
    if (!webContents) throw new Error('Editor webContents is unavailable')
    const send = webContents.send.bind(webContents)
    webContents.send = ((channel: string, ...args: unknown[]) => {
      if (channel === 'mt::workspace::document-io-observation') {
        const observation = args[0] as { kind?: string } | undefined
        state.__mt_audit_document_io_observations__?.push(String(observation?.kind))
      }
      send(channel, ...args)
    }) as typeof webContents.send
  })
}

const documentIoObservations = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => {
    const state = global as unknown as { __mt_audit_document_io_observations__?: string[] }
    return [...(state.__mt_audit_document_io_observations__ ?? [])]
  })

// One renderer-side edit: unlike setSourceMarkdown it cannot overwrite a disk
// reload that lands between reading the content and writing it back.
const appendInSourceMode = async(
  page: Page,
  app: ElectronApplication,
  text: string
): Promise<void> => {
  await enterSourceMode(page, app)
  await page.evaluate((value) => {
    const element = document.querySelector('.source-code .CodeMirror') as
      | (Element & {
        CodeMirror?: {
          getValue(): string
          posFromIndex(index: number): unknown
          replaceRange(text: string, from: unknown): void
        }
      })
      | null
    const cm = element?.CodeMirror
    if (cm) cm.replaceRange(value, cm.posFromIndex(cm.getValue().length))
  }, text)
  await exitSourceMode(page, app)
}

const assertOnlyCrLf = (bytes: Buffer): void => {
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 0x0a) expect(bytes[index - 1]).toBe(0x0d)
    if (bytes[index] === 0x0d) expect(bytes[index + 1]).toBe(0x0a)
  }
}

const configureE1 = async(app: ElectronApplication, page: Page): Promise<void> => {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setSize(1280, 720)
    win.webContents.setZoomFactor(1)
  })
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(page.locator('body')).not.toHaveClass(/dark/)
  await expect(page.locator('.title-bar')).toBeVisible()
}

test.describe('Ticket 02 W1 — F2 document integrity on E1', () => {
  test('WYSIWYG/source edits, undo/redo, save and reopen preserve exact content', async() => {
    test.setTimeout(90_000)
    const run = createAuditRun()
    const documentPath = run.fixtures.F2.documentPath as string
    const originalBytes = fs.readFileSync(documentPath)
    const original = originalBytes.toString('utf8')
    const canonicalOriginal = normalizeToLf(original)
    const profile = run.createIsolatedUserDataDir('w1-document-integrity')
    const launchOptions = {
      ...run.launchOptionsForUserDataDir(profile),
      suppressErrorDialog: true
    }
    let app: ElectronApplication | undefined

    try {
      let launched = await launchElectron([documentPath], launchOptions)
      app = launched.app
      let page = launched.page
      await waitForEditor(page)
      await waitForMenuReady(app)
      await configureE1(app, page)

      expect(await getMarkdownContent(page, app)).toBe(canonicalOriginal)
      expect(await isDirty(page)).toBe(false)

      await placeCaretInEditor(page)
      await page.keyboard.type(' W1-WYSIWYG-AUDIT')
      await expect.poll(() => getMarkdownContent(page, app as ElectronApplication)).toContain(
        'W1-WYSIWYG-AUDIT'
      )
      await expect.poll(() => isDirty(page)).toBe(true)

      const afterWysiwyg = await getMarkdownContent(page, app)
      await enterSourceMode(page, app)
      await page.evaluate((value) => {
        const element = document.querySelector('.source-code .CodeMirror') as
          | (Element & { CodeMirror?: { setValue(markdown: string): void } })
          | null
        element?.CodeMirror?.setValue(value)
      }, `${afterWysiwyg}\nW1-SOURCE-AUDIT\n`)
      await exitSourceMode(page, app)
      await expect.poll(() => getMarkdownContent(page, app as ElectronApplication)).toContain(
        'W1-SOURCE-AUDIT'
      )

      await undo(app)
      await expect.poll(() => getMarkdownContent(page, app as ElectronApplication)).not.toContain(
        'W1-SOURCE-AUDIT'
      )
      expect(await getMarkdownContent(page, app)).toContain('W1-WYSIWYG-AUDIT')

      await redo(app)
      await expect.poll(() => getMarkdownContent(page, app as ElectronApplication)).toContain(
        'W1-SOURCE-AUDIT'
      )

      const expectedEditorContent = await getMarkdownContent(page, app)
      await save(app)
      await expect.poll(() => isDirty(page), { timeout: 5000 }).toBe(false)
      await expect
        .poll(() => fs.readFileSync(documentPath, 'utf8'), { timeout: 5000 })
        .toBe(restoreLineEnding(expectedEditorContent, original))
      await expectNoRendererErrors(app)

      await app.close()
      app = undefined

      launched = await launchElectron([documentPath], launchOptions)
      app = launched.app
      page = launched.page
      await waitForEditor(page)
      await waitForMenuReady(app)
      expect(await getMarkdownContent(page, app)).toBe(expectedEditorContent)
      expect(await isDirty(page)).toBe(false)
      await expectNoRendererErrors(app)

      expect(fs.readFileSync(documentPath)).not.toEqual(originalBytes)
    } finally {
      if (app) await app.close().catch(() => {})
      run.cleanup()
    }
  })
})

test.describe('Ticket 02 W3 — F3 path, CRLF, image, auto-save and external changes', () => {
  test('preserves F3 invariants and separates clean reload from dirty conflict', async() => {
    test.setTimeout(120_000)
    const run = createAuditRun()
    const documentPath = run.fixtures.F3.documentPath as string
    const profile = run.createIsolatedUserDataDir('w3-path-external-change')
    const launchOptions = {
      ...run.launchOptionsForUserDataDir(profile),
      suppressErrorDialog: true
    }
    let app: ElectronApplication | undefined

    try {
      const launched = await launchElectron([documentPath], launchOptions)
      app = launched.app
      const page = launched.page
      await waitForEditor(page)
      await waitForMenuReady(app)
      await configureE1(app, page)

      expect(documentPath).toContain(`F3 path with spaces 中文${path.sep}`)
      assertOnlyCrLf(fs.readFileSync(documentPath))
      expect(await getMarkdownContent(page, app)).toContain('中文内容')
      expect(await getMarkdownContent(page, app)).toContain('😀')

      const image = page.locator('.editor-component .mu-image-container img').first()
      await image.waitFor({ state: 'attached', timeout: 10000 })
      await expect
        .poll(() => page.locator('.editor-component .mu-inline-image.mu-image-success').count(), {
          timeout: 10000
        })
        .toBeGreaterThanOrEqual(1)
      const imageSource = (await image.getAttribute('src'))?.split('?')[0] ?? ''
      // Drive paths gain the third slash (`file:///C:/`); the engine leaves
      // spaces and CJK unencoded, so pathToFileURL would not match.
      const rootUrlPath = run.fixtures.F3.rootDir.replace(/\\/g, '/')
      expect(imageSource).toBe(
        `file://${rootUrlPath.startsWith('/') ? '' : '/'}${rootUrlPath}/assets/audit-image.png`
      )

      await sendIpcToRenderer(app, 'mt::user-preference', {
        autoSave: true,
        autoSaveDelay: 100
      })
      await page.waitForTimeout(100)
      const initial = await getMarkdownContent(page, app)
      await setSourceMarkdown(page, app, `${initial}\nW3-AUTOSAVE-AUDIT\n`)
      await expect
        .poll(() => fs.readFileSync(documentPath, 'utf8'), { timeout: 8000 })
        .toContain('W3-AUTOSAVE-AUDIT')
      await expect.poll(() => isDirty(page), { timeout: 8000 }).toBe(false)
      const autoSavedBytes = fs.readFileSync(documentPath)
      assertOnlyCrLf(autoSavedBytes)
      expect(autoSavedBytes.toString('utf8')).toContain('assets/audit-image.png')

      // Let the watcher's own-save suppression entry consume the event caused
      // by MarkText's auto-save before checking the ordinary clean reload path.
      await page.waitForTimeout(1800)

      const cleanExternal = [
        '# F3 external clean reload',
        '',
        '中文内容、English words 和 emoji 😀 🚀。',
        '',
        '![相对图片](assets/audit-image.png)',
        '',
        'W3-EXTERNAL-CLEAN',
        ''
      ].join('\r\n')
      fs.writeFileSync(documentPath, cleanExternal, 'utf8')
      await expect
        .poll(() => page.locator('.editor-component').innerText(), { timeout: 10000 })
        .toContain('W3-EXTERNAL-CLEAN')
      expect(await isDirty(page)).toBe(false)

      await sendIpcToRenderer(app, 'mt::user-preference', { autoSave: false })
      await page.waitForTimeout(100)
      const afterCleanReload = await getMarkdownContent(page, app)
      await setSourceMarkdown(page, app, `${afterCleanReload}\nW3-UNSAVED-EDITOR\n`)
      await expect.poll(() => isDirty(page)).toBe(true)

      const conflictingDisk = cleanExternal.replace(
        'W3-EXTERNAL-CLEAN',
        'W3-EXTERNAL-DISK-CONFLICT'
      )
      fs.writeFileSync(documentPath, conflictingDisk, 'utf8')
      await expect(page.locator('.editor-notifications')).toBeVisible({ timeout: 10000 })

      const editorAfterConflict = await getMarkdownContent(page, app)
      expect(editorAfterConflict).toContain('W3-UNSAVED-EDITOR')
      expect(editorAfterConflict).not.toContain('W3-EXTERNAL-DISK-CONFLICT')
      expect(fs.readFileSync(documentPath, 'utf8')).toContain('W3-EXTERNAL-DISK-CONFLICT')
      expect(fs.readFileSync(documentPath, 'utf8')).not.toContain('W3-UNSAVED-EDITOR')
      expect(await isDirty(page)).toBe(true)
      assertOnlyCrLf(fs.readFileSync(documentPath))
      await expectNoRendererErrors(app)
    } finally {
      if (app) await closeDiscardingChanges(app).catch(() => {})
      run.cleanup()
    }
  })

  const launchAutoSavedF3 = async(
    profileName: string
  ): Promise<{
    readonly run: ReturnType<typeof createAuditRun>
    readonly documentPath: string
    readonly app: ElectronApplication
    readonly page: Page
  }> => {
    const run = createAuditRun()
    const documentPath = run.fixtures.F3.documentPath as string
    const profile = run.createIsolatedUserDataDir(profileName)
    try {
      const { app, page } = await launchElectron([documentPath], {
        ...run.launchOptionsForUserDataDir(profile),
        suppressErrorDialog: true
      })
      await waitForEditor(page)
      await waitForMenuReady(app)
      await recordDocumentIoObservations(app)
      await sendIpcToRenderer(app, 'mt::user-preference', {
        autoSave: true,
        autoSaveDelay: 100
      })
      await page.waitForTimeout(100)
      return { run, documentPath, app, page }
    } catch (error) {
      run.cleanup()
      throw error
    }
  }

  const autoSaveMarker = async(
    page: Page,
    app: ElectronApplication,
    documentPath: string,
    marker: string
  ): Promise<void> => {
    await appendInSourceMode(page, app, `\n${marker}\n`)
    await expect
      .poll(() => fs.readFileSync(documentPath, 'utf8'), { timeout: 15_000 })
      .toContain(marker)
    await expect.poll(() => isDirty(page), { timeout: 15_000 }).toBe(false)
  }

  const writeExternalChange = (documentPath: string): void => {
    const afterAutoSave = fs.readFileSync(documentPath, 'utf8')
    fs.writeFileSync(documentPath, `${afterAutoSave}\r\nW3-RACE-EXTERNAL-CONTENT\r\n`, 'utf8')
  }

  test('an external edit observed after auto-save is reloaded before the next edit is saved', async() => {
    test.setTimeout(60_000)
    const { run, documentPath, app, page } = await launchAutoSavedF3(
      'w3-autosave-external-observed'
    )

    try {
      await autoSaveMarker(page, app, documentPath, 'W3-RACE-AUTOSAVE')
      writeExternalChange(documentPath)

      await expect.poll(() => documentIoObservations(app), { timeout: 10_000 }).toContain('reload')
      await expect
        .poll(() => getMarkdownContent(page, app), { timeout: 10_000 })
        .toContain('W3-RACE-EXTERNAL-CONTENT')

      await autoSaveMarker(page, app, documentPath, 'W3-RACE-USER-NEXT-EDIT')
      expect(fs.readFileSync(documentPath, 'utf8')).toContain('W3-RACE-EXTERNAL-CONTENT')
      expect(await documentIoObservations(app)).not.toContain('conflict')
      await expectNoRendererErrors(app)
    } finally {
      await closeDiscardingChanges(app).catch(() => {})
      run.cleanup()
    }
  })

  test('an edit made before an external change is observed never overwrites it', async() => {
    test.setTimeout(60_000)
    const { run, documentPath, app, page } = await launchAutoSavedF3('w3-autosave-external-race')

    try {
      await autoSaveMarker(page, app, documentPath, 'W3-RACE-AUTOSAVE')
      writeExternalChange(documentPath)
      // The watcher holds events for a one-second stability window, so this
      // edit normally reaches auto-save before DocumentIO observes the change.
      await appendInSourceMode(page, app, '\nW3-RACE-USER-NEXT-EDIT\n')

      // Either outcome is safe: the save is refused as a conflict, or the
      // change was observed and reloaded first and the edit saved on top of it.
      await expect
        .poll(
          async() =>
            (await documentIoObservations(app)).includes('conflict') ||
            fs.readFileSync(documentPath, 'utf8').includes('W3-RACE-USER-NEXT-EDIT'),
          { timeout: 15_000 }
        )
        .toBe(true)

      const disk = fs.readFileSync(documentPath, 'utf8')
      expect(disk).toContain('W3-RACE-EXTERNAL-CONTENT')
      if ((await documentIoObservations(app)).includes('conflict')) {
        expect(disk).not.toContain('W3-RACE-USER-NEXT-EDIT')
        await expect(page.locator('.editor-notifications')).toBeVisible({ timeout: 10_000 })
        expect(await isDirty(page)).toBe(true)
      }
      await expectNoRendererErrors(app)
    } finally {
      await closeDiscardingChanges(app).catch(() => {})
      run.cleanup()
    }
  })

  test('own auto-saves produce no DocumentIO disk observation while a newer save is pending', async() => {
    test.setTimeout(90_000)
    const { run, documentPath, app, page } = await launchAutoSavedF3('w3-queued-own-save-events')

    try {
      await autoSaveMarker(page, app, documentPath, 'W3-QUEUED-SAVE-A')
      await autoSaveMarker(page, app, documentPath, 'W3-QUEUED-SAVE-B')

      // C waits longer than the watcher's stability window, so the coalesced
      // A/B event is handled while C is still unsaved.
      await sendIpcToRenderer(app, 'mt::user-preference', { autoSaveDelay: 3000 })
      await page.waitForTimeout(50)
      await appendInSourceMode(page, app, '\nW3-QUEUED-SAVE-C\n')
      await expect.poll(() => isDirty(page)).toBe(true)

      await expect
        .poll(() => fs.readFileSync(documentPath, 'utf8'), { timeout: 15_000 })
        .toContain('W3-QUEUED-SAVE-C')
      await expect.poll(() => isDirty(page), { timeout: 15_000 }).toBe(false)
      expect(await documentIoObservations(app)).toEqual([])
      await expect(page.locator('.editor-notifications')).not.toBeVisible()
      await expectNoRendererErrors(app)
    } finally {
      await closeDiscardingChanges(app).catch(() => {})
      run.cleanup()
    }
  })
})
