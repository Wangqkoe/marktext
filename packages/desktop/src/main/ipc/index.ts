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
import { app, ipcMain } from 'electron'
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
import { registerNativeGestureIpc } from './nativeGesture'
import { ElectronNativeGestureAdapter } from '../nativeGesture/electron'
export { configureTransferTargetFactory } from './transfer'

let documentIoDispose: (() => void) | undefined
let documentIoAdapter: DocumentIoElectronAdapter | undefined
let crashDraftDispose: (() => void) | undefined
let crashDraftAdapter: CrashDraftElectronAdapter | undefined
let transferDispose: (() => void) | undefined
let transferAdapter: TabTransferElectronAdapter | undefined
let nativeGestureDispose: (() => void) | undefined
let nativeGestureAdapter: ElectronNativeGestureAdapter | undefined

/** T06 window/session assembly reuses this T04b adapter; it may not redefine its routes. */
export const getDocumentIoAdapter = (): DocumentIoElectronAdapter | undefined => documentIoAdapter
export const getCrashDraftAdapter = (): CrashDraftElectronAdapter | undefined => crashDraftAdapter
export const getTransferAdapter = (): TabTransferElectronAdapter | undefined => transferAdapter
export const getNativeGestureAdapter = (): ElectronNativeGestureAdapter | undefined => nativeGestureAdapter

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
  nativeGestureDispose?.()
  nativeGestureAdapter?.dispose()
  nativeGestureAdapter = new ElectronNativeGestureAdapter(() => {
    if (!transferAdapter) throw new Error('transfer adapter is unavailable')
    return transferAdapter
  })
  nativeGestureDispose = registerNativeGestureIpc(ipcMain, nativeGestureAdapter)
  app.once('before-quit', () => nativeGestureAdapter?.dispose())
}
