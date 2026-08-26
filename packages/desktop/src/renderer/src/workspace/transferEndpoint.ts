import type { TransferAck, TransferCommand, TransferIntent } from 'main_renderer/tabTransfer'

export interface TransferReceipt {
  readonly transferId: string
  readonly phase: TransferCommand['phase']
  readonly operation: TransferCommand['operation']
  readonly ack: TransferAck
}

/** Renderer assembly sees only typed endpoint commands, never WAL/capsules. */
export const createElectronTransferPort = (): {
  run(intent: TransferIntent): Promise<unknown>
  bind(handler: (command: TransferCommand) => Promise<TransferAck>): () => void
} => ({
  run: intent => window.electron.ipcRenderer.invoke('mt::workspace::tab-transfer', intent),
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
  }
})
