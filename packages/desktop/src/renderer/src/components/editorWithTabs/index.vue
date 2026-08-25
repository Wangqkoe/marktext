<template>
  <div ref="root" class="editor-with-tabs" :class="{ split: panes.length === 2, preview: splitPreview, 'preview-left': splitPreview === 'left', 'preview-right': splitPreview === 'right' }">
    <pane-editor
      v-for="pane in panes"
      :key="pane.paneId"
      :pane="pane"
      :documents="snapshot.documents"
      :composition="compositionFor(pane.paneId)"
      :focused="snapshot.projection.focusedPaneId === pane.paneId"
      :workspace-width="workspaceWidth"
      :caret-session="caretSession"
      :tab-bar-visible="tabBarVisible"
      :text-direction="textDirection"
      :platform="platform"
      @caret-position="$emit('caret-position', $event)"
      @preview-split="setPreview"
      @tab-drag="handleTabDrag"
    />
    <div v-if="panes.length === 2" class="workspace-divider" title="Reset split" @pointerdown="startDivider" @dblclick="controller.execute({ kind: 'set-split-ratio', ratio: 0.5 })" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CaretPositionUpdate, CaretSession } from '@/util/caretPosition'
import { createPaneEditorComposition, createWorkspaceRuntime, type PaneEditorComposition } from '@/workspace'
import { useEditorStore } from '@/store/editor'
import PaneEditor from './pane.vue'

const props = defineProps<{ markdown: string; cursor: unknown; muyaIndexCursor?: unknown; caretSession: CaretSession; sourceCode: boolean; tabBarVisible: boolean; textDirection: string; platform: string }>()
defineEmits<{ 'caret-position': [update: CaretPositionUpdate] }>()
const editorStore = useEditorStore()
const seed = editorStore.currentFile
const controller = createWorkspaceRuntime(seed ? [{ documentId: seed.id, markdown: seed.markdown, title: seed.filename, ...(seed.pathname ? { fileKey: seed.pathname } : {}) }] : [{ markdown: props.markdown, title: 'New Tab' }])
const left = createPaneEditorComposition({ paneId: 'left', controller })
const right = createPaneEditorComposition({ paneId: 'right', controller })
const root = ref<HTMLElement | null>(null)
const workspaceWidth = ref(0)
const ratio = computed(() => snapshot.value.projection.splitRatio ?? 0.5)
const splitPreview = ref<'left' | 'right' | null>(null)
let draggedViewId: string | undefined
const snapshot = ref(controller.getFacadeSnapshot())
const panes = computed(() => snapshot.value.projection.panes)
const compositionFor = (paneId: 'left' | 'right'): PaneEditorComposition => paneId === 'left' ? left : right
const setPreview = (candidate: 'left' | 'right' | null) => { splitPreview.value = candidate }
const candidateAt = (x?: number, y?: number): 'left' | 'right' | null => {
  const rect = root.value?.getBoundingClientRect()
  if (!rect || workspaceWidth.value < 720 || x === undefined || y === undefined || y < rect.top || y > rect.bottom) return null
  if (x <= rect.left + rect.width * 0.31) return 'left'
  if (x >= rect.right - rect.width * 0.31) return 'right'
  return null
}
const handleTabDrag = (event: { phase: 'start' | 'move' | 'end' | 'cancel'; viewId?: string; x?: number; y?: number }) => {
  if (event.phase === 'start') draggedViewId = event.viewId
  if (event.phase === 'move') splitPreview.value = candidateAt(event.x, event.y)
  if (event.phase === 'cancel' || event.phase === 'end') { splitPreview.value = null; if (event.phase === 'cancel') draggedViewId = undefined }
}
const releaseTabDrag = (event: PointerEvent) => {
  const target = candidateAt(event.clientX, event.clientY)
  const viewId = draggedViewId
  draggedViewId = undefined
  splitPreview.value = null
  if (event.button !== 0 || !target || !viewId) return
  const projection = controller.getProjection()
  if (projection.panes.length === 1) {
    void controller.execute({ kind: 'activate-view', paneId: 'left', viewId }).then(() => controller.execute({ kind: 'split-pane', targetPaneId: target }))
  } else {
    void controller.execute({ kind: 'move-view', viewId, targetPaneId: target })
  }
}
const updateWidth = () => { workspaceWidth.value = root.value?.clientWidth ?? 0 }
let observer: ResizeObserver | undefined
let dividerPointer: number | undefined
const moveDivider = (event: PointerEvent) => { if (dividerPointer !== event.pointerId || !root.value) return; const width = root.value.clientWidth; void controller.execute({ kind: 'set-split-ratio', ratio: Math.max(320 / width, Math.min(1 - 320 / width, event.clientX / width)) }) }
const endDivider = (event: PointerEvent) => { if (dividerPointer !== event.pointerId) return; dividerPointer = undefined; window.removeEventListener('pointermove', moveDivider); window.removeEventListener('pointerup', endDivider) }
const startDivider = (event: PointerEvent) => { dividerPointer = event.pointerId; window.addEventListener('pointermove', moveDivider); window.addEventListener('pointerup', endDivider) }
const unsubscribe = controller.subscribe(() => { snapshot.value = controller.getFacadeSnapshot() })
editorStore.ATTACH_WORKSPACE_COMPOSITION(left)
editorStore.ATTACH_WORKSPACE_FACADE(controller)
onMounted(() => { observer = new ResizeObserver(updateWidth); if (root.value) observer.observe(root.value); updateWidth(); window.addEventListener('pointerup', releaseTabDrag) })
onBeforeUnmount(() => { observer?.disconnect(); unsubscribe(); controller.dispose(); editorStore.DETACH_WORKSPACE_COMPOSITION(); editorStore.DETACH_WORKSPACE_FACADE(); window.removeEventListener('pointermove', moveDivider); window.removeEventListener('pointerup', endDivider); window.removeEventListener('pointerup', releaseTabDrag) })
</script>

<style scoped>
.editor-with-tabs { position: relative; height: 100%; min-width: 0; flex: 1; display: flex; overflow: hidden; background: var(--editorBgColor); }
.editor-with-tabs.split > .workspace-pane:first-child { flex-basis: calc(v-bind(ratio) * 100%); }
.editor-with-tabs.preview::before { content: ''; position: absolute; inset: 0; z-index: 4; pointer-events: none; transition: opacity 180ms ease; }
.editor-with-tabs.preview-left::before { background: linear-gradient(to right, color-mix(in srgb, var(--appShellAccent) 18%, transparent) 0 50%, transparent 50%); }
.editor-with-tabs.preview-right::before { background: linear-gradient(to right, transparent 0 50%, color-mix(in srgb, var(--appShellAccent) 18%, transparent) 50%); }
@media (prefers-reduced-motion: reduce) { .editor-with-tabs.preview::before { transition-duration: 0ms; } }
.workspace-divider { z-index: 5; flex: 0 0 5px; cursor: col-resize; background: var(--appShellDivider); }
</style>
