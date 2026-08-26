import { randomUUID } from 'node:crypto'
import type {
  TransferAck,
  TransferCapability,
  TransferCommand,
  TransferEndpoint,
  TransferRecoveryPayload,
  TransferTransport
} from './types'

export interface TransferWebContents {
  readonly id: number
  isDestroyed?(): boolean
  send(channel: 'mt::workspace::transfer-command' | 'mt::workspace::transfer-recovery', payload: unknown): void
  on?(event: 'destroyed' | 'did-start-navigation', listener: () => void): void
  removeListener?(event: 'destroyed' | 'did-start-navigation', listener: () => void): void
}

export interface TransferTargetFactory {
  createTarget(transferId: string, recovery: boolean): Promise<TransferEndpoint>
}

interface RegisteredEndpoint { readonly endpoint: TransferEndpoint; readonly webContents: TransferWebContents }
interface AwaitedAck { readonly endpoint: TransferEndpoint; readonly resolve: (ack: TransferAck) => void; readonly timer: ReturnType<typeof setTimeout> }

/** Electron delivery adapter. Window ids are never accepted from IPC payloads. */
export class ElectronTransferTransport implements TransferTransport {
  private readonly bySender = new Map<string, RegisteredEndpoint>()
  private readonly capabilities = new Map<string, TransferCapability>()
  private readonly awaiting = new Map<string, AwaitedAck>()
  private nextEpoch = 1

  constructor(private readonly targets: TransferTargetFactory) {}

  attach(webContents: TransferWebContents, sessionId = `editor-session:${randomUUID()}`): () => void {
    const sender = String(webContents.id)
    this.detach(sender)
    const registered: RegisteredEndpoint = { endpoint: { sessionId, epoch: this.nextEpoch++ }, webContents }
    this.bySender.set(sender, registered)
    const detach = (): void => {
      if (this.bySender.get(sender) !== registered) return
      this.bySender.delete(sender)
      webContents.removeListener?.('destroyed', detach)
      webContents.removeListener?.('did-start-navigation', detach)
    }
    webContents.on?.('destroyed', detach)
    webContents.on?.('did-start-navigation', detach)
    return detach
  }

  endpointFor(webContents: TransferWebContents): TransferEndpoint | undefined { return this.bySender.get(String(webContents.id))?.endpoint }
  endpointForSender(sender: TransferWebContents): TransferEndpoint | undefined { return this.endpointFor(sender) }

  createTarget(transferId: string): Promise<TransferEndpoint> { return this.targets.createTarget(transferId, false) }
  reserveRecoveryWindow(transferId: string): Promise<TransferEndpoint> { return this.targets.createTarget(transferId, true) }
  authenticate(endpoint: TransferEndpoint): boolean {
    return [...this.bySender.values()].some(registered => registered.endpoint.sessionId === endpoint.sessionId && registered.endpoint.epoch === endpoint.epoch && !registered.webContents.isDestroyed?.())
  }

  issueCapability(input: Omit<TransferCapability, 'id'>): TransferCapability {
    const capability = { ...input, id: randomUUID() }
    this.capabilities.set(capability.id, capability)
    return capability
  }

  async command(command: TransferCommand, timeout: { readonly timeoutMs: number; readonly retryCadenceMs: number }): Promise<TransferAck> {
    const registered = [...this.bySender.values()].find(item => item.endpoint.sessionId === command.endpoint.sessionId && item.endpoint.epoch === command.endpoint.epoch)
    if (!registered || !this.authenticate(command.endpoint)) return { status: 'nack', reason: 'unauthenticated endpoint epoch' }
    if (command.capability && !this.validCapability(command.capability, command)) return { status: 'nack', reason: 'invalid transfer capability' }
    const key = `${command.transferId}:${command.phase}:${command.operation}:${command.endpoint.sessionId}:${command.endpoint.epoch}`
    return new Promise<TransferAck>(resolve => {
      const timer = setTimeout(() => { this.awaiting.delete(key); resolve({ status: 'timeout' }) }, timeout.timeoutMs)
      this.awaiting.set(key, { endpoint: command.endpoint, resolve, timer })
      try { registered.webContents.send('mt::workspace::transfer-command', command) } catch { clearTimeout(timer); this.awaiting.delete(key); resolve({ status: 'nack', reason: 'endpoint delivery failed' }) }
    })
  }

  acknowledge(sender: TransferWebContents, receipt: { readonly transferId: string; readonly phase: TransferCommand['phase']; readonly operation: TransferCommand['operation']; readonly ack: TransferAck }): TransferAck {
    const registered = this.bySender.get(String(sender.id))
    if (!registered) return { status: 'nack', reason: 'unauthenticated endpoint' }
    const key = `${receipt.transferId}:${receipt.phase}:${receipt.operation}:${registered.endpoint.sessionId}:${registered.endpoint.epoch}`
    const waiting = this.awaiting.get(key)
    if (!waiting || waiting.endpoint !== registered.endpoint) return { status: 'nack', reason: 'stale transfer acknowledgement' }
    clearTimeout(waiting.timer); this.awaiting.delete(key); waiting.resolve(receipt.ack)
    return { status: 'ok' }
  }

  async materializeRecoveryWindow(endpoint: TransferEndpoint, payload: TransferRecoveryPayload): Promise<void> {
    const registered = [...this.bySender.values()].find(item => item.endpoint.sessionId === endpoint.sessionId && item.endpoint.epoch === endpoint.epoch)
    if (!registered) throw new Error('recovery endpoint is unavailable')
    registered.webContents.send('mt::workspace::transfer-recovery', payload)
  }

  private validCapability(capability: TransferCapability, command: TransferCommand): boolean {
    const issued = this.capabilities.get(capability.id)
    if (!issued || issued !== capability || issued.transferId !== command.transferId || issued.operation !== command.operation || issued.capsuleDigest !== command.capsuleDigest || issued.documentRevision !== command.documentRevision) return false
    const endpoint = issued.role === 'source' ? issued.source : issued.target
    if (endpoint.sessionId !== command.endpoint.sessionId || endpoint.epoch !== command.endpoint.epoch) return false
    this.capabilities.delete(capability.id)
    return true
  }

  private detach(sender: string): void { this.bySender.get(sender)?.webContents.removeListener?.('destroyed', () => {}); this.bySender.delete(sender) }
}
