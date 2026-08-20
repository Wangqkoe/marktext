// Buffered editor state (persisted across window close/reopen).

import type { IFileState } from './files'
import type { LayoutState, LegacyLayoutState } from './preferences'

export interface BufferedEditorState {
  tabs: IFileState[]
  currentFileId?: string
  [key: string]: unknown
}

export interface BufferedProjectState {
  [key: string]: unknown
}

export type BufferedLayoutState = Partial<LayoutState> & LegacyLayoutState

export interface BufferedState {
  editor?: BufferedEditorState
  project?: BufferedProjectState
  layout?: BufferedLayoutState
  [key: string]: unknown
}
