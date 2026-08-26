import path from 'node:path'
import { app } from 'electron'
import { TabTransferCoordinator } from '../tabTransfer'
import { ElectronTransferTransport, type TransferTargetFactory, type TransferWebContents } from '../tabTransfer/electron'
import { NodeCapsuleStorage, NodeTransferJournal } from '../tabTransfer/node'
import type { TabTransferResult, TransferAck, TransferCommand, TransferEndpoint, TransferIntent } from '../tabTransfer/types'

export interface TransferIpcMain {
  handle(channel: 'mt::workspace::tab-transfer', listener: (event: { readonly sender: TransferWebContents }, intent: TransferIntent) => Promise<TabTransferResult>): void
  handle(channel: 'mt::workspace::tab-transfer-ack', listener: (event: { readonly sender: TransferWebContents }, receipt: TransferReceipt) => TransferAck): void
  removeHandler?(channel: 'mt::workspace::tab-transfer' | 'mt::workspace::tab-transfer-ack'): void
}
export interface TransferReceipt { readonly transferId: string; readonly phase: TransferCommand['phase']; readonly operation: TransferCommand['operation']; readonly ack: TransferAck }

let createWindow: ((transferId: string, recovery: boolean) => Promise<TransferEndpoint>) | undefined
const targets: TransferTargetFactory = {
  createTarget: async(transferId, recovery) => {
    if (!createWindow) throw new Error('transfer target factory is not ready')
    return createWindow(transferId, recovery)
  }
}

export const configureTransferTargetFactory = (factory: (transferId: string, recovery: boolean) => Promise<TransferEndpoint>): void => { createWindow = factory }

export class TabTransferElectronAdapter {
  readonly transport = new ElectronTransferTransport(targets)
  readonly coordinator = new TabTransferCoordinator(
    new NodeTransferJournal(path.join(app.getPath('userData'), 'tab-transfer')),
    new NodeCapsuleStorage(path.join(app.getPath('userData'), 'tab-transfer')),
    this.transport
  )

  attach(webContents: TransferWebContents): () => void { return this.transport.attach(webContents) }
  endpointFor(webContents: TransferWebContents): TransferEndpoint | undefined { return this.transport.endpointFor(webContents) }
  async run(sender: TransferWebContents, intent: TransferIntent): Promise<TabTransferResult> {
    const source = this.transport.endpointForSender(sender)
    if (!source) return { status: 'rejected', reason: 'unauthenticated source endpoint' }
    // Sender window IDs are not an authority; bind both source endpoint fields
    // and the sealed capsule session to Electron's authenticated sender.
    return this.coordinator.run({ ...intent, source, capsule: { ...intent.capsule, sourceSessionId: source.sessionId } })
  }

  acknowledge(sender: TransferWebContents, receipt: TransferReceipt): TransferAck { return this.transport.acknowledge(sender, receipt) }
  async recover(): Promise<readonly TabTransferResult[]> { return this.coordinator.recover() }
}

export const registerTransferIpc = (ipc: TransferIpcMain, adapter: TabTransferElectronAdapter): (() => void) => {
  ipc.removeHandler?.('mt::workspace::tab-transfer'); ipc.removeHandler?.('mt::workspace::tab-transfer-ack')
  ipc.handle('mt::workspace::tab-transfer', (event, intent) => adapter.run(event.sender, intent))
  ipc.handle('mt::workspace::tab-transfer-ack', (event, receipt) => adapter.acknowledge(event.sender, receipt))
  return () => { ipc.removeHandler?.('mt::workspace::tab-transfer'); ipc.removeHandler?.('mt::workspace::tab-transfer-ack') }
}

export const createProductionTransferAdapter = (): TabTransferElectronAdapter => new TabTransferElectronAdapter()
