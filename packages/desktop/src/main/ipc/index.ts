import { registerBootInfo } from './bootInfo'
import { registerFsHandlers } from './fs'
import { registerPathHandlers } from './paths'
import { registerRipgrepHandlers } from './ripgrep'
import { registerUploaderHandlers } from './uploader'
import { registerFontsHandlers } from './fonts'
import { registerShellHandlers } from './shell'
import { registerWindowHandlers } from './window'
import { registerCmdHandlers } from './cmd'
import { registerI18nHandlers } from './i18n'
import { ipcMain } from 'electron'
import {
  createProductionDocumentIoAdapter,
  registerDocumentIoIpc,
  type DocumentIoElectronAdapter
} from './documentIO'

let documentIoDispose: (() => void) | undefined
let documentIoAdapter: DocumentIoElectronAdapter | undefined

/** T06 window/session assembly reuses this T04b adapter; it may not redefine its routes. */
export const getDocumentIoAdapter = (): DocumentIoElectronAdapter | undefined => documentIoAdapter

export const registerSandboxIpcHandlers = (): void => {
  registerBootInfo()
  registerFsHandlers()
  registerPathHandlers()
  registerRipgrepHandlers()
  registerUploaderHandlers()
  registerFontsHandlers()
  registerShellHandlers()
  registerWindowHandlers()
  registerCmdHandlers()
  registerI18nHandlers()
  // T04b DocumentIO registration. T06 must add transfer/startup routes separately.
  documentIoDispose?.()
  documentIoAdapter?.dispose()
  documentIoAdapter = createProductionDocumentIoAdapter()
  documentIoDispose = registerDocumentIoIpc(ipcMain, documentIoAdapter)
}
