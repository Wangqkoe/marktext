<template>
  <div class="app-status-bar">
    <button
      type="button"
      class="sidebar-toggle app-shell-focus-ring"
      :title="toggleLabel"
      :aria-label="toggleLabel"
      :aria-pressed="sidebarVisible"
      @click="$emit('toggle-sidebar')"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="sidebarVisible ? 'm10 3-5 5 5 5' : 'm6 3 5 5-5 5'" />
      </svg>
    </button>
    <button
      type="button"
      class="source-mode-toggle app-shell-focus-ring"
      title="Toggle Source Code Mode"
      aria-label="Toggle Source Code Mode"
      :aria-pressed="sourceMode"
      :disabled="sourceDisabled"
      @click="$emit('toggle-source-mode')"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m5 4-4 4 4 4M11 4l4 4-4 4M9.5 2l-3 12" />
      </svg>
    </button>
    <span class="status-context">{{ context }}</span>
    <span class="status-spacer" />
    <span
      v-if="!sourceDisabled"
      class="status-document-mode"
    >
      {{ sourceMode ? 'Source' : 'Markdown' }}
    </span>
    <span
      v-if="caretLabel"
      class="status-caret-position"
    >
      {{ caretLabel }}
    </span>
    <el-tooltip
      v-if="wordCount"
      placement="top-end"
    >
      <template #content>
        <div class="status-count-detail">
          <span>{{ t('menu.counter.words') }}:</span><span>{{ wordCount.word }}</span>
        </div>
        <div class="status-count-detail">
          <span>{{ t('menu.counter.characters') }}:</span><span>{{ wordCount.character }}</span>
        </div>
        <div class="status-count-detail">
          <span>{{ t('menu.counter.paragraphs') }}:</span><span>{{ wordCount.paragraph }}</span>
        </div>
        <div class="status-count-detail">
          <span>All characters:</span><span>{{ wordCount.all }}</span>
        </div>
      </template>
      <button
        type="button"
        class="word-count app-shell-focus-ring"
        @click.stop="cycleWordCount"
        @keydown.enter.space.prevent.stop="cycleWordCount"
      >
        <span class="text-center-vertical">{{
          `${countLabels[displayedCountMode]} ${wordCount[displayedCountMode]}`
        }}</span>
      </button>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FileWordCount } from '@shared/types/files'
import { formatCaretPosition, type CaretPosition } from '@/util/caretPosition'

const props = defineProps<{
  context: string
  sidebarVisible: boolean
  sourceMode: boolean
  sourceDisabled: boolean
  caretPosition?: CaretPosition | null
  wordCount?: FileWordCount | null
  toggleLabel: string
}>()

defineEmits<{
  'toggle-sidebar': []
  'toggle-source-mode': []
}>()

const { t } = useI18n()
const caretLabel = computed(() => formatCaretPosition(props.caretPosition ?? null))
const countModes = ['word', 'paragraph', 'character', 'all'] as const
const countLabels: Record<(typeof countModes)[number], string> = {
  word: 'W',
  paragraph: 'P',
  character: 'C',
  all: 'A'
}
const displayedCountMode = ref<(typeof countModes)[number]>('word')

const cycleWordCount = (): void => {
  const nextIndex = (countModes.indexOf(displayedCountMode.value) + 1) % countModes.length
  displayedCountMode.value = countModes[nextIndex]!
}
</script>

<style scoped>
.app-status-bar {
  display: flex;
  height: var(--appShellStatusBarHeight);
  box-sizing: border-box;
  align-items: center;
  color: var(--appShellStrongFg);
  font-size: 11px;
  background: var(--appShellSidebarBg);
  border-top: 1px solid var(--appShellVisibleDivider);
  user-select: none;
}

.sidebar-toggle,
.source-mode-toggle {
  display: inline-grid;
  width: 34px;
  min-width: 34px;
  height: 100%;
  padding: 0;
  place-items: center;
  color: var(--appShellStrongFg);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.sidebar-toggle svg,
.source-mode-toggle svg {
  display: block;
  width: 16px;
  height: 16px;
}

.sidebar-toggle:hover,
.source-mode-toggle:hover:not(:disabled) {
  color: var(--appShellStrongFg);
  background: var(--appShellHoverBg);
}

.source-mode-toggle[aria-pressed='true'] {
  color: var(--appShellStrongFg);
  background: var(--appShellHoverBg);
}

.source-mode-toggle:disabled {
  cursor: not-allowed;
  opacity: var(--appShellDisabledOpacity);
}

.status-context {
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  color: var(--appShellStrongFg);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-spacer {
  flex: 1;
  min-width: 8px;
}

.status-document-mode {
  padding: 0 8px;
  color: var(--appShellStrongFg);
}

.status-caret-position {
  padding: 0 8px;
  color: var(--appShellStrongFg);
  white-space: nowrap;
}

.word-count {
  height: 100%;
  padding: 0 8px;
  border: 0;
  cursor: pointer;
  color: var(--appShellStrongFg);
  font: inherit;
  line-height: calc(var(--appShellStatusBarHeight) - 1px);
  text-align: center;
  background: transparent;
}

.word-count:hover {
  color: var(--appShellStrongFg);
  background: var(--appShellHoverBg);
}

.status-count-detail {
  display: flex;
  min-width: 110px;
  justify-content: space-between;
  gap: 12px;
}
</style>
