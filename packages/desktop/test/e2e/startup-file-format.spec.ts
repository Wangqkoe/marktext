import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  closeDiscardingChanges,
  launchElectron,
  placeCaretInEditor,
  sendIpcToRenderer,
  waitForEditor,
  waitForMenuReady
} from './helpers'

// The file a window is launched with seeds the workspace before any
// File > Open. It must keep the encoding and line endings detected on load,
// exactly like a document opened later.

const launchWithFile = async(bytes: Buffer): Promise<{ app: ElectronApplication, page: Page, file: string }> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-startup-format-'))
  const file = path.join(dir, 'startup.md')
  fs.writeFileSync(file, bytes)
  const { app, page } = await launchElectron([file])
  await waitForEditor(page)
  await waitForMenuReady(app)
  await page.waitForTimeout(800)
  return { app, page, file }
}

const save = async(app: ElectronApplication, page: Page): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
  await page.waitForTimeout(1500)
}

test.describe('The launch file keeps its on-disk format', () => {
  test('CRLF line endings survive an unedited save', async() => {
    const bytes = Buffer.from('first line\r\n\r\nsecond line\r\n')
    const { app, page, file } = await launchWithFile(bytes)
    await save(app, page)
    expect(fs.readFileSync(file).equals(bytes)).toBe(true)
    await closeDiscardingChanges(app)
  })

  test('CRLF line endings survive an edited save', async() => {
    const { app, page, file } = await launchWithFile(Buffer.from('first line\r\n\r\nsecond line\r\n'))
    await placeCaretInEditor(page)
    await page.keyboard.type(' EDIT', { delay: 0 })
    await page.waitForTimeout(500)
    await save(app, page)
    const disk = fs.readFileSync(file, 'utf-8')
    expect(disk).toContain('EDIT')
    expect(disk.replace(/\r\n/g, '')).not.toContain('\n')
    await closeDiscardingChanges(app)
  })

  test('a GBK file is not re-encoded by an unedited save', async() => {
    // "中文内容测试" in GBK, repeated so encoding detection is confident.
    const line = Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xc4, 0xda, 0xc8, 0xdd, 0xb2, 0xe2, 0xca, 0xd4, 0x0d, 0x0a])
    const bytes = Buffer.concat(Array.from({ length: 20 }, () => line))
    const { app, page, file } = await launchWithFile(bytes)
    await save(app, page)
    expect(fs.readFileSync(file).equals(bytes)).toBe(true)
    await closeDiscardingChanges(app)
  })
})
