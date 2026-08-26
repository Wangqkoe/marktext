import { createHash } from 'node:crypto'
import type {
  CapsuleStorage,
  JournalRecord,
  TransferAck,
  TransferCapability,
  TransferCommand,
  TransferEndpoint,
  TransferJournal,
  TransferTransport,
  TransferRecoveryPayload
} from './types'

export class MemoryTransferJournal implements TransferJournal {
  readonly entries: JournalRecord[] = []
  readonly migrations: { transferId: string; ownerSessionId: string; recoveryWindowSessionId: string }[] = []
  failNextAppend = false

  async append(record: JournalRecord): Promise<void> {
    if (this.failNextAppend) {
      this.failNextAppend = false
      throw new Error('journal fsync failed')
    }
    this.entries.push({ ...record })
  }

  async abort(record: Omit<JournalRecord, 'kind' | 'aborted'>): Promise<void> {
    await this.append({ ...record, kind: 'observed', aborted: true })
  }

  async records(): Promise<readonly JournalRecord[]> {
    return this.entries.map(entry => ({ ...entry }))
  }

  async migrateOwner(record: { transferId: string; ownerSessionId: string; recoveryWindowSessionId: string }): Promise<void> {
    this.migrations.push({ ...record })
  }

  async ownerMigrations(): Promise<readonly { transferId: string; ownerSessionId: string; recoveryWindowSessionId: string }[]> {
    return this.migrations.map(entry => ({ ...entry }))
  }
}

export class MemoryCapsuleStorage implements CapsuleStorage {
  readonly capsules = new Map<string, { bytes: Uint8Array; digest: string }>()
  readonly recovery = new Map<string, TransferRecoveryPayload>()
  readonly tombstones = new Set<string>()
  failDelete = false

  async put(transferId: string, bytes: Uint8Array, digest: string): Promise<void> {
    this.capsules.set(transferId, { bytes: bytes.slice(), digest })
  }

  async get(transferId: string): Promise<{ readonly bytes: Uint8Array; readonly digest: string } | undefined> {
    const capsule = this.capsules.get(transferId)
    return capsule && { bytes: capsule.bytes.slice(), digest: capsule.digest }
  }

  async putRecovery(transferId: string, payload: TransferRecoveryPayload): Promise<void> {
    this.recovery.set(transferId, structuredClone(payload))
  }

  async getRecovery(transferId: string): Promise<TransferRecoveryPayload | undefined> {
    const payload = this.recovery.get(transferId)
    return payload && structuredClone(payload)
  }

  async tombstone(transferId: string): Promise<void> {
    this.tombstones.add(transferId)
  }

  async gc(): Promise<void> {
    if (this.failDelete) throw new Error('capsule deletion failed')
    for (const transferId of this.tombstones) {
      this.capsules.delete(transferId)
      this.recovery.delete(transferId)
    }
  }

  corrupt(transferId: string, bytes: Uint8Array): void {
    const capsule = this.capsules.get(transferId)
    if (!capsule) throw new Error(`unknown capsule ${transferId}`)
    this.capsules.set(transferId, { bytes: bytes.slice(), digest: capsule.digest })
  }
}

type PlannedAck = TransferAck & { readonly late?: boolean }

/** Deterministic transport: plans model loss, duplicate/reorder, restarts and late ACKs. */
export class MemoryTransferTransport implements TransferTransport {
  readonly commands: TransferCommand[] = []
  readonly lateEvents: TransferCommand[] = []
  /** Effects that became durable before their ACK was deliberately lost. */
  readonly appliedCommands: TransferCommand[] = []
  readonly recoveryCalls: string[] = []
  readonly materializedRecovery: { endpoint: TransferEndpoint; payload: TransferRecoveryPayload }[] = []
  onMaterialize?: () => void
  private readonly endpoints = new Map<string, TransferEndpoint>()
  private readonly plans = new Map<string, PlannedAck[]>()
  private readonly successful = new Map<string, TransferAck>()
  private readonly capabilities = new Map<string, TransferCapability>()
  private readonly crashAfterApply = new Set<string>()
  private nextEndpoint = 1
  private nextCapability = 1

  constructor() {
    this.endpoints.set('source', { sessionId: 'source', epoch: 1 })
  }

  endpoint(sessionId = 'source'): TransferEndpoint {
    const endpoint = this.endpoints.get(sessionId)
    if (!endpoint) throw new Error(`unknown endpoint ${sessionId}`)
    return endpoint
  }

  plan(phase: TransferCommand['phase'], ...acks: PlannedAck[]): void {
    const queue = this.plans.get(phase) ?? []
    queue.push(...acks)
    this.plans.set(phase, queue)
  }

  loseNextAck(phase: TransferCommand['phase']): void {
    this.plan(phase, { status: 'timeout' })
  }

