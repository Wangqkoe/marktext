import { randomUUID } from 'node:crypto'
import type {
  TransferAck,
  TransferCapability,
  TransferCommand,
  TransferEndpoint,
  NativeExternalReleasePoint,
  TransferRecoveryMessage,
  TransferRecoveryPayload,
  TransferTransport
} from './types'

export interface TransferWebContents {
  readonly id: number
  isDestroyed?(): boolean
  send(channel: 'mt::workspace::transfer-command' | 'mt::workspace::transfer-recovery', payload: unknown): void
  on?(event: 'destroyed', listener: () => void): void
  on?(event: 'did-start-navigation', listener: (details: { readonly isMainFrame?: boolean; readonly isSameDocument?: boolean }) => void): void
  removeListener?(event: 'destroyed', listener: () => void): void
  removeListener?(event: 'did-start-navigation', listener: (details: { readonly isMainFrame?: boolean; readonly isSameDocument?: boolean }) => void): void
}

export interface TransferTargetFactory {
  createTarget(transferId: string, recovery: boolean, reserved?: TransferEndpoint, releasePoint?: NativeExternalReleasePoint): Promise<TransferEndpoint>
}

interface RegisteredEndpoint { readonly endpoint: TransferEndpoint; readonly webContents: TransferWebContents }
interface AwaitedAck { readonly endpoint: TransferEndpoint; readonly capability?: TransferCapability; readonly resolve: (ack: TransferAck) => void; readonly timer: ReturnType<typeof setTimeout> }
interface AwaitedRecoveryMaterialization { readonly endpoint: TransferEndpoint; readonly resolve: () => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }

const holdsSourceReleaseForT06Test = (command: TransferCommand): boolean =>
  process.env.PERF_TESTING === 'true' &&
  process.env.MARKTEXT_T06_TRANSFER_FAULT === 'hold-source-release' &&
  command.phase === 'source-released' && command.operation === 'release'

/** Electron delivery adapter. Window ids are never accepted from IPC payloads. */
export class ElectronTransferTransport implements TransferTransport {
  private readonly bySender = new Map<string, RegisteredEndpoint>()
  private readonly capabilities = new Map<string, TransferCapability>()
  private readonly awaiting = new Map<string, AwaitedAck>()
  private readonly detachers = new Map<string, () => void>()
  private readonly ready = new Set<string>()
  private readonly readyWaiters = new Map<string, { readonly resolve: () => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }>()
  private readonly recoveryMaterializations = new Map<string, AwaitedRecoveryMaterialization>()
  private nextEpoch = 1

  constructor(private readonly targets: TransferTargetFactory) {}

  attach(webContents: TransferWebContents, sessionId = `editor-session:${randomUUID()}`, epoch = this.nextEpoch++): () => void {
    const sender = String(webContents.id)
    const previous = this.bySender.get(sender)
    // Reservation ownership can replace an already-mounted renderer without a
    // navigation. Preserve only that sender's proven ready state; navigation
    // detaches first and therefore cannot carry readiness across documents.
    const receiverWasReady = !!previous && this.ready.has(endpointKey(previous.endpoint))
    this.detach(sender)
    const registered: RegisteredEndpoint = { endpoint: { sessionId, epoch }, webContents }
    this.bySender.set(sender, registered)
    if (receiverWasReady) this.ready.add(endpointKey(registered.endpoint))
    const detach = (): void => {
      if (this.bySender.get(sender) !== registered) return
      this.bySender.delete(sender)
      const key = endpointKey(registered.endpoint)
      this.ready.delete(key)
      const waiter = this.readyWaiters.get(key)
      if (waiter) { clearTimeout(waiter.timer); waiter.reject(new Error('transfer endpoint navigated before receiver bound')); this.readyWaiters.delete(key) }
      for (const [materializationKey, materialization] of this.recoveryMaterializations) {
        if (!sameEndpoint(materialization.endpoint, registered.endpoint)) continue
        clearTimeout(materialization.timer)
        materialization.reject(new Error('transfer recovery endpoint navigated before materialization'))
        this.recoveryMaterializations.delete(materializationKey)
      }
      this.detachers.delete(sender)
      webContents.removeListener?.('destroyed', detach)
      webContents.removeListener?.('did-start-navigation', navigation)
    }
    const navigation = (details: { readonly isMainFrame?: boolean; readonly isSameDocument?: boolean }): void => {
      if (details.isMainFrame && !details.isSameDocument) detach()
    }
    this.detachers.set(sender, detach)
    webContents.on?.('destroyed', detach)
    webContents.on?.('did-start-navigation', navigation)
    return detach
  }

  endpointFor(webContents: TransferWebContents): TransferEndpoint | undefined { return this.bySender.get(String(webContents.id))?.endpoint }
  endpointForSender(sender: TransferWebContents): TransferEndpoint | undefined { return this.endpointFor(sender) }

