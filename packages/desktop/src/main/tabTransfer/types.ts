import type { DiskRevision, JsonValue, MoveRecovery, MoveRecoveryRecord, PortableHistory, ViewState } from '@shared/workspace'

export const transferPhases = [
  'requested',
  'source-prepared',
  'target-staged',
  'commit-authorized',
  'source-released',
  'target-activated',
  'completed'
] as const

export type TransferPhase = (typeof transferPhases)[number]
export type TransferRole = 'source' | 'target'
export type TransferOperation = 'prepare' | 'stage' | 'release' | 'activate' | 'checkpoint'

export interface TransferEndpoint {
  readonly sessionId: string
  readonly epoch: number
}

export interface TransferCapsule {
  readonly version: 1
  readonly sourceDocumentId: string
  readonly sourceViewId: string
  readonly sourceSessionId: string
  readonly sourceLineage: string
  readonly documentRevision: number
  readonly fileKey?: string
  readonly observedDiskRevision?: DiskRevision
  readonly title: string
  readonly markdown: string
  readonly dirty: boolean
  readonly conflict: boolean
  readonly options: JsonValue
  readonly history: PortableHistory
  readonly view: ViewState
}

/** Durable independently of the digest-addressed capsule for post-authorization salvage only. */
export interface TransferRecoveryPayload {
  readonly sourceDocumentId: string
  readonly sourceViewId: string
  readonly sourceLineage: string
  readonly documentRevision: number
  readonly fileKey?: string
  readonly observedDiskRevision?: DiskRevision
  readonly title: string
  readonly markdown: string
  readonly dirty: boolean
  readonly conflict: boolean
  readonly options: JsonValue
  readonly view: ViewState
}

/** Renderer receives recovery content only with the durable transfer identity. */
export interface TransferRecoveryMessage {
  readonly transferId: string
  readonly ownerSessionId: string
  readonly payload: TransferRecoveryPayload
}

export interface TransferIntent {
  readonly requestId: string
  /** Stable input identity supplied by the Controller; it is never a window id. */
  readonly fingerprint: string
  readonly source: TransferEndpoint
  readonly sourceDocumentId: string
  readonly sourceViewId: string
  readonly sourceLineage: string
  readonly documentRevision: number
  readonly isLastSourceTab: boolean
  readonly capsule: TransferCapsule
}

export interface TransferCapability {
  readonly id: string
  readonly transferId: string
  readonly operation: TransferOperation
  readonly role: TransferRole
  readonly source: TransferEndpoint
  readonly target: TransferEndpoint
  readonly capsuleDigest: string
  readonly documentRevision: number
}

export interface TransferCommand {
  readonly transferId: string
  readonly phase: Exclude<TransferPhase, 'requested' | 'commit-authorized' | 'completed'>
  readonly operation: TransferOperation
  readonly endpoint: TransferEndpoint
  readonly capability?: TransferCapability
  readonly capsuleDigest: string
  readonly documentRevision: number
  readonly isLastSourceTab: boolean
}

export type TransferAck =
  | { readonly status: 'ok'; readonly sealedRevision?: number }
  | { readonly status: 'nack'; readonly reason: string }
  | { readonly status: 'timeout' }

export interface TransferTransport {
  createTarget(transferId: string): Promise<TransferEndpoint>
  authenticate(endpoint: TransferEndpoint): boolean
  issueCapability(input: Omit<TransferCapability, 'id'>): TransferCapability
  command(command: TransferCommand, timeout: { readonly timeoutMs: number; readonly retryCadenceMs: number }): Promise<TransferAck>
  /** Returns a persistable session identity; this must not create or activate a window. */
  reserveRecoveryWindow(transferId: string): Promise<TransferEndpoint>
  /** Called only after owner/recovery-session migration is durably journaled. */
  materializeRecoveryWindow(endpoint: TransferEndpoint, payload: TransferRecoveryPayload): Promise<void>
}

export interface CapsuleStorage {
  put(transferId: string, bytes: Uint8Array, digest: string): Promise<void>
  get(transferId: string): Promise<{ readonly bytes: Uint8Array; readonly digest: string } | undefined>
  putRecovery(transferId: string, payload: TransferRecoveryPayload): Promise<void>
  getRecovery(transferId: string): Promise<TransferRecoveryPayload | undefined>
  tombstone(transferId: string): Promise<void>
  gc(): Promise<void>
}

export interface JournalRecord {
  readonly transferId: string
  readonly requestId: string
  readonly fingerprint: string
  readonly phase: TransferPhase
  readonly kind: 'intent' | 'observed'
  readonly capsuleDigest: string
  readonly source: TransferEndpoint
  readonly target?: TransferEndpoint
  readonly ownerSessionId: string
  readonly recoveryWindowSessionId?: string
  readonly documentRevision: number
  readonly isLastSourceTab: boolean
  /** Durable terminal disposition; it is not a successful completed transfer. */
  readonly aborted?: true
  /** Source endpoint was dead after authorization, so WAL—not an ACK—released ownership. */
  readonly sourceReconciled?: true
}

export interface TransferJournal {
  append(record: JournalRecord): Promise<void>
  abort(record: Omit<JournalRecord, 'kind' | 'aborted'>): Promise<void>
  records(): Promise<readonly JournalRecord[]>
  /** Kept apart from phase records so recovery-window durability is observable. */
  migrateOwner(record: {
    readonly transferId: string
    readonly ownerSessionId: string
    readonly recoveryWindowSessionId: string
    readonly recoveryWindow: TransferEndpoint
  }): Promise<void>
  ownerMigrations(): Promise<readonly {
    readonly transferId: string
    readonly ownerSessionId: string
    readonly recoveryWindowSessionId: string
    readonly recoveryWindow: TransferEndpoint
  }[]>
}

export type TabTransferResult =
  | { readonly status: 'applied'; readonly transferId: string }
  | { readonly status: 'rejected'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string }

export interface RecoveryProjection {
  readonly transfers: readonly {
    readonly transferId: string
    readonly phase: TransferPhase
    readonly ownerSessionId: string
    readonly warning?: string
  }[]
}

export interface TabTransfer extends MoveRecovery {
  run(intent: TransferIntent): Promise<TabTransferResult>
  recover(): Promise<readonly TabTransferResult[]>
  getRecoveryProjection(): RecoveryProjection
}

export interface RecoveredTransfer {
  readonly transferId: string
  readonly requestId: string
  readonly fingerprint: string
  readonly phase: TransferPhase
  readonly capsuleDigest: string
  readonly source: TransferEndpoint
  readonly target?: TransferEndpoint
  readonly ownerSessionId: string
  readonly recoveryWindowSessionId?: string
  readonly recoveryWindow?: TransferEndpoint
  readonly documentRevision: number
  readonly isLastSourceTab: boolean
  readonly sourceReconciled?: true
}

export const toMoveRecoveryRecord = (transfer: RecoveredTransfer): MoveRecoveryRecord => ({
  kind: 'move-recovery',
  transferId: transfer.transferId,
  capsuleDigest: transfer.capsuleDigest,
  phase: transfer.phase
})
