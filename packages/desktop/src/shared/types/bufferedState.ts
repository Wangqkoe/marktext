// Buffered editor state (persisted across window close/reopen).

import type { IFileState } from './files'
import type { LegacyLayoutState, SidebarView } from './preferences'

export interface BufferedEditorState {
  tabs: IFileState[]
  currentFileId?: string
  [key: string]: unknown
}

export interface BufferedProjectState {
  [key: string]: unknown
}

export interface BufferedLayoutState extends LegacyLayoutState {
  sidebarView?: SidebarView
  sidebarVisible?: boolean
  sidebarWidth?: number
  tabBarVisible?: boolean
}

export interface BufferedState {
  editor?: BufferedEditorState
  project?: BufferedProjectState
  layout?: BufferedLayoutState
  [key: string]: unknown
}
