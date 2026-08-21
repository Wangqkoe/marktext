<template>
  <div class="editor-with-tabs">
    <tabs v-show="tabBarVisible" />
    <div class="container">
      <editor
        :markdown="markdown"
        :cursor="cursor"
        :caret-session="caretSession"
        :text-direction="textDirection"
        :platform="platform"
        @caret-position="$emit('caret-position', $event)"
      />
      <source-code
        v-if="sourceCode"
        :markdown="markdown"
        :muya-index-cursor="muyaIndexCursor"
        :caret-session="caretSession"
        :text-direction="textDirection"
        @caret-position="$emit('caret-position', $event)"
      />
    </div>
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'
import type { CaretPositionUpdate, CaretSession } from '@/util/caretPosition'

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
