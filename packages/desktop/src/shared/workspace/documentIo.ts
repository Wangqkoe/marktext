import type { FileEncoding, LineEnding } from '@shared/types/files'
import type { DocumentId } from './types'

export interface DocumentIoWriteOptions {
  readonly encoding: FileEncoding
  readonly lineEnding: LineEnding
  readonly adjustLineEndingOnSave: boolean
}

export interface DocumentIoBindingRequest {
  readonly kind: 'bind'
  readonly requestId: string
  readonly documentId: DocumentId
  readonly documentRevision: number
  readonly pathname: string
  readonly dirty: boolean
  /** Diagnostic only. Main authenticates the actual sender, never this value. */
  readonly windowId?: number
}

export interface DocumentIoSyncRequest {
  readonly kind: 'sync'
  readonly requestId: string
  readonly documentId: DocumentId
  readonly documentRevision: number
  readonly ownerFence: string
  readonly dirty: boolean
  readonly windowId?: number
}

export interface DocumentIoSaveRequest {
  readonly kind: 'save' | 'save-as' | 'rename'
  readonly requestId: string
  readonly documentId: DocumentId
  readonly documentRevision: number
  readonly ownerFence: string
  readonly markdown: string
  readonly options: DocumentIoWriteOptions
  /** Save uses the current binding; Save As/rename supply the proposed path. */
  readonly targetPathname?: string
  readonly windowId?: number
}

export interface DocumentIoUnbindRequest {
  readonly kind: 'unbind'
  readonly requestId: string
  readonly documentId: DocumentId
  readonly ownerFence: string
  readonly windowId?: number
}

export type DocumentIoRequest =
  | DocumentIoBindingRequest
  | DocumentIoSyncRequest
  | DocumentIoSaveRequest
  | DocumentIoUnbindRequest

export type DocumentSaveAck =
  | {
    readonly status: 'bound'
    readonly requestId: string
    readonly documentId: DocumentId
    readonly ownerFence: string
  }
  | {
    readonly status: 'durable-success'
    readonly requestId: string
    readonly documentId: DocumentId
    readonly documentRevision: number
    readonly ownerFence: string
  }
  | {
    readonly status: 'conflict'
    readonly requestId: string
    readonly documentId: DocumentId
    readonly ownerFence: string
  }
  | {
    readonly status: 'not-durable' | 'rejected' | 'unbound'
    readonly requestId: string
    readonly documentId: DocumentId
    readonly ownerFence?: string
    readonly reason?: string
  }

export interface DocumentIoObservation {
  readonly documentId: DocumentId
  readonly ownerFence: string
  readonly kind: 'reload' | 'conflict'
}

export interface DocumentIoPort {
  request(request: DocumentIoRequest): Promise<DocumentSaveAck>
  subscribe(listener: (observation: DocumentIoObservation) => void): () => void
}
