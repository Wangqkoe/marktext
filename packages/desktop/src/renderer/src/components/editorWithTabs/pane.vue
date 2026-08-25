<template>
  <section class="workspace-pane" :class="{ focused }" @pointerdown="focusPane">
    <tabs
      v-show="tabBarVisible"
      :composition="composition"
      :pane="pane"
      :workspace-width="workspaceWidth"
      @preview-split="$emit('preview-split', $event)"
    />
    <div v-if="activeFile" class="container">
      <editor
        :markdown="activeFile.markdown"
        :cursor="activeFile.cursor"
        :caret-session="caretSession"
        :text-direction="textDirection"
        :platform="platform"
        :composition="composition"
        :active-file="activeFile"
        :pane-tabs="paneFiles"
        :focused="focused"
        @caret-position="$emit('caret-position', $event)"
      />
      <source-code
        v-if="activeMode === 'source'"
        :markdown="activeFile.markdown"
        :muya-index-cursor="activeFile.muyaIndexCursor"
        :caret-session="caretSession"
        :text-direction="textDirection"
        :composition="composition"
        :active-file="activeFile"
        :focused="focused"
        @caret-position="$emit('caret-position', $event)"
      />
    </div>
    <tab-notifications :composition="composition" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IFileState } from '@shared/types/files'
import type { WorkspaceFacadeDocument, WorkspaceProjectionPane } from '@shared/workspace'
import type { CaretPositionUpdate, CaretSession } from '@/util/caretPosition'
import type { PaneEditorComposition } from '@/workspace'
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'

const props = defineProps<{
  pane: WorkspaceProjectionPane
  documents: readonly WorkspaceFacadeDocument[]
  composition: PaneEditorComposition
  focused: boolean
  workspaceWidth: number
  caretSession: CaretSession
  tabBarVisible: boolean
  textDirection: string
  platform: string
}>()
const emit = defineEmits<{
  'caret-position': [update: CaretPositionUpdate]
  'preview-split': [candidate: 'left' | 'right' | null]
}>()

const paneFiles = computed(() => props.pane.tabs.flatMap((tab) => {
  const document = props.documents.find((candidate) => candidate.viewId === tab.viewId)
  return document ? [{
    id: tab.documentId,
    filename: tab.title,
    pathname: tab.fileKey ?? '',
    markdown: document.markdown,
    cursor: document.cursor,
    muyaIndexCursor: document.cursor,
    scrollTop: document.scrollTop,
    isSaved: !tab.dirty,
    history: document.portableHistory,
    encoding: document.encoding,
    lineEnding: document.lineEnding,
    adjustLineEndingOnSave: document.adjustLineEndingOnSave,
    trimTrailingNewline: document.trailingNewline === 'ensure-one' ? 1 : 0
  } as unknown as IFileState] : []
}))
const activeFile = computed(() => paneFiles.value[props.pane.tabs.findIndex((tab) => tab.viewId === props.pane.activeViewId)])
const activeMode = computed(() => props.pane.tabs.find((tab) => tab.viewId === props.pane.activeViewId)?.mode)
const focusPane = () => {
  if (!props.focused) void props.composition.execute({ kind: 'focus-pane', paneId: props.pane.paneId })
}
</script>

<style scoped>
.workspace-pane { min-width: 0; min-height: 0; flex: 1 1 50%; display: flex; flex-direction: column; overflow: hidden; background: var(--editorBgColor); }
.workspace-pane > .container { min-height: 0; flex: 1; overflow: hidden; }
</style>
