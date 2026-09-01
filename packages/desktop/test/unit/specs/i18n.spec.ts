import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'

const localeDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../static/locales')
const supportedLocales = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pt', 'tr', 'zh-CN', 'zh-TW'] as const

const desktopNavigationKeys = [
  'menu.file.closeFolder',
  'contextMenu.sideBar.closeFolder',
  'contextMenu.tabs.openThisFolder',
  'contextMenu.tabs.closeThisFolder',
  'preferences.general.window.titleBarStyle.concise',
  'sideBar.inlineSearch.show',
  'sideBar.inlineSearch.hide',
  'sideBar.inlineSearch.filesPlaceholder',
  'sideBar.inlineSearch.outlinePlaceholder',
  'sideBar.inlineSearch.filesNoResults',
  'sideBar.inlineSearch.outlineNoResults',
  'sideBar.inlineSearch.filesInputLabel',
  'sideBar.inlineSearch.outlineInputLabel'
] as const

const getMessage = (messages: Record<string, unknown>, key: string): unknown => {
  return key.split('.').reduce<unknown>((value, segment) => {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)[segment]
      : undefined
  }, messages)
}

const loadLocale = (locale: (typeof supportedLocales)[number]): Record<string, unknown> => {
  return JSON.parse(readFileSync(resolve(localeDirectory, `${locale}.json`), 'utf8'))
}

describe('desktop navigation locale scaffold', () => {
  it.each(supportedLocales)('defines every new UI message in %s', (locale) => {
    const messages = loadLocale(locale)

    for (const key of desktopNavigationKeys) {
      expect(getMessage(messages, key), `${locale}: ${key}`).toEqual(expect.any(String))
      expect((getMessage(messages, key) as string).trim(), `${locale}: ${key}`).not.toBe('')
    }
  })

  it.each(supportedLocales)('keeps the stable Files filter tokens in %s', (locale) => {
    const placeholder = getMessage(
      loadLocale(locale),
      'sideBar.inlineSearch.filesPlaceholder'
    ) as string

    expect(placeholder.match(/file:/g)).toHaveLength(1)
    expect(placeholder.match(/folder:/g)).toHaveLength(1)
  })
})

interface MockI18nUtils {
  loadTranslations: Mock
}

// Window.i18nUtils is required in the runtime contextBridge typing, but in
// this unit test we install a mock with `vi.fn` and remove it between specs.
const win = window as unknown as { i18nUtils?: MockI18nUtils }

describe('renderer i18n language loading', () => {
  beforeEach(() => {
    vi.resetModules()
    win.i18nUtils = {
      loadTranslations: vi.fn((locale: string) => ({
        locale,
        menu: {
          file: {
            file: 'File'
          }
        }
      }))
    }
  })

  afterEach(() => {
    delete win.i18nUtils
  })

  it('does not reload the default English locale', async() => {
    const { setLanguage, getCurrentLanguage } = await import('../../../src/renderer/src/i18n')

    setLanguage('en')

    expect(win.i18nUtils!.loadTranslations).not.toHaveBeenCalled()
    expect(getCurrentLanguage()).to.equal('en')
  })

  it('loads an unavailable locale only once', async() => {
    const { setLanguage } = await import('../../../src/renderer/src/i18n')

    setLanguage('zh-CN')
    setLanguage('zh-CN')

    expect(win.i18nUtils!.loadTranslations).toHaveBeenCalledTimes(1)
    expect(win.i18nUtils!.loadTranslations).toHaveBeenCalledWith('zh-CN')
  })
})

// Issue #4046: exporting HTML/PDF surfaced an "Unexpected renderer process
// error" — a vue-i18n message-compiler SyntaxError (code 9,
// NOT_ALLOW_NEST_PLACEHOLDER) thrown while lazily compiling a translation whose
// value contained a nested placeholder (e.g. literal `{{type}}`). A single
// malformed translation must degrade to raw text, never crash the renderer.
describe('renderer i18n malformed-message resilience (issue #4046)', () => {
  beforeEach(() => {
    vi.resetModules()
    win.i18nUtils = { loadTranslations: vi.fn() }
  })

  afterEach(() => {
    delete win.i18nUtils
  })

  interface TestComposer {
    setLocaleMessage: (locale: string, message: Record<string, unknown>) => void
    locale: { value: string }
    t: (key: string, named?: Record<string, unknown>) => string
  }

  it('does not throw when a registered message contains a nested placeholder', async() => {
    const { i18n } = await import('../../../src/renderer/src/i18n')
    const composer = i18n.global as unknown as TestComposer

    composer.setLocaleMessage('xx', { export: { failed: 'Failed {{type}} export' } })
    composer.locale.value = 'xx'

    expect(() => composer.t('export.failed', { type: 'PDF' })).not.toThrow()
    expect(composer.t('export.failed', { type: 'PDF' })).toBe('Failed {{type}} export')
  })

  it('still interpolates well-formed messages', async() => {
    const { i18n } = await import('../../../src/renderer/src/i18n')
    const composer = i18n.global as unknown as TestComposer

    composer.setLocaleMessage('xx', { greeting: 'Hello {name}' })
    composer.locale.value = 'xx'

    expect(composer.t('greeting', { name: 'World' })).toBe('Hello World')
  })
})
