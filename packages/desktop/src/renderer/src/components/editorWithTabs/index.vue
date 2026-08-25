<template>
  <div class="editor-with-tabs">
    <tabs v-show="tabBarVisible" :composition="composition" />
    <div class="container">
      <editor
        :markdown="markdown"
        :cursor="cursor"
        :caret-session="caretSession"
        :text-direction="textDirection"
        :platform="platform"
        :composition="composition"
        @caret-position="$emit('caret-position', $event)"
      />
      <source-code
        v-if="sourceCode"
        :markdown="markdown"
        :muya-index-cursor="muyaIndexCursor"
        :caret-session="caretSession"
        :text-direction="textDirection"
        :composition="composition"
        @caret-position="$emit('caret-position', $event)"
      />
    </div>
    <tab-notifications :composition="composition" />
  </div>
</template>

<script setup lang="ts">
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'
import { onBeforeUnmount } from 'vue'
import type { CaretPositionUpdate, CaretSession } from '@/util/caretPosition'
import { createPaneEditorComposition } from '@/workspace'
import { useEditorStore } from '@/store/editor'

const editorStore = useEditorStore()
// The one-pane shell owns this composition. T03 can replace this local
// assembly with two injected compositions sharing one controller.
const composition = createPaneEditorComposition({ paneId: 'left' })
editorStore.ATTACH_WORKSPACE_COMPOSITION(composition)
onBeforeUnmount(() => editorStore.DETACH_WORKSPACE_COMPOSITION())

defineProps<{
  markdown: string
  // `cursor` originates as `IFileState.cursor` which is `unknown`
  // (see src/shared/types/files.ts); align here instead of forcing every
  // caller to widen.
  cursor: unknown
  muyaIndexCursor?: unknown
  caretSession: CaretSession
  sourceCode: boolean
  tabBarVisible: boolean
  textDirection: string
  platform: string
}>()

defineEmits<{
  'caret-position': [update: CaretPositionUpdate]
}>()
</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  & > .container {
    flex: 1;
    overflow: hidden;
  }
}
</style>
