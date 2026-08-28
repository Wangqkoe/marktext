import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchElectron, typeIntoEditor, waitForMenuReady } from './helpers'

const openFixture = async(app: ElectronApplication, fixture: string): Promise<void> => {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [filePath] })
  }, fixture)
  await app.evaluate(({ BrowserWindow, Menu }) => {
    const win = BrowserWindow.getFocusedWindow()
    const fileMenu = Menu.getApplicationMenu()?.items.find((item) =>
      item.submenu?.items.some((entry) => entry.accelerator?.includes('O'))
    )
    const open = fileMenu?.submenu?.items.find((item) => item.accelerator?.includes('O'))
    if (!win || !open) throw new Error('File > Open is unavailable')
    open.click(undefined, win, win.webContents)
  })
}

test('opens a native File > Open selection into the focused workspace pane', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-native-file-open-'))
  const fixture = path.join(profile, 'native-file-open.md')
  const sentinel = 'STAB002_NATIVE_FILE_OPEN_SENTINEL'
  fs.writeFileSync(fixture, `# Native File Open\r\n\r\n${sentinel}\r\n`)
  const { app, page } = await launchElectron([], { userDataDir: profile, userDataDirOwnership: 'caller' })
  try {
    await waitForMenuReady(app)
    await openFixture(app, fixture)

    await expect.poll(() => page.evaluate(() => {
      const driver = window as unknown as {
        __mtWorkspaceSnapshot?: () => {
          projection: {
            focusedPaneId: string
            panes: Array<{ paneId: string; activeViewId: string; tabs: Array<{ viewId: string; title: string; fileKey?: string }> }>
          }
          documents: Array<{
            viewId: string
            fileKey?: string
            title: string
            markdown: string
            encoding: { encoding: string; isBom: boolean }
            lineEnding: string
            adjustLineEndingOnSave: boolean
            trailingNewline: string
          }>
        }
      }
      const snapshot = driver.__mtWorkspaceSnapshot?.()
      const pane = snapshot?.projection.panes.find((candidate) => candidate.paneId === snapshot.projection.focusedPaneId)
      const active = pane?.tabs.find((tab) => tab.viewId === pane.activeViewId)
      const document = snapshot?.documents.find((candidate) => candidate.viewId === active?.viewId)
      return {
        documentCount: snapshot?.documents.length,
        paneTabCount: pane?.tabs.length,
        activePath: document?.fileKey,
        activeTitle: document?.title,
        activeMarkdown: document?.markdown,
        encoding: document?.encoding,
        lineEnding: document?.lineEnding,
        adjustLineEndingOnSave: document?.adjustLineEndingOnSave,
        trailingNewline: document?.trailingNewline
      }
    }), { timeout: 5_000 }).toEqual({
      documentCount: 1,
      paneTabCount: 1,
      activePath: fixture,
      activeTitle: 'native-file-open.md',
      activeMarkdown: `# Native File Open\n\n${sentinel}\n`,
      encoding: { encoding: 'utf8', isBom: false },
      lineEnding: 'crlf',
      adjustLineEndingOnSave: true,
      trailingNewline: 'ensure-one'
    })
    await expect(page.locator('.editor-component')).toContainText(sentinel)
    await expect(page.locator('.tabs-container li.active')).toContainText('native-file-open.md')

    await typeIntoEditor(page, ' DIRTY_FIRST_DOCUMENT')
    const secondFixture = path.join(profile, 'second-native-file-open.md')
    const secondSentinel = 'STAB002_SECOND_NATIVE_FILE_OPEN_SENTINEL'
    fs.writeFileSync(secondFixture, `# Second native File Open\n\n${secondSentinel}\n`)
    await openFixture(app, secondFixture)
    await expect.poll(() => page.evaluate(() => {
      const driver = window as unknown as {
        __mtWorkspaceSnapshot?: () => {
          projection: { focusedPaneId: string; panes: Array<{ paneId: string; activeViewId: string }> }
          documents: Array<{ viewId: string; fileKey?: string; markdown: string }>
        }
      }
      const snapshot = driver.__mtWorkspaceSnapshot?.()
      const activeViewId = snapshot?.projection.panes.find((pane) => pane.paneId === snapshot.projection.focusedPaneId)?.activeViewId
      return {
        paths: snapshot?.documents.map((document) => document.fileKey).sort(),
        activePath: snapshot?.documents.find((document) => document.viewId === activeViewId)?.fileKey,
        firstMarkdown: snapshot?.documents.find((document) => document.fileKey?.split(/[\\/]/).at(-1) === 'native-file-open.md')?.markdown
      }
    }), { timeout: 5_000 }).toEqual({
      paths: [fixture, secondFixture].sort(),
      activePath: secondFixture,
      firstMarkdown: expect.stringContaining('DIRTY_FIRST_DOCUMENT')
    })

    await openFixture(app, fixture)
    await expect.poll(() => page.evaluate(() => {
      const driver = window as unknown as {
        __mtWorkspaceSnapshot?: () => {
          projection: { focusedPaneId: string; panes: Array<{ paneId: string; activeViewId: string }> }
          documents: Array<{ viewId: string; fileKey?: string }>
        }
      }
      const snapshot = driver.__mtWorkspaceSnapshot?.()
      const activeViewId = snapshot?.projection.panes.find((pane) => pane.paneId === snapshot.projection.focusedPaneId)?.activeViewId
      return {
        documentCount: snapshot?.documents.length,
        activePath: snapshot?.documents.find((document) => document.viewId === activeViewId)?.fileKey
      }
    }), { timeout: 5_000 }).toEqual({ documentCount: 2, activePath: fixture })
  } finally {
    const child = app.process()
    if (child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      const mainPid = await app.evaluate(() => process.pid)
      execFileSync('taskkill', ['/PID', String(mainPid), '/T', '/F'])
      await exited
    }
    fs.rmSync(profile, { recursive: true, force: true })
  }
})

