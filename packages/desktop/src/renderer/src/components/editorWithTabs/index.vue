<template>
  <div ref="root" class="editor-with-tabs" :class="{ split: panes.length === 2, preview: splitPreview, 'preview-left': splitPreview === 'left', 'preview-right': splitPreview === 'right' }">
    <pane-editor
      v-for="pane in panes"
      :key="pane.paneId"
      :pane="pane"
      :documents="snapshot.documents"
      :composition="compositionFor(pane.paneId)"
      :focused="snapshot.projection.focusedPaneId === pane.paneId"
      :workspace-actions="workspaceTabActions"
      :source-code="sourceCode"
      :caret-session="caretSession"
      :tab-bar-visible="tabBarVisible"
      :text-direction="textDirection"
      :platform="platform"
      @caret-position="$emit('caret-position', $event)"
      @tab-drag="handleTabDrag"
      @tab-press="handleTabPress(pane.paneId, $event)"
    />
    <div v-if="panes.length === 2" class="workspace-divider" title="Reset split" @pointerdown="startDivider" @dblclick="controller.execute({ kind: 'set-split-ratio', ratio: 0.5 })" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CaretPositionUpdate, CaretSession } from '@/util/caretPosition'
import { createElectronCrashDraftPort, createElectronNativeGesturePort, createElectronTransferPort, createMoveTabToNewWindowAction, createPaneEditorComposition, createWorkspaceRuntime, type PaneEditorComposition } from '@/workspace'
import type { WorkspaceTabMenuActions, WorkspaceTabMenuTarget } from '@/contextMenu/tabs'
import type { TransferAck, TransferCommand, TransferRecoveryPayload, TransferRecoveryMessage } from 'main_renderer/tabTransfer'
import type { CrashDraftRecoveryPayload, PortableHistory } from '@shared/workspace'
import { useEditorStore } from '@/store/editor'
import { useLayoutStore } from '@/store/layout'
import { usePreferencesStore } from '@/store/preferences'
import PaneEditor from './pane.vue'

