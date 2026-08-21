import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { clickMenuById, launchElectron } from './helpers'

// #3439 — invoking "New File" (sidebar context menu) on a COLLAPSED folder did
// nothing: the create <input> only renders inside the folder's expanded
// contents, and handleInputFocus guarded the expand behind `if (input.value)`,
// which is null while collapsed — so the folder never expanded and no input
// appeared.

// A collapsed sidebar folder's create-input is visible once the folder expands.
const visibleNewInput = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      Array.from(
        document.querySelectorAll('.side-bar-folder .folder-contents input.new-input')
      ).filter((el) => (el as HTMLElement).offsetParent !== null).length
  )

test.describe('New File on a collapsed folder (#3439)', () => {
  let app: ElectronApplication
  let page: Page
  let projectDir: string

  test.beforeAll(async() => {
    // Establish the project state this regression needs instead of relying on
    // a prior launch's persisted sidebar folder. The nested directory renders
    // as a collapsed tree-folder.
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-e2e-collapsed-folder-'))
    const nestedDir = path.join(projectDir, 'nested')
    fs.mkdirSync(nestedDir)
    fs.writeFileSync(path.join(nestedDir, 'note.md'), '# Nested\n', 'utf-8')
    const launched = await launchElectron([projectDir])
    app = launched.app
    page = launched.page
    if (!(await page.locator('.side-bar').isVisible())) {
      await clickMenuById(app, 'sideBarMenuItem')
    }
    await expect(page.locator('.side-bar')).toBeVisible()
    await page.waitForSelector('.side-bar-folder .folder-name', { timeout: 10000 })

    // Replace the sidebar context-menu popup handler so it does NOT open a real
    // native menu (which would hang the headless run); instead resolve the
    // template to the "New File" item and dispatch its click straight back to
    // the renderer, driving the real context-menu → bus → store → tree-folder
    // path.
    await app.evaluate(({ ipcMain }) => {
      const findId = (items: Array<{ id?: string, submenu?: unknown }>): string | null => {
        for (const it of items || []) {
          if (it?.id && String(it.id).startsWith('newFileMenuItem')) return it.id
          if (it?.submenu) {
            const r = findId(it.submenu as Array<{ id?: string }>)
            if (r) return r
          }
        }
        return null
      }
      ipcMain.removeAllListeners('mt::menu::popup')
      ipcMain.on('mt::menu::popup', (event, template) => {
        const id = findId(template as Array<{ id?: string }>)
        if (id) {
          setTimeout(() => {
            try {
              event.sender.send('mt::menu::click', { id })
            } catch { /* window gone */ }
          }, 30)
        }
      })
    })
  })

  test.afterAll(async() => {
    if (app) await app.close()
    if (projectDir) fs.rmSync(projectDir, { recursive: true, force: true })
  })

  test('the create input appears when New File targets a collapsed folder', async() => {
    // No tree-folder create input is rendered initially.
    expect(await visibleNewInput(page)).toBe(0)

    // Right-click the first (collapsed) sub-folder → sets it active + pops the
    // context menu, which the main-side hook resolves to "New File".
    await page.evaluate(() => {
      const fn = document.querySelector('.side-bar-folder .folder-name') as HTMLElement | null
      if (!fn) throw new Error('no sub-folder in sidebar')
      const r = fn.getBoundingClientRect()
      fn.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: r.left + 5,
          clientY: r.top + 5
        })
      )
    })

    // The targeted folder must expand and reveal its create input.
    await expect.poll(() => visibleNewInput(page), { timeout: 6000 }).toBeGreaterThanOrEqual(1)

    await page.keyboard.press('Escape')
  })
})
