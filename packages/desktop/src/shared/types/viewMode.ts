export interface ViewModeState {
  focus?: boolean
  sourceCode?: boolean
  typewriter?: boolean
}

export type ViewMode = keyof ViewModeState
