// Buffered editor state (persisted across window close/reopen).

import type { IFileState } from './files'
import type { LayoutState } from './layout'

export interface BufferedEditorState {
  tabs: IFileState[]
  currentFileId?: string
  [key: string]: unknown
}

export interface BufferedProjectState {
  [key: string]: unknown
}

export interface BufferedState {
  editor?: BufferedEditorState
  project?: BufferedProjectState
  layout?: Partial<LayoutState>
  [key: string]: unknown
}
