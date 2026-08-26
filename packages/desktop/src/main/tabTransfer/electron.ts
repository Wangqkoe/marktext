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
  createTarget(transferId: string, recovery: boolean, reserved?: TransferEndpoint): Promise<TransferEndpoint>
}

interface RegisteredEndpoint { readonly endpoint: TransferEndpoint; readonly webContents: TransferWebContents }
interface AwaitedAck { readonly endpoint: TransferEndpoint; readonly capability?: TransferCapability; readonly resolve: (ack: TransferAck) => void; readonly timer: ReturnType<typeof setTimeout> }

/** Electron delivery adapter. Window ids are never accepted from IPC payloads. */
export class ElectronTransferTransport implements TransferTransport {
  private readonly bySender = new Map<string, RegisteredEndpoint>()
  private readonly capabilities = new Map<string, TransferCapability>()
  private readonly awaiting = new Map<string, AwaitedAck>()
  private readonly detachers = new Map<string, () => void>()
  private nextEpoch = 1

  constructor(private readonly targets: TransferTargetFactory) {}

  attach(webContents: TransferWebContents, sessionId = `editor-session:${randomUUID()}`, epoch = this.nextEpoch++): () => void {
    const sender = String(webContents.id)
    this.detach(sender)
    const registered: RegisteredEndpoint = { endpoint: { sessionId, epoch }, webContents }
    this.bySender.set(sender, registered)
    const detach = (): void => {
      if (this.bySender.get(sender) !== registered) return
      this.bySender.delete(sender)
      this.detachers.delete(sender)
      webContents.removeListener?.('destroyed', detach)
      webContents.removeListener?.('did-start-navigation', detach)
    }
    this.detachers.set(sender, detach)
    webContents.on?.('destroyed', detach)
    webContents.on?.('did-start-navigation', detach)
    return detach
  }

  endpointFor(webContents: TransferWebContents): TransferEndpoint | undefined { return this.bySender.get(String(webContents.id))?.endpoint }
  endpointForSender(sender: TransferWebContents): TransferEndpoint | undefined { return this.endpointFor(sender) }

  createTarget(transferId: string): Promise<TransferEndpoint> { return this.targets.createTarget(transferId, false) }
  async reserveRecoveryWindow(_transferId: string): Promise<TransferEndpoint> {
    // Reservation is intentionally inert: it cannot authenticate or receive a
    // command until the T05 journal has durably migrated ownership.
    return { sessionId: `recovery-reservation:${randomUUID()}`, epoch: this.nextEpoch++ }
  }

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
      this.awaiting.set(key, { endpoint: command.endpoint, ...(command.capability ? { capability: command.capability } : {}), resolve, timer })
      try { registered.webContents.send('mt::workspace::transfer-command', command) } catch { clearTimeout(timer); this.awaiting.delete(key); resolve({ status: 'nack', reason: 'endpoint delivery failed' }) }
    })
  }

  acknowledge(sender: TransferWebContents, receipt: { readonly transferId: string; readonly phase: TransferCommand['phase']; readonly operation: TransferCommand['operation']; readonly ack: TransferAck }): TransferAck {
    const registered = this.bySender.get(String(sender.id))
    if (!registered) return { status: 'nack', reason: 'unauthenticated endpoint' }
    const key = `${receipt.transferId}:${receipt.phase}:${receipt.operation}:${registered.endpoint.sessionId}:${registered.endpoint.epoch}`
    const waiting = this.awaiting.get(key)
    if (!waiting || waiting.endpoint !== registered.endpoint) return { status: 'nack', reason: 'stale transfer acknowledgement' }
    clearTimeout(waiting.timer); this.awaiting.delete(key)
    if (waiting.capability) this.capabilities.delete(waiting.capability.id)
    waiting.resolve(receipt.ack)
    return { status: 'ok' }
  }

  async materializeRecoveryWindow(endpoint: TransferEndpoint, payload: TransferRecoveryPayload): Promise<void> {
    if (!this.authenticate(endpoint)) await this.targets.createTarget('recovery', true, endpoint)
    const registered = [...this.bySender.values()].find(item => item.endpoint.sessionId === endpoint.sessionId && item.endpoint.epoch === endpoint.epoch)
    if (!registered) throw new Error('recovery endpoint is unavailable')
    registered.webContents.send('mt::workspace::transfer-recovery', payload)
  }

  validCapability(capability: TransferCapability, command: Pick<TransferCommand, 'transferId' | 'operation' | 'capsuleDigest' | 'documentRevision' | 'endpoint'>): boolean {
    const issued = this.capabilities.get(capability.id)
    if (!issued || issued.transferId !== command.transferId || issued.operation !== command.operation || issued.capsuleDigest !== command.capsuleDigest || issued.documentRevision !== command.documentRevision) return false
    const endpoint = issued.role === 'source' ? issued.source : issued.target
    if (endpoint.sessionId !== command.endpoint.sessionId || endpoint.epoch !== command.endpoint.epoch) return false
    return true
  }

  private detach(sender: string): void { this.detachers.get(sender)?.() }
}
