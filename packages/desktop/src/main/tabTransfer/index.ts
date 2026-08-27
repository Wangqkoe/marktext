import { createHash, randomUUID } from 'node:crypto'
import type { MoveRecoveryRecord } from '@shared/workspace'
import type {
  CapsuleStorage,
  JournalRecord,
  RecoveredTransfer,
  RecoveryProjection,
  TabTransfer,
  TabTransferResult,
  TransferAck,
  TransferCapability,
  TransferCommand,
  TransferEndpoint,
  TransferIntent,
  TransferJournal,
  TransferOperation,
  TransferPhase,
  TransferRecoveryPayload,
  TransferTransport
} from './types'
import { toMoveRecoveryRecord, transferPhases } from './types'

export * from './memory'
export * from './types'

const preAuthorizationPhases = new Set<TransferPhase>(['requested', 'source-prepared', 'target-staged'])
const phaseCommand: Record<Exclude<TransferPhase, 'requested' | 'commit-authorized' | 'completed'>, TransferOperation> = {
  'source-prepared': 'prepare',
  'target-staged': 'stage',
  'source-released': 'release',
  'target-activated': 'activate'
}

const timeout = { timeoutMs: 15_000, retryCadenceMs: 5_000 } as const

const digest = (bytes: Uint8Array): string => {
  const hash = createHash('sha256')
  // Deliberately update in chunks: the digest is defined over stored bytes, not an object.
  for (let offset = 0; offset < bytes.length; offset += 64 * 1024) hash.update(bytes.subarray(offset, offset + 64 * 1024))
  return hash.digest('hex')
}

const encodeCapsule = (capsule: TransferIntent['capsule']): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(capsule))

const decodeCapsule = (bytes: Uint8Array): TransferIntent['capsule'] => JSON.parse(new TextDecoder().decode(bytes)) as TransferIntent['capsule']

const phaseIndex = (phase: TransferPhase): number => transferPhases.indexOf(phase)
const previousPhase = (phase: TransferPhase): TransferPhase => transferPhases[Math.max(0, phaseIndex(phase) - 1)]

export class TabTransferCoordinator implements TabTransfer {
  private readonly requests = new Map<string, { fingerprint: string; result: Promise<TabTransferResult> }>()
  private readonly warnings = new Map<string, string>()
  private readonly recoveryStates = new Map<string, RecoveredTransfer>()
  private readonly pending = new Map<string, { readonly promise: Promise<TabTransferResult>; readonly resolve: (result: TabTransferResult) => void }>()
  private readonly recoveringTransfers = new Map<string, Promise<TabTransferResult>>()

  constructor(
    private readonly journal: TransferJournal,
    private readonly capsules: CapsuleStorage,
    private readonly transport: TransferTransport,
    private readonly ids: () => string = randomUUID
  ) {}

  async run(intent: TransferIntent): Promise<TabTransferResult> {
    const existing = this.requests.get(intent.requestId)
    if (existing) {
      return existing.fingerprint === intent.fingerprint
        ? existing.result
        : { status: 'rejected', reason: 'request id was replayed with a different transfer fingerprint' }
    }
    const operation = this.runFresh(intent)
    // Install the promise before the first journal read so concurrent command delivery remains business-once.
    this.requests.set(intent.requestId, { fingerprint: intent.fingerprint, result: operation })
    return operation
  }

  private async runFresh(intent: TransferIntent): Promise<TabTransferResult> {
    const persisted = (await this.loadTransfers()).find(transfer => transfer.requestId === intent.requestId)
    if (persisted) {
      if (persisted.fingerprint !== intent.fingerprint) {
        return { status: 'rejected', reason: 'request id was replayed with a different transfer fingerprint' }
      }
      if (persisted.phase === 'completed') return { status: 'applied', transferId: persisted.transferId }
      return this.publicAttempt(persisted)
    }
    if (!this.transport.authenticate(intent.source)) {
      return { status: 'rejected', reason: 'unauthenticated source endpoint epoch' }
    }
    if (intent.capsule.documentRevision !== intent.documentRevision || intent.capsule.sourceSessionId !== intent.source.sessionId) {
      return { status: 'rejected', reason: 'capsule does not match the sealed source identity' }
    }
    try {
      if (containsNonJson(intent.capsule.history.value)) throw new Error('history is not JSON-safe')
      encodeCapsule(intent.capsule)
    } catch {
      return { status: 'rejected', reason: 'portable history cannot be encoded' }
    }
    return this.start(intent)
  }

