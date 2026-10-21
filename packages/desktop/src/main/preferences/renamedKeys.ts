// Preferences that took a new key, old → new. The loader drops every key the
// defaults no longer list, so without this an enabled old setting would be lost
// rather than carried over (#5446 renamed both).
export const RENAMED_PREFERENCE_KEYS: Readonly<Record<string, string>> = {
  latexMathDelimiters: 'texMathSingleBackslash',
  isGitlabCompatibilityEnabled: 'texMathGfm'
}

/**
 * The new-key values to write for a user's stored settings. The old value
 * wins even when the new key is present: electron-store fills the new key
 * with its schema default before the loader runs, and the loader deletes the
 * old key once this has run, so an old key is only ever seen once.
 */
export const carryOverRenamedPreferences = (
  userSetting: Record<string, unknown>,
  renamed: Readonly<Record<string, string>> = RENAMED_PREFERENCE_KEYS
): Record<string, unknown> => {
  const carried: Record<string, unknown> = {}
  for (const [oldKey, newKey] of Object.entries(renamed)) {
    if (oldKey in userSetting) {
      carried[newKey] = userSetting[oldKey]
    }
  }
  return carried
}
