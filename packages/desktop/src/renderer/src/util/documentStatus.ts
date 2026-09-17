import type { WorkspaceStatus } from '@shared/workspace'

/** The four counts the status bar can cycle through, as produced by Muya's `wordCount`. */
export interface DocumentCounts {
  readonly word: number
  readonly paragraph: number
  readonly character: number
  readonly all: number
}

export const workspaceStatusFromCounts = (counts: DocumentCounts): WorkspaceStatus => ({
  wordCount: counts.word,
  paragraphCount: counts.paragraph,
  characterCount: counts.character,
  allCharacterCount: counts.all
})
