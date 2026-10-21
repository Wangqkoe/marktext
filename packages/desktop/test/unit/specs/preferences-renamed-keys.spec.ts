import { describe, expect, it } from 'vitest'
import { carryOverRenamedPreferences } from '../../../src/main/preferences/renamedKeys'
import schema from '../../../src/main/preferences/schema.json'
import defaults from '../../../static/preference.json'

describe('renamed preferences', () => {
  it('carries the LaTeX delimiters and GitLab settings over to the pandoc math keys', () => {
    expect(
      carryOverRenamedPreferences({ latexMathDelimiters: true, isGitlabCompatibilityEnabled: true })
    ).toEqual({ texMathSingleBackslash: true, texMathGfm: true })
    expect(
      carryOverRenamedPreferences({ latexMathDelimiters: false, isGitlabCompatibilityEnabled: false })
    ).toEqual({ texMathSingleBackslash: false, texMathGfm: false })
  })

  it('keeps a value already stored under the new key', () => {
    expect(
      carryOverRenamedPreferences({ latexMathDelimiters: true, texMathSingleBackslash: false })
    ).toEqual({})
  })

  it('writes nothing for a settings file without the old keys', () => {
    expect(carryOverRenamedPreferences({ texMathDollars: true })).toEqual({})
  })

  it('maps only to keys the schema and defaults know, and from keys they no longer list', () => {
    const renamed = { latexMathDelimiters: 'texMathSingleBackslash', isGitlabCompatibilityEnabled: 'texMathGfm' }
    for (const [oldKey, newKey] of Object.entries(renamed)) {
      expect(schema).not.toHaveProperty(oldKey)
      expect(defaults).not.toHaveProperty(oldKey)
      expect(schema).toHaveProperty(newKey)
      expect(defaults).toHaveProperty(newKey)
    }
  })
})
