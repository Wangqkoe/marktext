import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Return the translation key itself so the test can see which key a command uses.
vi.mock('@/i18n', () => ({ t: (key: string) => key }))
vi.mock('@/commands/utils', () => ({ isUpdatable: () => false }))

const { getCommandsWithDescriptions } = await import('@/commands')

interface Item {
  id?: string
  description?: string
  subcommands?: Item[]
}

const flatten = (items: Item[]): Item[] =>
  items.flatMap((item) => [item, ...flatten(item.subcommands ?? [])])

const localeDir = path.resolve(__dirname, '../../../static/locales')
const locales = fs
  .readdirSync(localeDir)
  .filter((name) => name.endsWith('.json') && !name.endsWith('.min.json'))
  .map((name) => ({ name, data: JSON.parse(fs.readFileSync(path.join(localeDir, name), 'utf-8')) }))

const lookup = (data: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], data)

describe('command palette descriptions', () => {
  it('names the export subcommands instead of showing their IDs', async() => {
    const commands = (await getCommandsWithDescriptions()) as Item[]
    const exportFile = commands.find((item) => item.id === 'file.export-file')
    expect(exportFile?.subcommands?.map((item) => item.description)).toEqual([
      'commands.file.exportFileHtml',
      'commands.file.exportFilePdf'
    ])
  })

  it('never shows a raw command ID as the label', async() => {
    const all = flatten((await getCommandsWithDescriptions()) as Item[])
    const raw = all.filter((item) => item.id && item.description === item.id).map((item) => item.id)
    expect(raw).toEqual([])
  })

  it('has every translation key a command uses in every locale', async() => {
    const keys = flatten((await getCommandsWithDescriptions()) as Item[])
      .map((item) => item.description ?? '')
      .filter((description) => description.startsWith('commands.'))
    expect(keys.length).toBeGreaterThan(0)
    const missing = locales.flatMap(({ name, data }) =>
      keys.filter((key) => typeof lookup(data, key) !== 'string').map((key) => `${name}: ${key}`)
    )
    expect(missing).toEqual([])
  })
})
