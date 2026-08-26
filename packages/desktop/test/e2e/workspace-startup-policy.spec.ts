import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchElectron } from './helpers'

test('does not load or overwrite legacy normal workspace data at no-target startup', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-no-restore-'))
  const legacyDir = path.join(userDataDir, 'editorStates')
  fs.mkdirSync(legacyDir, { recursive: true })
  const legacyPath = path.join(legacyDir, 'legacy_editor_buffer_store.json')
  const legacyBytes = Buffer.from(JSON.stringify({ tabs: [{ pathname: '/not-opened.md', markdown: 'LEGACY_WORKSPACE_CONTENT', isSaved: false }] }))
  fs.writeFileSync(legacyPath, legacyBytes)

  const { app, page } = await launchElectron([], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await expect(page.locator('.editor-with-tabs')).toBeVisible()
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect(page.locator('body')).not.toContainText('LEGACY_WORKSPACE_CONTENT')
    expect(fs.readFileSync(legacyPath)).toEqual(legacyBytes)
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('opens only explicit targets rather than a normal workspace snapshot', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-explicit-startup-'))
  const target = path.join(userDataDir, 'requested.md')
  fs.writeFileSync(target, '# Explicit startup target\n')
  const { app, page } = await launchElectron([target], { userDataDir, userDataDirOwnership: 'caller' })
  try {
    await expect(page.locator('.editor-component')).toContainText('Explicit startup target')
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
