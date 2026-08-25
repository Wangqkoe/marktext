<template>
  <div ref="root" class="editor-with-tabs" :class="{ split: panes.length === 2, preview: splitPreview }">
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
    />
    <div v-if="panes.length === 2" class="workspace-divider" title="Reset split" @pointerdown="startDivider" @dblclick="ratio = 0.5" />
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
const ratio = ref(0.5)
const splitPreview = ref<'left' | 'right' | null>(null)
const snapshot = ref(controller.getFacadeSnapshot())
const panes = computed(() => snapshot.value.projection.panes)
const compositionFor = (paneId: 'left' | 'right'): PaneEditorComposition => paneId === 'left' ? left : right
const setPreview = (candidate: 'left' | 'right' | null) => { splitPreview.value = candidate }
const updateWidth = () => { workspaceWidth.value = root.value?.clientWidth ?? 0 }
let observer: ResizeObserver | undefined
let dividerPointer: number | undefined
const moveDivider = (event: PointerEvent) => { if (dividerPointer !== event.pointerId || !root.value) return; const width = root.value.clientWidth; ratio.value = Math.max(320 / width, Math.min(1 - 320 / width, event.clientX / width)) }
const endDivider = (event: PointerEvent) => { if (dividerPointer !== event.pointerId) return; dividerPointer = undefined; window.removeEventListener('pointermove', moveDivider); window.removeEventListener('pointerup', endDivider) }
const startDivider = (event: PointerEvent) => { dividerPointer = event.pointerId; window.addEventListener('pointermove', moveDivider); window.addEventListener('pointerup', endDivider) }
const unsubscribe = controller.subscribe(() => { snapshot.value = controller.getFacadeSnapshot() })
editorStore.ATTACH_WORKSPACE_COMPOSITION(left)
editorStore.ATTACH_WORKSPACE_FACADE(controller)
onMounted(() => { observer = new ResizeObserver(updateWidth); if (root.value) observer.observe(root.value); updateWidth() })
onBeforeUnmount(() => { observer?.disconnect(); unsubscribe(); controller.dispose(); editorStore.DETACH_WORKSPACE_COMPOSITION(); editorStore.DETACH_WORKSPACE_FACADE(); window.removeEventListener('pointermove', moveDivider); window.removeEventListener('pointerup', endDivider) })
</script>

<style scoped>
.editor-with-tabs { position: relative; height: 100%; min-width: 0; flex: 1; display: flex; overflow: hidden; background: var(--editorBgColor); }
.editor-with-tabs.split > .workspace-pane:first-child { flex-basis: calc(v-bind(ratio) * 100%); }
.editor-with-tabs.preview::before { content: ''; position: absolute; inset: 0; z-index: 4; pointer-events: none; background: linear-gradient(to right, transparent 49.8%, var(--appShellAccent) 49.8%, var(--appShellAccent) 50.2%, transparent 50.2%); transition: opacity 180ms ease; }
@media (prefers-reduced-motion: reduce) { .editor-with-tabs.preview::before { transition-duration: 0ms; } }
.workspace-divider { z-index: 5; flex: 0 0 5px; cursor: col-resize; background: var(--appShellDivider); }
</style>