  async recover(): Promise<readonly TabTransferResult[]> {
    const results: TabTransferResult[] = []
    for (const transfer of await this.loadTransfers()) {
      if (transfer.phase === 'completed') continue
      const result = await this.advanceExisting(transfer)
      results.push(result)
      if (result.status === 'applied') {
        this.pending.get(transfer.transferId)?.resolve(result)
        this.pending.delete(transfer.transferId)
      }
    }
    return results
  }

  async scan(): Promise<readonly MoveRecoveryRecord[]> {
    return (await this.loadTransfers()).filter(transfer => transfer.phase !== 'completed').map(toMoveRecoveryRecord)
  }

  getRecoveryProjection(): RecoveryProjection {
    return {
      transfers: [...this.warnings.entries()].map(([transferId, warning]) => ({
        transferId,
        phase: this.recoveryStates.get(transferId)?.phase ?? 'commit-authorized',
        ownerSessionId: this.recoveryStates.get(transferId)?.ownerSessionId ?? 'recovery-pending',
        warning
      }))
    }
  }

  private async start(intent: TransferIntent): Promise<TabTransferResult> {
    const transferId = this.ids()
    const bytes = encodeCapsule(intent.capsule)
    const capsuleDigest = digest(bytes)
    const initial: RecoveredTransfer = {
      transferId,
      requestId: intent.requestId,
      fingerprint: intent.fingerprint,
      phase: 'requested',
      capsuleDigest,
      source: intent.source,
      ownerSessionId: intent.source.sessionId,
      documentRevision: intent.documentRevision,
      isLastSourceTab: intent.isLastSourceTab
    }
    try {
      await this.capsules.putRecovery(transferId, recoveryPayload(intent.capsule))
      await this.capsules.put(transferId, bytes, capsuleDigest)
      await this.observe(initial, 'requested')
      return this.publicAttempt(initial, intent.releasePoint)
    } catch (error) {
      return { status: 'failed', reason: `durable transfer setup failed: ${message(error)}` }
    }
  }

  private async advance(transfer: RecoveredTransfer, releasePoint?: TransferIntent['releasePoint']): Promise<TabTransferResult> {
    const stored = await this.capsules.get(transfer.transferId)
    let salvage: TransferRecoveryPayload | undefined
    let capsule: TransferIntent['capsule'] | undefined
    if (!stored || digest(stored.bytes) !== transfer.capsuleDigest) {
      if (preAuthorizationPhases.has(transfer.phase)) {
        return this.abort(transfer, 'capsule is missing or corrupt; source remains owner')
      }
      salvage = await this.capsules.getRecovery(transfer.transferId)
      if (!salvage) return this.pendingAfterAuthorization(transfer, 'post-authorization capsule corruption has no durable salvage payload')
      this.warnings.set(transfer.transferId, 'Move capsule is corrupt; title, content, options and View were salvaged; history was cleared.')
    } else {
      try {
        capsule = decodeCapsule(stored.bytes)
      } catch {
        if (preAuthorizationPhases.has(transfer.phase)) return this.abort(transfer, 'capsule decoding failed; source remains owner')
        salvage = await this.capsules.getRecovery(transfer.transferId)
        if (!salvage) return this.pendingAfterAuthorization(transfer, 'post-authorization capsule decoding has no durable salvage payload')
        this.warnings.set(transfer.transferId, 'Move capsule could not be decoded; title, content, options and View were salvaged; history was cleared.')
      }
    }
    if (capsule && (!capsule.history || typeof capsule.history.version !== 'number')) {
      if (preAuthorizationPhases.has(transfer.phase)) return this.abort(transfer, 'portable history is corrupt before authorization')
      salvage = recoveryPayload(capsule)
      this.warnings.set(transfer.transferId, 'Portable history was corrupt and has been cleared during Move recovery.')
    }
    let current = transfer
    try {
      if (phaseIndex(current.phase) < phaseIndex('source-prepared')) {
        const target = current.target ?? await this.transport.createTarget(current.transferId, releasePoint)
        current = { ...current, target }
        const ack = await this.command(current, 'source-prepared', current.source)
        if (!isSealed(ack, current.documentRevision)) return this.abort(current, 'source revision fence was not sealed')
        current = this.advanceState(current, 'source-prepared')
      }
      const stagedTarget = current.target
      if (!stagedTarget) return { status: 'failed', reason: 'target endpoint was not durably recorded' }
      if (phaseIndex(current.phase) < phaseIndex('target-staged')) {
        const ack = await this.command(current, 'target-staged', stagedTarget)
        if (ack.status !== 'ok') return this.abort(current, `target staging ${ackReason(ack)}`)
        // The sealed source ACK must still match immediately before authorization.
        const sealed = await this.command(current, 'source-prepared', current.source)
        if (!isSealed(sealed, current.documentRevision)) return this.abort(current, 'source revision changed before authorization')
        current = this.advanceState(current, 'target-staged')
      }
      if (phaseIndex(current.phase) < phaseIndex('commit-authorized')) {
        current = await this.observe(current, 'commit-authorized', stagedTarget.sessionId)
      }
      return this.finish(current, salvage)
    } catch (error) {
      if (preAuthorizationPhases.has(current.phase)) return this.abort(current, message(error))
      this.warnings.set(current.transferId, `Move recovery is pending: ${message(error)}`)
      return this.pendingAfterAuthorization(current, 'post-authorization recovery is pending')
    }
  }

