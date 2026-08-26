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
import {
  createProductionCrashDraftAdapter,
  registerCrashDraftIpc,
  type CrashDraftElectronAdapter
} from './crashDraft'
import { createProductionTransferAdapter, registerTransferIpc, type TabTransferElectronAdapter } from './transfer'
export { configureTransferTargetFactory } from './transfer'

let documentIoDispose: (() => void) | undefined
let documentIoAdapter: DocumentIoElectronAdapter | undefined
let crashDraftDispose: (() => void) | undefined
let crashDraftAdapter: CrashDraftElectronAdapter | undefined
let transferDispose: (() => void) | undefined
let transferAdapter: TabTransferElectronAdapter | undefined

/** T06 window/session assembly reuses this T04b adapter; it may not redefine its routes. */
export const getDocumentIoAdapter = (): DocumentIoElectronAdapter | undefined => documentIoAdapter
export const getCrashDraftAdapter = (): CrashDraftElectronAdapter | undefined => crashDraftAdapter
export const getTransferAdapter = (): TabTransferElectronAdapter | undefined => transferAdapter

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
  crashDraftDispose?.()
  crashDraftAdapter = createProductionCrashDraftAdapter()
  crashDraftDispose = registerCrashDraftIpc(ipcMain, crashDraftAdapter)
  transferDispose?.()
  transferAdapter = createProductionTransferAdapter()
  transferDispose = registerTransferIpc(ipcMain, transferAdapter)
}
