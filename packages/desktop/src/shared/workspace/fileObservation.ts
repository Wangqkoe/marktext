/**
 * Cross-process values used by the main-process disk observation boundary.
 * A DiskRevision is the SHA-256 of the bytes that are actually persisted.
 */
import type { DiskRevision, DocumentId, FileKey } from './types'

export type { DiskRevision, DocumentId, FileKey }

export type FileObservationPurpose = 'save' | 'overwrite' | 'save-as-overwrite'

export interface FileObservationIdentity {
  readonly documentId: DocumentId
  readonly documentRevision: number
  readonly fileKey: FileKey
  readonly observedDiskRevision: DiskRevision | null
}

export interface OverwriteRequest extends FileObservationIdentity {
  readonly purpose: Extract<FileObservationPurpose, 'overwrite' | 'save-as-overwrite'>
}

/**
 * An opaque, single-use authorization. Its implementation data deliberately
 * remains in the main process and must not cross IPC.
 */
export interface OverwriteToken {
  readonly purpose: OverwriteRequest['purpose']
}
