import path from 'node:path'
import { app } from 'electron'
import { TabTransferCoordinator } from '../tabTransfer'
import { ElectronTransferTransport, type TransferTargetFactory, type TransferWebContents } from '../tabTransfer/electron'
import { NodeCapsuleStorage, NodeTransferJournal } from '../tabTransfer/node'
import type { TabTransferResult, TransferAck, TransferCapability, TransferCommand, TransferEndpoint, TransferIntent } from '../tabTransfer/types'

export interface TransferIpcMain {
  handle(channel: 'mt::workspace::tab-transfer', listener: (event: { readonly sender: TransferWebContents }, intent: TransferIntent) => Promise<TabTransferResult>): void
  handle(channel: 'mt::workspace::tab-transfer-ack', listener: (event: { readonly sender: TransferWebContents }, receipt: TransferReceipt) => TransferAck): void
  handle(channel: 'mt::workspace::tab-transfer-payload', listener: (event: { readonly sender: TransferWebContents }, request: TransferPayloadRequest) => Promise<TransferPayloadResponse>): void
  handle(channel: 'mt::workspace::tab-transfer-ready', listener: (event: { readonly sender: TransferWebContents }) => boolean): void
  handle(channel: 'mt::workspace::tab-transfer-recovery-ready', listener: (event: { readonly sender: TransferWebContents }, transferId: string) => boolean): void
  removeHandler?(channel: 'mt::workspace::tab-transfer' | 'mt::workspace::tab-transfer-ack' | 'mt::workspace::tab-transfer-payload' | 'mt::workspace::tab-transfer-ready' | 'mt::workspace::tab-transfer-recovery-ready'): void
}
export interface TransferReceipt { readonly transferId: string; readonly phase: TransferCommand['phase']; readonly operation: TransferCommand['operation']; readonly ack: TransferAck }
export interface TransferPayloadRequest { readonly transferId: string; readonly capability?: TransferCapability }
export type TransferPayloadResponse = { readonly durable: true; readonly payload: TransferIntent['capsule'] } | { readonly durable: false; readonly reason: string }

let createWindow: ((transferId: string, recovery: boolean, reserved?: TransferEndpoint) => Promise<TransferEndpoint>) | undefined
const targets: TransferTargetFactory = {
  createTarget: async(transferId, recovery, reserved) => {
    if (!createWindow) throw new Error('transfer target factory is not ready')
    return createWindow(transferId, recovery, reserved)
  }
}

export const configureTransferTargetFactory = (factory: (transferId: string, recovery: boolean, reserved?: TransferEndpoint) => Promise<TransferEndpoint>): void => { createWindow = factory }

export class TabTransferElectronAdapter {
  readonly transport = new ElectronTransferTransport(targets)
  private readonly capsules = new NodeCapsuleStorage(path.join(app.getPath('userData'), 'tab-transfer'))
  readonly coordinator = new TabTransferCoordinator(
    new NodeTransferJournal(path.join(app.getPath('userData'), 'tab-transfer')),
    this.capsules,
    this.transport
  )

  attach(webContents: TransferWebContents, sessionId?: string, epoch?: number): () => void { return this.transport.attach(webContents, sessionId, epoch) }
  endpointFor(webContents: TransferWebContents): TransferEndpoint | undefined { return this.transport.endpointFor(webContents) }
  waitForReceiver(endpoint: TransferEndpoint): Promise<void> { return this.transport.waitForReceiver(endpoint) }
  async run(sender: TransferWebContents, intent: TransferIntent): Promise<TabTransferResult> {
    const source = this.transport.endpointForSender(sender)
    if (!source) return { status: 'rejected', reason: 'unauthenticated source endpoint' }
    // Sender window IDs are not an authority; bind both source endpoint fields
    // and the sealed capsule session to Electron's authenticated sender.
    return this.coordinator.run({ ...intent, source, capsule: { ...intent.capsule, sourceSessionId: source.sessionId } })
  }

  acknowledge(sender: TransferWebContents, receipt: TransferReceipt): TransferAck { return this.transport.acknowledge(sender, receipt) }
  recoveryMaterialized(sender: TransferWebContents, transferId: string): boolean { return this.transport.recoveryMaterialized(sender, transferId) }
  async payload(sender: TransferWebContents, request: TransferPayloadRequest): Promise<TransferPayloadResponse> {
    const endpoint = this.transport.endpointForSender(sender)
    if (!endpoint) return { durable: false, reason: 'unauthenticated transfer endpoint' }
    if (!request.capability) {
      if (!this.transport.authorizePreflight(sender, request.transferId)) return { durable: false, reason: 'invalid transfer preflight' }
    } else if (!this.transport.validCapability(request.capability, {
      transferId: request.transferId,
      operation: request.capability.operation,
      capsuleDigest: request.capability.capsuleDigest,
      documentRevision: request.capability.documentRevision,
      endpoint
    })) return { durable: false, reason: 'invalid transfer capability' }
    const stored = await this.capsules.get(request.transferId)
    if (!stored || (request.capability && stored.digest !== request.capability.capsuleDigest)) return { durable: false, reason: 'transfer payload is unavailable' }
    try { return { durable: true, payload: JSON.parse(new TextDecoder().decode(stored.bytes)) as TransferIntent['capsule'] } } catch { return { durable: false, reason: 'transfer payload is corrupt' } }
  }

  async recover(): Promise<readonly TabTransferResult[]> { return this.coordinator.recover() }
}

export const registerTransferIpc = (ipc: TransferIpcMain, adapter: TabTransferElectronAdapter): (() => void) => {
  ipc.removeHandler?.('mt::workspace::tab-transfer'); ipc.removeHandler?.('mt::workspace::tab-transfer-ack'); ipc.removeHandler?.('mt::workspace::tab-transfer-payload'); ipc.removeHandler?.('mt::workspace::tab-transfer-ready'); ipc.removeHandler?.('mt::workspace::tab-transfer-recovery-ready')
  ipc.handle('mt::workspace::tab-transfer', (event, intent) => adapter.run(event.sender, intent))
  ipc.handle('mt::workspace::tab-transfer-ack', (event, receipt) => adapter.acknowledge(event.sender, receipt))
  ipc.handle('mt::workspace::tab-transfer-payload', (event, request) => adapter.payload(event.sender, request))
  ipc.handle('mt::workspace::tab-transfer-ready', event => adapter.transport.receiverReady(event.sender))
  ipc.handle('mt::workspace::tab-transfer-recovery-ready', (event, transferId) => adapter.recoveryMaterialized(event.sender, transferId))
  return () => { ipc.removeHandler?.('mt::workspace::tab-transfer'); ipc.removeHandler?.('mt::workspace::tab-transfer-ack'); ipc.removeHandler?.('mt::workspace::tab-transfer-payload'); ipc.removeHandler?.('mt::workspace::tab-transfer-ready'); ipc.removeHandler?.('mt::workspace::tab-transfer-recovery-ready') }
}

export const createProductionTransferAdapter = (): TabTransferElectronAdapter => new TabTransferElectronAdapter()