  private async finish(
    transfer: RecoveredTransfer,
    salvage?: TransferRecoveryPayload
  ): Promise<TabTransferResult> {
    let current = transfer
    try {
      if (salvage || !current.target || !this.transport.authenticate(current.target)) {
        const recoveryWindow = current.recoveryWindow ?? await this.transport.reserveRecoveryWindow(current.transferId)
        if (!current.recoveryWindow) {
          // Identity reservation is inert. Owner migration must reach durable journal before materialization.
          await this.journal.migrateOwner({
            transferId: current.transferId,
            ownerSessionId: recoveryWindow.sessionId,
            recoveryWindowSessionId: recoveryWindow.sessionId,
            recoveryWindow
          })
          current = {
            ...current,
            target: recoveryWindow,
            ownerSessionId: recoveryWindow.sessionId,
            recoveryWindowSessionId: recoveryWindow.sessionId,
            recoveryWindow
          }
        }
        if (!this.transport.authenticate(recoveryWindow)) {
          await this.transport.materializeRecoveryWindow(
            recoveryWindow,
            salvage ?? await this.requiredRecoveryPayload(current.transferId)
          )
        }
      }
      if (phaseIndex(current.phase) < phaseIndex('source-released')) {
        if (this.transport.authenticate(current.source)) {
          await this.requirePostAuthorization(current, 'source-released', current.source)
          current = this.advanceState(current, 'source-released', current.ownerSessionId)
        } else {
          // commit-authorized is the ownership fence; a dead source cannot veto forward recovery.
          current = await this.observe({ ...current, sourceReconciled: true }, 'source-released', current.ownerSessionId)
        }
      }
      if (!current.target) return { status: 'failed', reason: 'no recovery target' }
      const activatedTarget = current.target
      if (phaseIndex(current.phase) < phaseIndex('target-activated')) {
        await this.requirePostAuthorization(current, 'target-activated', activatedTarget)
        current = this.advanceState(current, 'target-activated', current.ownerSessionId)
      }
      const checkpoint = this.capability(current, 'checkpoint', 'target')
      await this.intent(current, 'completed')
      const checkpointAck = await this.transport.command({
        transferId: current.transferId,
        phase: 'target-activated',
        operation: 'checkpoint',
        endpoint: activatedTarget,
        capability: checkpoint,
        capsuleDigest: current.capsuleDigest,
        documentRevision: current.documentRevision,
        isLastSourceTab: current.isLastSourceTab
      }, timeout)
      if (checkpointAck.status !== 'ok') throw new Error(`session checkpoint ${ackReason(checkpointAck)}`)
      await this.observed(current, 'completed')
      current = this.advanceState(current, 'completed', current.ownerSessionId)
      await this.capsules.tombstone(current.transferId)
      try {
        await this.capsules.gc()
      } catch {
        // A completed target session is already authoritative; retain a bounded tombstone for retry.
      }
      return { status: 'applied', transferId: current.transferId }
    } catch (error) {
      this.warnings.set(current.transferId, `Move is recovering after authorization: ${message(error)}`)
      return this.pendingAfterAuthorization(current, 'post-authorization recovery is pending')
    }
  }