test('opens a native File > Open selection in the currently focused split pane', async() => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-native-file-open-split-'))
  const first = path.join(profile, 'first.md')
  const second = path.join(profile, 'second.md')
  const focused = path.join(profile, 'focused.md')
  fs.writeFileSync(first, '# First\n')
  fs.writeFileSync(second, '# Second\n')
  fs.writeFileSync(focused, '# Focused pane\n')
  const { app, page } = await launchElectron([], { userDataDir: profile, userDataDirOwnership: 'caller' })
  try {
    await waitForMenuReady(app)
    await openFixture(app, first)
    await expect(page.locator('.tabs-container > li')).toHaveCount(1)
    await openFixture(app, second)
    await expect(page.locator('.tabs-container > li')).toHaveCount(2)
    const root = await page.locator('.editor-with-tabs').boundingBox()
    const tab = page.locator('.tabs-container > li').nth(1)
    const tabBox = await tab.boundingBox()
    if (!root || !tabBox) throw new Error('split controls are unavailable')
    await page.mouse.move(tabBox.x + Math.min(12, tabBox.width / 2), tabBox.y + tabBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(root.x + 4, root.y + root.height * 0.55, { steps: 8 })
    await page.mouse.up()
    await expect(page.locator('.workspace-pane')).toHaveCount(2)
    await page.locator('.workspace-pane').nth(1).click()
    await openFixture(app, focused)
    await expect.poll(() => page.evaluate(() => {
      const driver = window as unknown as {
        __mtWorkspaceSnapshot?: () => {
          projection: { focusedPaneId: string; panes: Array<{ paneId: string; tabs: Array<{ viewId: string }> }> }
          documents: Array<{ viewId: string; fileKey?: string }>
        }
      }
      const snapshot = driver.__mtWorkspaceSnapshot?.()
      const focusedPane = snapshot?.projection.panes.find((pane) => pane.paneId === snapshot.projection.focusedPaneId)
      const documentForView = new Map(snapshot?.documents.map((document) => [document.viewId, document.fileKey]))
      return {
        focusedPaths: focusedPane?.tabs.map((tab) => documentForView.get(tab.viewId)).sort(),
        otherPaths: snapshot?.projection.panes.filter((pane) => pane.paneId !== focusedPane?.paneId).flatMap((pane) => pane.tabs.map((tab) => documentForView.get(tab.viewId))).sort()
      }
    }), { timeout: 5_000 }).toEqual({ focusedPaths: [first, focused].sort(), otherPaths: [second] })
  } finally {
    const child = app.process()
    if (child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      const mainPid = await app.evaluate(() => process.pid)
      execFileSync('taskkill', ['/PID', String(mainPid), '/T', '/F'])
      await exited
    }
    fs.rmSync(profile, { recursive: true, force: true })
  }
})