const props = defineProps<{ markdown: string; cursor: unknown; muyaIndexCursor?: unknown; caretSession: CaretSession; sourceCode: boolean; tabBarVisible: boolean; textDirection: string; platform: string }>()
defineEmits<{ 'caret-position': [update: CaretPositionUpdate] }>()
const editorStore = useEditorStore()
const layoutStore = useLayoutStore()
const preferencesStore = usePreferencesStore()
const seed = editorStore.currentFile
const controller = createWorkspaceRuntime(seed ? [{ documentId: seed.id, markdown: seed.markdown, title: seed.filename, ...(seed.pathname ? { fileKey: seed.pathname } : {}) }] : [{ markdown: props.markdown, title: 'New Tab' }])
const left = createPaneEditorComposition({ paneId: 'left', controller })
const right = createPaneEditorComposition({ paneId: 'right', controller })
const transfer = createElectronTransferPort()
const nativeGesture = createElectronNativeGesturePort()
const moveTabToNewWindow = createMoveTabToNewWindowAction(controller, transfer, {
  flushSource: (paneId, tabId) => (paneId === 'left' ? left : right).flushTransferSource(tabId)
})
const activateWorkspaceMenuTarget = async (target: WorkspaceTabMenuTarget) => {
  const pane = controller.getProjection().panes.find(candidate => candidate.paneId === target.paneId)
  const tab = pane?.tabs.find(candidate =>
    candidate.viewId === target.viewId && candidate.documentId === target.documentId
  )
  if (!tab) return { status: 'rejected' as const, reason: 'clicked workspace tab is unavailable' }
  return controller.execute({ kind: 'activate-view', paneId: target.paneId, viewId: target.viewId })
}
const workspaceTabActions: WorkspaceTabMenuActions = {
  activate: activateWorkspaceMenuTarget,
  move: async (target) => {
    const activated = await activateWorkspaceMenuTarget(target)
    return activated.status === 'applied'
      ? moveTabToNewWindow(target.documentId, target.paneId)
      : activated
  },
  open: async (target) => {
    const activated = await activateWorkspaceMenuTarget(target)
    if (activated.status !== 'applied') return activated
    if (!target.fileKey) return { status: 'rejected', reason: 'untitled tabs have no disk copy to open' }
    // Only the canonical saved path crosses this boundary. Dirty editor text is
    // deliberately not sent, so the target opens the last disk version.
    window.electron.ipcRenderer.send('mt::cmd-open-file-in-new-window', target.fileKey)
    return { status: 'applied' }
  },
  splitRight: async (target) => {
    const activated = await activateWorkspaceMenuTarget(target)
    return activated.status === 'applied'
      ? controller.execute({ kind: 'split-pane', targetPaneId: 'right' })
      : activated
  }
}
const crashDraft = createElectronCrashDraftPort()
interface StagedTransfer { readonly documentId: string; readonly sourceDocumentId: string; readonly sourceViewId: string }
const stagedTransfers = new Map<string, StagedTransfer>()
const workspaceReason = (result: { readonly status: string; readonly reason?: string }): string => result.reason ?? 'workspace command was rejected'
const root = ref<HTMLElement | null>(null)
const workspaceWidth = ref(0)
const ratio = computed(() => snapshot.value.projection.splitRatio ?? 0.5)
const splitPreview = ref<'left' | 'right' | null>(null)
let draggedViewId: string | undefined
let committedDragViewId: string | undefined
let committedDragTarget: 'left' | 'right' | undefined
let nativeDrag: { readonly gestureId: string; readonly tabId: string; readonly paneId: 'left' | 'right' } | undefined
const snapshot = ref(controller.getFacadeSnapshot())
const panes = computed(() => snapshot.value.projection.panes)
let legacySourceProjectionKey = `${snapshot.value.projection.focusedPaneId}:${snapshot.value.projection.panes.find((pane) => pane.paneId === snapshot.value.projection.focusedPaneId)?.activeViewId ?? ''}`
const compositionFor = (paneId: 'left' | 'right'): PaneEditorComposition => paneId === 'left' ? left : right
const candidateAt = (x?: number, y?: number): 'left' | 'right' | null => {
  const rect = root.value?.getBoundingClientRect()
  const documentRects = [...(root.value?.querySelectorAll<HTMLElement>('.workspace-pane .editor-component') ?? [])]
  if (
    !rect || workspaceWidth.value < 720 || x === undefined || y === undefined ||
    x < rect.left || x > rect.right || y < rect.top || y > rect.bottom ||
    !documentRects.some((documentRect) => {
      const bounds = documentRect.getBoundingClientRect()
      return y >= bounds.top && y <= bounds.bottom
    })
  ) return null
  if (x <= rect.left + rect.width * 0.31) return 'left'
  if (x >= rect.right - rect.width * 0.31) return 'right'
  return null
}
const handleTabDrag = (event: {
  phase: 'start' | 'move' | 'end' | 'cancel'
  viewId?: string
  beforeViewId?: string
  x?: number
  y?: number
}) => {
  if (event.phase === 'start') {
    draggedViewId = event.viewId
    committedDragViewId = undefined
    committedDragTarget = undefined
  }
  if (event.phase === 'move') splitPreview.value = candidateAt(event.x, event.y)
  if (event.phase === 'cancel') {
    draggedViewId = undefined
    committedDragViewId = undefined
    committedDragTarget = undefined
    splitPreview.value = null
  }
  if (event.phase === 'end') {
    splitPreview.value = null
    const committedViewId = committedDragViewId
    const committedTarget = committedDragTarget
    if (committedViewId && committedTarget) {
      const projection = controller.getProjection()
      if (projection.panes.length === 1) {
        controller.execute({ kind: 'activate-view', paneId: 'left', viewId: committedViewId }).then(() =>
          controller.execute({ kind: 'split-pane', targetPaneId: committedTarget })
        )
      } else {
        controller.execute({ kind: 'move-view', viewId: committedViewId, targetPaneId: committedTarget })
      }
    } else if (event.viewId) {
      const pane = controller.getProjection().panes.find((candidate) =>
        candidate.tabs.some((tab) => tab.viewId === event.viewId)
      )
      if (pane) {
        controller.execute({
          kind: 'reorder-view',
          paneId: pane.paneId,
          viewId: event.viewId,
          ...(event.beforeViewId ? { beforeViewId: event.beforeViewId } : {})
        })
      }
    }
    draggedViewId = undefined
    committedDragViewId = undefined
    committedDragTarget = undefined
  }
}
const handleTabPress = (paneId: 'left' | 'right', event: { viewId?: string; button: number; trusted: boolean }) => {
  if (!event.trusted || event.button !== 0 || !event.viewId) return
  const tab = controller.getProjection().panes.find((pane) => pane.paneId === paneId)?.tabs.find((candidate) => candidate.viewId === event.viewId)
  if (!tab) return
  const gestureId = crypto.randomUUID()
  nativeDrag = { gestureId, tabId: tab.documentId, paneId }
  nativeGesture.begin(gestureId).then((enabled) => {
    if (!enabled && nativeDrag?.gestureId === gestureId) nativeDrag = undefined
  }).catch(() => {
    if (nativeDrag?.gestureId === gestureId) nativeDrag = undefined
  })
}
const releaseTabDrag = (event: PointerEvent) => {
  const target = candidateAt(event.clientX, event.clientY)
  const viewId = draggedViewId
  splitPreview.value = null
  if (event.button !== 0 || !target || !viewId) {
    draggedViewId = undefined
    return
  }
  committedDragViewId = viewId
  committedDragTarget = target
  draggedViewId = undefined
}
const updateWidth = () => { workspaceWidth.value = root.value?.clientWidth ?? 0 }
let observer: ResizeObserver | undefined
let dividerPointer: number | undefined
const moveDivider = (event: PointerEvent) => {
  const rect = root.value?.getBoundingClientRect()
  if (dividerPointer !== event.pointerId || !rect || rect.width <= 0) return
  const minimum = Math.min(0.5, 320 / rect.width)
  const rawRatio = (event.clientX - rect.left) / rect.width
  controller.execute({
    kind: 'set-split-ratio',
    ratio: Math.max(minimum, Math.min(1 - minimum, rawRatio))
  })
}
const endDivider = (event: PointerEvent) => {
  if (dividerPointer !== event.pointerId) return
  dividerPointer = undefined
  window.removeEventListener('pointermove', moveDivider)
  window.removeEventListener('pointerup', endDivider)
  window.removeEventListener('pointercancel', endDivider)
}
const startDivider = (event: PointerEvent) => {
  if (event.button !== 0) return
  dividerPointer = event.pointerId
  window.addEventListener('pointermove', moveDivider)
  window.addEventListener('pointerup', endDivider)
  window.addEventListener('pointercancel', endDivider)
}
let legacyCommandPane: 'left' | 'right' | undefined
const openTransferPayload = async (
  payload: TransferRecoveryPayload,
  transferId: string,
  portableHistory?: PortableHistory
): Promise<StagedTransfer> => {
  const bootstrap = controller.getFacadeSnapshot().documents
  const bootstrapViewId = bootstrap.length === 1 &&
    !bootstrap[0].fileKey && !bootstrap[0].dirty && !bootstrap[0].markdown.trim()
    ? bootstrap[0].viewId
    : undefined
  const staged = stagedTransfers.get(transferId) ?? {
    // Document IDs are window-local. Source identity remains lineage metadata,
    // never an adopted target document identity.
    documentId: `transfer-target:${crypto.randomUUID()}`,
    sourceDocumentId: payload.sourceDocumentId,
    sourceViewId: payload.sourceViewId
  }
  const opened = await controller.execute({
    kind: 'open-document',
    document: {
      documentId: staged.documentId,
      documentRevision: payload.documentRevision,
      markdown: payload.markdown,
      savedMarkdown: payload.dirty ? '' : payload.markdown,
      dirty: payload.dirty,
      ...(portableHistory ? { portableHistory } : {}),
      title: payload.title,
      ...(payload.fileKey ? { fileKey: payload.fileKey, observedDiskRevision: payload.observedDiskRevision } : {}),
      conflict: payload.conflict
    }
  })
  if (opened.status !== 'applied') throw new Error(workspaceReason(opened))
  if (bootstrapViewId) {
    const closed = await controller.execute({ kind: 'close-view', viewId: bootstrapViewId })
    if (closed.status !== 'applied') throw new Error(workspaceReason(closed))
  }
  stagedTransfers.set(transferId, staged)
  return staged
}
const openCrashDraft = async (payload: CrashDraftRecoveryPayload): Promise<void> => {
  const { draft } = payload
  // Crash drafts carry source identity, but recovery opens in a fresh window
  // whose bootstrap tab may legitimately use the same controller-local id.
  const recoveredDocumentId = `crash-recovery:${draft.documentId}`
  left.setCrashDraftLineage(recoveredDocumentId, draft.documentId)
  right.setCrashDraftLineage(recoveredDocumentId, draft.documentId)
  const opened = await controller.execute({
    kind: 'open-document',
    document: {
      documentId: recoveredDocumentId,
      // Advance the recovered draft before checkpointing so its fresh opaque
      // receipt can tombstone the pre-crash revision after Save/Discard.
      documentRevision: draft.documentRevision + 1,
      markdown: draft.markdown,
      savedMarkdown: '',
      dirty: true,
      title: draft.fileKey?.split(/[\\/]/).pop() ?? 'Recovered Draft',
      ...(draft.fileKey ? { fileKey: draft.fileKey, observedDiskRevision: draft.observedDiskRevision } : {}),
      ...(payload.conflict ? { conflict: true } : {}),
      view: { cursor: draft.view.cursor, selection: draft.view.selection }
    }
  })
  if (opened.status !== 'applied') throw new Error(workspaceReason(opened))
  const recovered = controller.getFacadeSnapshot().documents.find(document => document.documentId === recoveredDocumentId)
  const pane = recovered && controller.getProjection().panes.find(candidate => candidate.tabs.some(tab => tab.viewId === recovered.viewId))
  if (recovered && pane) {
    await controller.execute({ kind: 'activate-view', paneId: pane.paneId, viewId: recovered.viewId })
    await compositionFor(pane.paneId).checkpointCrashDraft()
  }
  await controller.execute({
    kind: 'replace-warnings',
    warnings: [
      ...(payload.warning ? [{ id: `recovery:${draft.documentId}`, kind: 'recovery' as const, message: payload.warning }] : []),
      ...(payload.conflict ? [{ id: `conflict:${draft.documentId}`, kind: 'conflict' as const, message: 'The saved file changed after the crash; a conflicted recovery copy was opened.' }] : [])
    ]
  })
}
const acknowledgeTransferCommand = async (command: TransferCommand): Promise<TransferAck> => {
  if (command.operation === 'prepare') {
    const response = await transfer.payload(command.transferId)
    if (!response.durable) return { status: 'nack', reason: response.reason }
    if (!response.payload.sourcePreflightId) return { status: 'nack', reason: 'source preflight fence is unavailable' }
    const sealedRevision = await controller.prepareTransfer(
      command.transferId,
      response.payload.sourceDocumentId,
      response.payload.sourceViewId,
      command.documentRevision,
      response.payload.sourcePreflightId
    )
    return sealedRevision === undefined
      ? { status: 'nack', reason: 'source document revision could not be sealed' }
      : { status: 'ok', sealedRevision }
  }
  if (!command.capability) return { status: 'nack', reason: 'missing transfer capability' }
  if (command.operation === 'stage') {
    const response = await transfer.payload(command.transferId, command.capability)
    if (!response.durable) return { status: 'nack', reason: response.reason }
    await openTransferPayload(response.payload, command.transferId, response.payload.history)
    return { status: 'ok' }
  }
  if (command.operation === 'release') {
    const response = await transfer.payload(command.transferId, command.capability)
    if (!response.durable) return { status: 'nack', reason: response.reason }
    const closed = await controller.releaseTransfer(command.transferId, response.payload.sourceDocumentId, response.payload.sourceViewId)
    return closed.status === 'applied' ? { status: 'ok' } : { status: 'nack', reason: workspaceReason(closed) }
  }
  if (command.operation === 'activate') {
    const staged = stagedTransfers.get(command.transferId)
    const view = staged && controller.getFacadeSnapshot().documents.find((document) => document.documentId === staged.documentId)
    if (!view) return { status: 'nack', reason: 'staged target is unavailable' }
    const pane = controller.getProjection().panes.find((candidate) => candidate.tabs.some((tab) => tab.viewId === view.viewId))
    if (!pane) return { status: 'nack', reason: 'staged target pane is unavailable' }
    const activated = await controller.execute({ kind: 'activate-view', paneId: pane.paneId, viewId: view.viewId })
    return activated.status === 'applied' ? { status: 'ok' } : { status: 'nack', reason: workspaceReason(activated) }
  }
  if (command.operation === 'checkpoint') {
    const staged = stagedTransfers.get(command.transferId)
    const document = staged && controller.getFacadeSnapshot().documents.find((candidate) => candidate.documentId === staged.documentId)
    if (!document) return { status: 'nack', reason: 'target checkpoint document is unavailable' }
    if (document.fileKey && document.observedDiskRevision === undefined) {
      return { status: 'nack', reason: 'target checkpoint disk baseline is unavailable' }
    }
    if (!document.dirty) return { status: 'ok' }
    const pane = controller.getProjection().panes.find((candidate) => candidate.tabs.some((tab) => tab.viewId === document.viewId))
    const composition = pane?.paneId === 'left' ? left : pane?.paneId === 'right' ? right : undefined
    if (composition) {
      const durable = await composition.hasDurableCrashDraft(document.documentId, document.documentRevision)
      return durable
        ? { status: 'ok' }
        : { status: 'nack', reason: 'target crash-draft checkpoint was not durable' }
    }
    const response = await window.electron.ipcRenderer.invoke('mt::workspace::crash-draft', {
      kind: 'checkpoint',
      checkpoint: {
        documentId: document.documentId,
        ...(document.fileKey ? { fileKey: document.fileKey, observedDiskRevision: document.observedDiskRevision! } : {}),
        documentRevision: document.documentRevision,
        markdown: document.markdown,
        view: { cursor: document.cursor, selection: document.selection }
      }
    }) as { durable: boolean }
    return response.durable ? { status: 'ok' } : { status: 'nack', reason: 'target crash-draft checkpoint was not durable' }
  }
  return { status: 'ok' }
}
const syncLegacyCommandEdge = () => {
  const paneId = snapshot.value.projection.focusedPaneId
  if (paneId === legacyCommandPane) return
  legacyCommandPane = paneId
  editorStore.ATTACH_WORKSPACE_COMPOSITION(compositionFor(paneId))
}
const syncTabBarVisibility = () => {
  if (snapshot.value.projection.panes.some((pane) => pane.tabs.length > 1)) {
    layoutStore.showTabBar()
  }
}
const syncLegacySourceMode = () => {
  const focusedPane = snapshot.value.projection.panes.find((pane) =>
    pane.paneId === snapshot.value.projection.focusedPaneId
  )
  const projectionKey = `${focusedPane?.paneId ?? ''}:${focusedPane?.activeViewId ?? ''}`
  if (projectionKey === legacySourceProjectionKey) return
  legacySourceProjectionKey = projectionKey
  const activeMode = focusedPane?.tabs.find((tab) => tab.viewId === focusedPane.activeViewId)?.mode
  if (activeMode && preferencesStore.sourceCode !== (activeMode === 'source')) {
    preferencesStore.SET_MODE({ type: 'sourceCode', checked: activeMode === 'source' })
  }
}
const unsubscribe = controller.subscribe(() => {
  snapshot.value = controller.getFacadeSnapshot()
  syncLegacyCommandEdge()
  syncLegacySourceMode()
  syncTabBarVisibility()
})
editorStore.ATTACH_WORKSPACE_FACADE(controller)
syncLegacyCommandEdge()
onMounted(async () => {
  observer = new ResizeObserver(updateWidth)
  if (root.value) observer.observe(root.value)
  updateWidth()
  // Capture sees Dragula spills as the same primary release before DOM drop handling.
  window.addEventListener('pointerup', releaseTabDrag, true)
  // T06 test/automation seam; this invokes the exact action future T08 UI will import.
  moveActionDriver.__mtMoveTabToNewWindow = ({ tabId, paneId }) => moveTabToNewWindow(tabId, paneId)
  moveActionDriver.__mtWorkspaceSnapshot = () => structuredClone(controller.getFacadeSnapshot())
  stopTransferCommands = transfer.bind(acknowledgeTransferCommand)
  stopNativeGestureCommit = nativeGesture.bindCommit(({ gestureId, releasePoint }) => {
    const drag = nativeDrag
    if (!drag || drag.gestureId !== gestureId) return
    nativeDrag = undefined
    moveTabToNewWindow(drag.tabId, drag.paneId, releasePoint).catch(() => undefined)
  })
  stopTransferRecovery = transfer.bindRecovery(async (message: TransferRecoveryMessage) => {
    await openTransferPayload(message.payload, message.transferId)
    await transfer.recoveryMaterialized(message.transferId)
  })
  const recovered = await crashDraft.request({ kind: 'recover' })
  if (recovered.durable) for (const payload of recovered.recoveries ?? []) await openCrashDraft(payload)
  transfer.ready().catch(() => undefined)
})
let stopTransferCommands: (() => void) | undefined
let stopTransferRecovery: (() => void) | undefined
let stopNativeGestureCommit: (() => void) | undefined
type MoveActionDriver = Window & {
  __mtMoveTabToNewWindow?: (input: { readonly tabId: string; readonly paneId: 'left' | 'right' }) => Promise<unknown>
  __mtWorkspaceSnapshot?: () => ReturnType<typeof controller.getFacadeSnapshot>
}
const moveActionDriver = window as MoveActionDriver
onBeforeUnmount(() => {
  observer?.disconnect()
  unsubscribe()
  controller.dispose()
  editorStore.DETACH_WORKSPACE_COMPOSITION()
  editorStore.DETACH_WORKSPACE_FACADE()
  window.removeEventListener('pointermove', moveDivider)
  window.removeEventListener('pointerup', endDivider)
  window.removeEventListener('pointercancel', endDivider)
  window.removeEventListener('pointerup', releaseTabDrag, true)
  stopTransferCommands?.()
  stopTransferRecovery?.()
  stopNativeGestureCommit?.()
  delete moveActionDriver.__mtMoveTabToNewWindow
  delete moveActionDriver.__mtWorkspaceSnapshot
})
</script>

