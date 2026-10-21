import fs from 'fs'
import path from 'path'
import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { closeDiscardingChanges, getMarkdownContent, launchWithMarkdown } from './helpers'

// A settings file written before the pandoc math keys, with both old switches on.
const DOC = String.raw`Inline \(e=mc^2\) and $a+b$.

\[
x^2 + y^2
\]

\[z\]

text before
\[
w
\]
text after
`

test.describe('Math preferences carried over from the old keys', () => {
  let app: ElectronApplication
  let page: Page
  let userDataDir: string

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(DOC, {
      preferences: { latexMathDelimiters: true, isGitlabCompatibilityEnabled: true }
    })
    app = launched.app
    page = launched.page
    userDataDir = launched.userDataDir
  })

  test.afterAll(async() => {
    if (app) await closeDiscardingChanges(app)
  })

  test('moves the old switches to texMathSingleBackslash and texMathGfm', async() => {
    const stored = JSON.parse(fs.readFileSync(path.join(userDataDir, 'preferences.json'), 'utf-8'))

    expect(stored).toMatchObject({ texMathSingleBackslash: true, texMathGfm: true })
    expect(stored).not.toHaveProperty('latexMathDelimiters')
    expect(stored).not.toHaveProperty('isGitlabCompatibilityEnabled')
  })

  test('shows a standalone \\[…\\] as a math block and one inside a paragraph as a formula', async() => {
    await expect(page.locator('.mu-math-block')).toHaveCount(2)
    // `\(e=mc^2\)`, `$a+b$` and the `\[w\]` that sits inside a paragraph.
    await expect(page.locator('.mu-paragraph .mu-math')).toHaveCount(3)
  })

  test('saves the document back unchanged', async() => {
    expect(await getMarkdownContent(page, app)).toBe(DOC)
  })
})
