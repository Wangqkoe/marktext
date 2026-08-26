<template>
  <div ref="root" class="editor-with-tabs" :class="{ split: panes.length === 2, preview: splitPreview, 'preview-left': splitPreview === 'left', 'preview-right': splitPreview === 'right' }">
    <pane-editor
      v-for="pane in panes"
      :key="pane.paneId"
      :pane="pane"
      :documents="snapshot.documents"
      :composition="compositionFor(pane.paneId)"
      :focused="snapshot.projection.focusedPaneId === pane.paneId"
      :source-code="sourceCode"
      :caret-session="caretSession"
      :tab-bar-visible="tabBarVisible"
      :text-direction="textDirection"
      :platform="platform"
      @caret-position="$emit('caret-position', $event)"
      @tab-drag="handleTabDrag"
    />
    <div v-if="panes.length === 2" class="workspace-divider" title="Reset split" @pointerdown="startDivider" @dblclick="controller.execute({ kind: 'set-split-ratio', ratio: 0.5 })" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CaretPositionUpdate, CaretSession } from '@/util/caretPosition'
import { createElectronTransferPort, createPaneEditorComposition, createWorkspaceRuntime, type PaneEditorComposition } from '@/workspace'
import type { TransferAck, TransferCommand, TransferRecoveryPayload } from 'main_renderer/tabTransfer'
import type { CrashDraftRecoveryPayload } from '@shared/workspace'
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
const stagedTransfers = new Map<string, string>()
const workspaceReason = (result: { readonly status: string; readonly reason?: string }): string => result.reason ?? 'workspace command was rejected'
const root = ref<HTMLElement | null>(null)
const workspaceWidth = ref(0)
const ratio = computed(() => snapshot.value.projection.splitRatio ?? 0.5)
const splitPreview = ref<'left' | 'right' | null>(null)
let draggedViewId: string | undefined
let committedDragViewId: string | undefined
const snapshot = ref(controller.getFacadeSnapshot())
const panes = computed(() => snapshot.value.projection.panes)
let legacySourceProjectionKey = `${snapshot.value.projection.focusedPaneId}:${snapshot.value.projection.panes.find((pane) => pane.paneId === snapshot.value.projection.focusedPaneId)?.activeViewId ?? ''}`
const compositionFor = (paneId: 'left' | 'right'): PaneEditorComposition => paneId === 'left' ? left : right
const candidateAt = (x?: number, y?: number): 'left' | 'right' | null => {
  const rect = root.value?.getBoundingClientRect()
  if (
    !rect || workspaceWidth.value < 720 || x === undefined || y === undefined ||
    x < rect.left || x > rect.right || y < rect.top || y > rect.bottom
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
  }
  if (event.phase === 'move') splitPreview.value = candidateAt(event.x, event.y)
  if (event.phase === 'cancel') {
    draggedViewId = undefined
    committedDragViewId = undefined
    splitPreview.value = null
  }
  if (event.phase === 'end') {
    splitPreview.value = null
    if (event.viewId && committedDragViewId !== event.viewId) {
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
  }
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
  draggedViewId = undefined
  const projection = controller.getProjection()
  if (projection.panes.length === 1) {
    controller.execute({ kind: 'activate-view', paneId: 'left', viewId }).then(() =>
      controller.execute({ kind: 'split-pane', targetPaneId: target })
    )
  } else {
    controller.execute({ kind: 'move-view', viewId, targetPaneId: target })
  }
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
const openTransferPayload = async (payload: TransferRecoveryPayload, transferId?: string): Promise<void> => {
  const opened = await controller.execute({
    kind: 'open-document',
    document: {
      documentId: payload.sourceDocumentId,
      documentRevision: payload.documentRevision,
      markdown: payload.markdown,
      title: payload.title,
      ...(payload.fileKey ? { fileKey: payload.fileKey, observedDiskRevision: payload.observedDiskRevision } : {}),
      conflict: payload.conflict
    }
  })
  if (opened.status !== 'applied') throw new Error(workspaceReason(opened))
  if (transferId) stagedTransfers.set(transferId, payload.sourceDocumentId)
}
const openCrashDraft = async (payload: CrashDraftRecoveryPayload): Promise<void> => {
  const { draft } = payload
  const opened = await controller.execute({
    kind: 'open-document',
    document: {
      documentId: draft.documentId,
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
  await controller.execute({
    kind: 'replace-warnings',
    warnings: [
      ...(payload.warning ? [{ id: `recovery:${draft.documentId}`, kind: 'recovery' as const, message: payload.warning }] : []),
      ...(payload.conflict ? [{ id: `conflict:${draft.documentId}`, kind: 'conflict' as const, message: 'The saved file changed after the crash; a conflicted recovery copy was opened.' }] : [])
    ]
  })
}
const acknowledgeTransferCommand = async (command: TransferCommand): Promise<TransferAck> => {
  if (!command.capability) return { status: 'nack', reason: 'missing transfer capability' }
  if (command.operation === 'prepare') return { status: 'ok', sealedRevision: command.documentRevision }
  if (command.operation === 'stage') {
    const response = await transfer.payload(command.transferId, command.capability)
    if (!response.durable) return { status: 'nack', reason: response.reason }
    await openTransferPayload(response.payload, command.transferId)
    return { status: 'ok' }
  }
  if (command.operation === 'release') {
    const response = await transfer.payload(command.transferId, command.capability)
    if (!response.durable) return { status: 'nack', reason: response.reason }
    const view = controller.getFacadeSnapshot().documents.find((document) => document.documentId === response.payload.sourceDocumentId)
    if (!view) return { status: 'nack', reason: 'source view is unavailable' }
    const closed = await controller.execute({ kind: 'close-view', viewId: view.viewId })
    return closed.status === 'applied' ? { status: 'ok' } : { status: 'nack', reason: workspaceReason(closed) }
  }
  if (command.operation === 'activate') {
    const documentId = stagedTransfers.get(command.transferId)
    const view = documentId && controller.getFacadeSnapshot().documents.find((document) => document.documentId === documentId)
    if (!view) return { status: 'nack', reason: 'staged target is unavailable' }
    const pane = controller.getProjection().panes.find((candidate) => candidate.tabs.some((tab) => tab.viewId === view.viewId))
    if (!pane) return { status: 'nack', reason: 'staged target pane is unavailable' }
    const activated = await controller.execute({ kind: 'activate-view', paneId: pane.paneId, viewId: view.viewId })
    return activated.status === 'applied' ? { status: 'ok' } : { status: 'nack', reason: workspaceReason(activated) }
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
onMounted(() => {
  observer = new ResizeObserver(updateWidth)
  if (root.value) observer.observe(root.value)
  updateWidth()
  // Capture sees Dragula spills as the same primary release before DOM drop handling.
  window.addEventListener('pointerup', releaseTabDrag, true)
  stopTransferCommands = transfer.bind(acknowledgeTransferCommand)
  stopTransferRecovery = transfer.bindRecovery(async (payload) => openTransferPayload(payload))
  stopCrashRecovery = window.electron.ipcRenderer.on('mt::workspace::crash-recovery', async (_event, payload) => { await openCrashDraft(payload as CrashDraftRecoveryPayload) })
})
let stopTransferCommands: (() => void) | undefined
let stopTransferRecovery: (() => void) | undefined
let stopCrashRecovery: (() => void) | undefined
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
  stopCrashRecovery?.()
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