  private async command(transfer: RecoveredTransfer, phase: 'source-prepared' | 'target-staged', endpoint: TransferEndpoint): Promise<TransferAck> {
    const operation = phaseCommand[phase]
    await this.intent(transfer, phase)
    let ack: TransferAck = { status: 'timeout' }
    for (let attempt = 0; attempt < 3 && ack.status === 'timeout'; attempt += 1) {
      const capability = phase === 'target-staged' ? this.capability(transfer, operation, 'target') : undefined
      ack = await this.transport.command(this.commandFor(transfer, phase, operation, endpoint, capability), timeout)
    }
    if (ack.status === 'ok') await this.observed(transfer, phase)
    return ack
  }

  private async requirePostAuthorization(transfer: RecoveredTransfer, phase: 'source-released' | 'target-activated', endpoint: TransferEndpoint): Promise<void> {
    const operation = phaseCommand[phase]
    await this.intent(transfer, phase)
    const role = phase === 'source-released' ? 'source' : 'target'
    const ack = await this.transport.command(this.commandFor(transfer, phase, operation, endpoint, this.capability(transfer, operation, role)), timeout)
    if (ack.status !== 'ok') throw new Error(`${phase} ${ackReason(ack)}`)
    await this.observed(transfer, phase)
  }

  private capability(transfer: RecoveredTransfer, operation: TransferOperation, role: 'source' | 'target'): TransferCapability {
    if (!transfer.target) throw new Error('target is unavailable')
    return this.transport.issueCapability({
      transferId: transfer.transferId,
      operation,
      role,
      source: transfer.source,
      target: transfer.target,
      capsuleDigest: transfer.capsuleDigest,
      documentRevision: transfer.documentRevision
    })
  }

  private commandFor(
    transfer: RecoveredTransfer,
    phase: TransferCommand['phase'],
    operation: TransferOperation,
    endpoint: TransferEndpoint,
    capability?: TransferCapability
  ): TransferCommand {
    return {
      transferId: transfer.transferId,
      phase,
      operation,
      endpoint,
      ...(capability ? { capability } : {}),
      capsuleDigest: transfer.capsuleDigest,
      documentRevision: transfer.documentRevision,
      isLastSourceTab: transfer.isLastSourceTab
    }
  }

  private async abort(transfer: RecoveredTransfer, reason: string): Promise<TabTransferResult> {
    await this.journal.abort(this.record(transfer, transfer.phase, 'observed'))
    await this.capsules.tombstone(transfer.transferId)
    try {
      await this.capsules.gc()
    } catch {
      // Retain the tombstone; pre-authorization source ownership remains intact.
    }
    return { status: 'failed', reason: `transfer aborted before authorization: ${reason}` }
  }

  private pendingAfterAuthorization(transfer: RecoveredTransfer, reason: string): TabTransferResult {
    this.recoveryStates.set(transfer.transferId, transfer)
    this.pendingFor(transfer.transferId)
    return { status: 'failed', reason }
  }

  private async intent(transfer: RecoveredTransfer, phase: TransferPhase): Promise<void> {
    await this.journal.append(this.record(transfer, phase, 'intent'))
  }

  private async observed(transfer: RecoveredTransfer, phase: TransferPhase): Promise<void> {
    await this.journal.append(this.record(transfer, phase, 'observed'))
  }

  private async observe(transfer: RecoveredTransfer, phase: TransferPhase, ownerSessionId = transfer.ownerSessionId): Promise<RecoveredTransfer> {
    await this.intent(transfer, phase)
    await this.observed(transfer, phase)
    return this.advanceState(transfer, phase, ownerSessionId)
  }

  private advanceState(transfer: RecoveredTransfer, phase: TransferPhase, ownerSessionId = transfer.ownerSessionId): RecoveredTransfer {
    const observed = { ...transfer, phase, ownerSessionId }
    this.recoveryStates.set(observed.transferId, observed)
    return observed
  }

  private record(transfer: RecoveredTransfer, phase: TransferPhase, kind: 'intent' | 'observed'): JournalRecord {
    return {
      transferId: transfer.transferId,
      requestId: transfer.requestId,
      fingerprint: transfer.fingerprint,
      phase,
      kind,
      capsuleDigest: transfer.capsuleDigest,
      source: transfer.source,
      ...(transfer.target ? { target: transfer.target } : {}),
      ownerSessionId: transfer.ownerSessionId,
      ...(transfer.recoveryWindowSessionId ? { recoveryWindowSessionId: transfer.recoveryWindowSessionId } : {}),
      documentRevision: transfer.documentRevision,
      isLastSourceTab: transfer.isLastSourceTab,
      ...(transfer.sourceReconciled ? { sourceReconciled: true } : {})
    }
  }

