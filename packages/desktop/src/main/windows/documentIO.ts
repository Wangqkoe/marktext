import { randomUUID } from 'crypto'
import type { DocumentIoElectronAdapter, DocumentIoWebContents } from '../ipc/documentIO'

/** Editor-window assembly point for the T04b authenticated DocumentIO endpoint. */
export const attachEditorDocumentIo = (
  adapter: DocumentIoElectronAdapter | undefined,
  webContents: DocumentIoWebContents
): (() => void) => adapter?.attach(webContents, `editor-session:${randomUUID()}`) ?? (() => {})
