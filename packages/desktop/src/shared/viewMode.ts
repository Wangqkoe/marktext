import type { ViewMode } from './types/viewMode'

export const isViewMode = (mode: unknown): mode is ViewMode =>
  mode === 'focus' || mode === 'sourceCode' || mode === 'typewriter'
