import type { TabTransferResult, TransferAck, TransferCapability, TransferCommand, TransferIntent, TransferRecoveryMessage } from 'main_renderer/tabTransfer'

export interface TransferReceipt {
  readonly transferId: string
  readonly phase: TransferCommand['phase']
  readonly operation: TransferCommand['operation']
  readonly ack: TransferAck
}

export type TransferPayloadResponse = { readonly durable: true; readonly payload: TransferIntent['capsule'] } | { readonly durable: false; readonly reason: string }

/** Renderer assembly sees only typed endpoint commands, never WAL/capsules. */
export const createElectronTransferPort = (): {
  run(intent: TransferIntent): Promise<TabTransferResult>
  bind(handler: (command: TransferCommand) => Promise<TransferAck>): () => void
  bindRecovery(handler: (message: TransferRecoveryMessage) => Promise<void>): () => void
  payload(transferId: string, capability?: TransferCapability): Promise<TransferPayloadResponse>
  ready(): Promise<boolean>
} => ({
  run: intent => window.electron.ipcRenderer.invoke('mt::workspace::tab-transfer', intent) as Promise<TabTransferResult>,
  bind: handler => {
    const listener = async(_event: unknown, command: unknown): Promise<void> => {
      const transferCommand = command as TransferCommand
      let ack: TransferAck
      try { ack = await handler(transferCommand) } catch (error) { ack = { status: 'nack', reason: error instanceof Error ? error.message : String(error) } }
      await window.electron.ipcRenderer.invoke('mt::workspace::tab-transfer-ack', {
        transferId: transferCommand.transferId, phase: transferCommand.phase, operation: transferCommand.operation, ack
      } satisfies TransferReceipt)
    }
    return window.electron.ipcRenderer.on('mt::workspace::transfer-command', listener)
  },
  bindRecovery: handler => window.electron.ipcRenderer.on('mt::workspace::transfer-recovery', async(_event, payload) => { await handler(payload as TransferRecoveryMessage) }),
  payload: (transferId, capability) => window.electron.ipcRenderer.invoke(
    'mt::workspace::tab-transfer-payload',
    { transferId, capability }
  ) as Promise<TransferPayloadResponse>,
  ready: () => window.electron.ipcRenderer.invoke('mt::workspace::tab-transfer-ready')
})
