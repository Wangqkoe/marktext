<template>
  <div class="app-status-bar">
    <button
      type="button"
      class="sidebar-toggle"
      :title="toggleLabel"
      :aria-label="toggleLabel"
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
      class="source-mode-toggle"
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
      <div
        class="word-count"
        @click.stop="cycleWordCount"
      >
        <span class="text-center-vertical">{{
          `${countLabels[shownCount]} ${wordCount[shownCount]}`
        }}</span>
      </div>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FileWordCount } from '@shared/types/files'

defineProps<{
  context: string
  sidebarVisible: boolean
  sourceMode: boolean
  sourceDisabled: boolean
  wordCount?: FileWordCount | null
  toggleLabel: string
}>()

defineEmits<{
  'toggle-sidebar': []
  'toggle-source-mode': []
}>()

const { t } = useI18n()
const countModes = ['word', 'paragraph', 'character', 'all'] as const
const countLabels: Record<(typeof countModes)[number], string> = {
  word: 'W',
  paragraph: 'P',
  character: 'C',
  all: 'A'
}
const shownCount = ref<(typeof countModes)[number]>('word')

const cycleWordCount = (): void => {
  const nextIndex = (countModes.indexOf(shownCount.value) + 1) % countModes.length
  shownCount.value = countModes[nextIndex]!
}
</script>

<style scoped>
.app-status-bar {
  display: flex;
  height: var(--appShellStatusBarHeight);
  box-sizing: border-box;
  align-items: center;
  color: var(--appShellFg);
  font-size: 11px;
  background: var(--appShellSidebarBg);
  border-top: 1px solid var(--appShellDivider);
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
  color: var(--appShellIcon);
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

.sidebar-toggle:focus-visible,
.source-mode-toggle:focus-visible {
  outline: 1px solid var(--appShellFocus);
  outline-offset: -2px;
}

.source-mode-toggle[aria-pressed='true'] {
  color: var(--appShellStrongFg);
  background: var(--appShellHoverBg);
}

.source-mode-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.status-context {
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  color: var(--appShellMutedFg);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-spacer {
  flex: 1;
  min-width: 8px;
}

.status-document-mode {
  padding: 0 8px;
  color: var(--appShellMutedFg);
}

.word-count {
  height: 100%;
  padding: 0 8px;
  cursor: pointer;
  color: var(--appShellMutedFg);
  line-height: calc(var(--appShellStatusBarHeight) - 1px);
  text-align: center;
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