  receiverReady(sender: TransferWebContents): boolean {
    const endpoint = this.endpointForSender(sender)
    if (!endpoint) return false
    const key = endpointKey(endpoint)
    this.ready.add(key)
    const waiter = this.readyWaiters.get(key)
    if (waiter) { clearTimeout(waiter.timer); waiter.resolve(); this.readyWaiters.delete(key) }
    return true
  }

  waitForReceiver(endpoint: TransferEndpoint, timeoutMs = 10_000): Promise<void> {
    const key = endpointKey(endpoint)
    if (this.ready.has(key)) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.readyWaiters.delete(key); reject(new Error('transfer target receiver did not bind')) }, timeoutMs)
      this.readyWaiters.set(key, { resolve, reject, timer })
    })
  }

  createTarget(transferId: string, releasePoint?: NativeExternalReleasePoint): Promise<TransferEndpoint> {
    return this.targets.createTarget(transferId, false, undefined, releasePoint)
  }

  async reserveRecoveryWindow(transferId: string): Promise<TransferEndpoint> {
    // Reservation is intentionally inert: it cannot authenticate or receive a
    // command until the T05 journal has durably migrated ownership.
    return { sessionId: `recovery-reservation:${transferId}:${randomUUID()}`, epoch: this.nextEpoch++ }
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
    // Test-only power-loss seam. It is reached only after the normal endpoint
    // and capability validation, and never exists outside Electron E2E mode.
    if (holdsSourceReleaseForT06Test(command)) return new Promise<TransferAck>(() => {})
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
    if (!waiting || !sameEndpoint(waiting.endpoint, registered.endpoint)) return { status: 'nack', reason: 'stale transfer acknowledgement' }
    clearTimeout(waiting.timer); this.awaiting.delete(key)
    if (waiting.capability) this.capabilities.delete(waiting.capability.id)
    waiting.resolve(receipt.ack)
    return { status: 'ok' }
  }

  recoveryMaterialized(sender: TransferWebContents, transferId: string): boolean {
    const registered = this.bySender.get(String(sender.id))
    if (!registered) return false
    const key = recoveryMaterializationKey(transferId, registered.endpoint)
    const materialization = this.recoveryMaterializations.get(key)
    if (!materialization || !sameEndpoint(materialization.endpoint, registered.endpoint)) return false
    clearTimeout(materialization.timer)
    this.recoveryMaterializations.delete(key)
    materialization.resolve()
    return true
  }

  async materializeRecoveryWindow(endpoint: TransferEndpoint, payload: TransferRecoveryPayload): Promise<void> {
    if (!this.authenticate(endpoint)) await this.targets.createTarget('recovery', true, endpoint)
    const registered = [...this.bySender.values()].find(item => item.endpoint.sessionId === endpoint.sessionId && item.endpoint.epoch === endpoint.epoch)
    if (!registered) throw new Error('recovery endpoint is unavailable')
    const transferId = recoveryTransferId(endpoint.sessionId)
    const key = recoveryMaterializationKey(transferId, endpoint)
    const materialized = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.recoveryMaterializations.delete(key)
        reject(new Error('transfer recovery target did not materialize'))
      }, 10_000)
      this.recoveryMaterializations.set(key, { endpoint, resolve, reject, timer })
    })
    try {
      registered.webContents.send('mt::workspace::transfer-recovery', {
        transferId,
        ownerSessionId: endpoint.sessionId,
        payload
      } satisfies TransferRecoveryMessage)
      await materialized
    } catch (error) {
      const waiting = this.recoveryMaterializations.get(key)
      if (waiting) { clearTimeout(waiting.timer); this.recoveryMaterializations.delete(key) }
      throw error
    }
  }

  authorizePreflight(sender: TransferWebContents, transferId: string): boolean {
    const endpoint = this.endpointForSender(sender)
    return !!endpoint && [...this.awaiting.values()].some(waiting =>
      waiting.endpoint.sessionId === endpoint.sessionId &&
      waiting.endpoint.epoch === endpoint.epoch &&
      [...this.awaiting.entries()].some(([key, candidate]) => candidate === waiting && key.startsWith(`${transferId}:source-prepared:prepare:`))
    )
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

const recoveryTransferId = (sessionId: string): string => {
  const prefix = 'recovery-reservation:'
  if (!sessionId.startsWith(prefix)) return 'recovery'
  return sessionId.slice(prefix.length).split(':')[0] || 'recovery'
}

const endpointKey = (endpoint: TransferEndpoint): string => `${endpoint.sessionId}:${endpoint.epoch}`
const recoveryMaterializationKey = (transferId: string, endpoint: TransferEndpoint): string => `${transferId}:${endpointKey(endpoint)}`
const sameEndpoint = (left: TransferEndpoint, right: TransferEndpoint): boolean =>
  left.sessionId === right.sessionId && left.epoch === right.epoch