  duplicateNextAck(phase: TransferCommand['phase'], ack: TransferAck = { status: 'ok' }): void {
    this.plan(phase, ack, ack)
  }

  /** Reordering is explicit: the next queued acknowledgements are delivered in reverse order. */
  reorder(phase: TransferCommand['phase']): void {
    const queue = this.plans.get(phase)
    if (queue) queue.reverse()
  }

  lateNextAck(phase: TransferCommand['phase'], ack: TransferAck = { status: 'ok' }): void {
    this.plan(phase, { ...ack, late: true })
  }

  /** Simulates process death after an idempotent effect lands but before its ACK/observed WAL record. */
  crashAfterApplying(phase: TransferCommand['phase'], operation?: TransferCommand['operation']): void {
    this.crashAfterApply.add(`${phase}:${operation ?? '*'}`)
  }

  kill(sessionId: string): void {
    this.endpoints.delete(sessionId)
  }

  restart(sessionId: string): TransferEndpoint {
    const old = this.endpoints.get(sessionId)
    const endpoint = { sessionId, epoch: (old?.epoch ?? 1) + 1 }
    this.endpoints.set(sessionId, endpoint)
    return endpoint
  }

  async createTarget(_transferId: string): Promise<TransferEndpoint> {
    const sessionId = `target-${this.nextEndpoint++}`
    const endpoint = { sessionId, epoch: 1 }
    this.endpoints.set(sessionId, endpoint)
    return endpoint
  }

  authenticate(endpoint: TransferEndpoint): boolean {
    const current = this.endpoints.get(endpoint.sessionId)
    return current?.epoch === endpoint.epoch
  }

  issueCapability(input: Omit<TransferCapability, 'id'>): TransferCapability {
    const capability = { ...input, id: `cap-${this.nextCapability++}` }
    this.capabilities.set(capability.id, capability)
    return capability
  }

  async command(command: TransferCommand, _timeout: { readonly timeoutMs: number; readonly retryCadenceMs: number }): Promise<TransferAck> {
    this.commands.push({ ...command })
    if (!this.authenticate(command.endpoint)) return { status: 'nack', reason: 'unauthenticated endpoint epoch' }
    if (command.capability && !this.consumeCapability(command.capability, command)) {
      return { status: 'nack', reason: 'invalid, stale, or replayed capability' }
    }
    const idempotencyKey = `${command.transferId}:${command.phase}:${command.operation}`
    const previous = this.successful.get(idempotencyKey)
    const queue = this.plans.get(command.phase)
    const planned = queue?.shift()
    if (previous && !planned) return previous
    const ack = planned ?? { status: 'ok', sealedRevision: command.documentRevision }
    const crashKey = `${command.phase}:${command.operation}`
    if (this.crashAfterApply.delete(crashKey) || this.crashAfterApply.delete(`${command.phase}:*`)) {
      const applied: TransferAck = ack.status === 'ok' ? ack : { status: 'ok', sealedRevision: command.documentRevision }
      this.successful.set(idempotencyKey, applied)
      this.appliedCommands.push({ ...command })
      return new Promise<TransferAck>(() => undefined)
    }
    if (planned?.late) {
      this.lateEvents.push({ ...command })
      return { status: 'timeout' }
    }
    if (ack.status === 'ok') {
      this.successful.set(idempotencyKey, ack)
      this.appliedCommands.push({ ...command })
    }
    return ack
  }

  async reserveRecoveryWindow(_transferId: string): Promise<TransferEndpoint> {
    const sessionId = `recovery-${this.nextEndpoint++}`
    this.recoveryCalls.push(`reserve:${sessionId}`)
    return { sessionId, epoch: 1 }
  }

  async materializeRecoveryWindow(endpoint: TransferEndpoint, payload: TransferRecoveryPayload): Promise<void> {
    this.onMaterialize?.()
    this.recoveryCalls.push(`materialize:${endpoint.sessionId}`)
    this.endpoints.set(endpoint.sessionId, endpoint)
    this.materializedRecovery.push({ endpoint, payload: structuredClone(payload) })
  }

  private consumeCapability(capability: TransferCapability, command: TransferCommand): boolean {
    const issued = this.capabilities.get(capability.id)
    if (!issued || issued !== capability) return false
    this.capabilities.delete(capability.id)
    return (
      issued.transferId === command.transferId &&
      issued.operation === command.operation &&
      issued.capsuleDigest === command.capsuleDigest &&
      issued.documentRevision === command.documentRevision &&
      issued.role === (command.endpoint.sessionId === issued.source.sessionId ? 'source' : 'target') &&
      issued.source.sessionId === command.capability?.source.sessionId &&
      issued.source.epoch === command.capability?.source.epoch &&
      issued.target.sessionId === command.capability?.target.sessionId &&
      issued.target.epoch === command.capability?.target.epoch
    )
  }
}

export const memoryDigest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