  private async loadTransfers(): Promise<readonly RecoveredTransfer[]> {
    const records = await this.journal.records()
    const latest = new Map<string, JournalRecord>()
    for (const record of records) latest.set(record.transferId, record)
    const migrations = await this.journal.ownerMigrations()
    return [...latest.values()].filter(record => !record.aborted).map(record => {
      const migration = migrations.filter(value => value.transferId === record.transferId).at(-1)
      return {
        transferId: record.transferId,
        requestId: record.requestId,
        fingerprint: record.fingerprint,
        // An unobserved command is retried from its prior durable state. The authorization
        // intent is the deliberate exception: it is itself the irreversible ownership fence.
        phase: record.kind === 'intent' && record.phase !== 'commit-authorized'
          ? previousPhase(record.phase)
          : record.phase,
        capsuleDigest: record.capsuleDigest,
        source: record.source,
        ...(record.target ? { target: record.target } : {}),
        ownerSessionId: migration?.ownerSessionId ?? record.ownerSessionId,
        ...(migration
          ? {
            target: migration.recoveryWindow,
            recoveryWindowSessionId: migration.recoveryWindowSessionId,
            recoveryWindow: migration.recoveryWindow
          }
          : {}),
        documentRevision: record.documentRevision,
        isLastSourceTab: record.isLastSourceTab,
        ...(record.sourceReconciled ? { sourceReconciled: true } : {})
      }
    })
  }

  private advanceExisting(transfer: RecoveredTransfer, releasePoint?: TransferIntent['releasePoint']): Promise<TabTransferResult> {
    const existing = this.recoveringTransfers.get(transfer.transferId)
    if (existing) return existing
    // This tracks only one bounded internal attempt, never the public recovery waiter.
    const operation = this.advance(transfer, releasePoint).finally(() => this.recoveringTransfers.delete(transfer.transferId))
    this.recoveringTransfers.set(transfer.transferId, operation)
    return operation
  }

  private async publicAttempt(transfer: RecoveredTransfer, releasePoint?: TransferIntent['releasePoint']): Promise<TabTransferResult> {
    const result = await this.advanceExisting(transfer, releasePoint)
    return result.status === 'failed' && this.pending.has(transfer.transferId)
      ? this.pendingFor(transfer.transferId).promise
      : result
  }

  private pendingFor(transferId: string): { readonly promise: Promise<TabTransferResult>; readonly resolve: (result: TabTransferResult) => void } {
    const existing = this.pending.get(transferId)
    if (existing) return existing
    let resolvePending!: (result: TabTransferResult) => void
    const promise = new Promise<TabTransferResult>(resolve => { resolvePending = resolve })
    const pending = { promise, resolve: resolvePending }
    this.pending.set(transferId, pending)
    return pending
  }

  private async requiredRecoveryPayload(transferId: string): Promise<TransferRecoveryPayload> {
    const payload = await this.capsules.getRecovery(transferId)
    if (!payload) throw new Error('durable recovery payload is unavailable')
    return payload
  }
}

const isSealed = (ack: TransferAck, revision: number): boolean => ack.status === 'ok' && ack.sealedRevision === revision
const ackReason = (ack: TransferAck): string => ack.status === 'nack' ? `was rejected: ${ack.reason}` : 'timed out'
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

const containsNonJson = (value: unknown): boolean => {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return false
  if (Array.isArray(value)) return value.some(containsNonJson)
  if (typeof value !== 'object') return true
  return Object.values(value as Record<string, unknown>).some(containsNonJson)
}

const recoveryPayload = (capsule: TransferIntent['capsule']): TransferRecoveryPayload => ({
  sourceDocumentId: capsule.sourceDocumentId,
  sourceViewId: capsule.sourceViewId,
  sourceLineage: capsule.sourceLineage,
  documentRevision: capsule.documentRevision,
  ...(capsule.fileKey ? { fileKey: capsule.fileKey } : {}),
  ...(capsule.observedDiskRevision !== undefined ? { observedDiskRevision: capsule.observedDiskRevision } : {}),
  title: capsule.title,
  markdown: capsule.markdown,
  dirty: capsule.dirty,
  conflict: capsule.conflict,
  options: capsule.options,
  view: capsule.view
})