<style scoped>
.editor-with-tabs { position: relative; height: 100%; min-width: 0; flex: 1; display: flex; overflow: hidden; background: var(--editorBgColor); }
.editor-with-tabs.split > .workspace-pane { min-width: 320px; }
.editor-with-tabs.split > .workspace-pane:first-child { flex-basis: calc(v-bind(ratio) * 100%); }
.editor-with-tabs.preview::before { content: ''; display: block; flex: 0 0 50%; box-sizing: border-box; border: 1px solid var(--appShellAccent); background: color-mix(in srgb, var(--appShellAccent) 12%, var(--editorBgColor)); transition: flex-basis 180ms ease; }
.editor-with-tabs.preview > .workspace-pane { flex: 0 0 50%; transition: flex-basis 180ms ease; }
.editor-with-tabs.preview-left::before { order: 0; }
.editor-with-tabs.preview-left > .workspace-pane { order: 1; }
.editor-with-tabs.preview-right::before { order: 1; }
.editor-with-tabs.preview-right > .workspace-pane { order: 0; }
@media (prefers-reduced-motion: reduce) { .editor-with-tabs.preview::before, .editor-with-tabs.preview > .workspace-pane { transition-duration: 0ms; } }
.workspace-divider { z-index: 5; flex: 0 0 5px; cursor: col-resize; background: var(--appShellDivider); }
</style>
