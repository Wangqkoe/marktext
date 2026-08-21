<template>
  <aside
    v-show="sidebarVisible"
    class="side-bar"
    :style="{ width: `${renderedSidebarWidth}px` }"
  >
    <nav
      class="side-bar-navigation"
      role="tablist"
      :aria-label="t('preferences.general.sidebar.title')"
    >
      <button
        type="button"
        class="side-bar-view-tab"
        role="tab"
        :aria-selected="sidebarView === 'files'"
        :class="{ active: sidebarView === 'files' }"
        @click="layoutStore.selectSidebarView('files')"
      >
        {{ t('sideBar.icons.files') }}
      </button>
      <button
        type="button"
        class="side-bar-view-tab"
        role="tab"
        :aria-selected="sidebarView === 'toc'"
        :class="{ active: sidebarView === 'toc' }"
        @click="layoutStore.selectSidebarView('toc')"
      >
        {{ t('sideBar.icons.toc') }}
      </button>
      <button
        type="button"
        class="side-bar-search-button"
        :title="t('sideBar.icons.search')"
        :aria-label="t('sideBar.icons.search')"
        :aria-pressed="sidebarView === 'search'"
        :class="{ active: sidebarView === 'search' }"
        @click="layoutStore.selectSidebarView('search')"
      >
        <Search aria-hidden="true" />
      </button>
    </nav>

    <div class="side-bar-content">
      <tree
        v-show="sidebarView === 'files'"
        :project-tree="projectTree"
        :opened-files="openedFiles"
        :tabs="tabs"
      />
      <side-bar-search v-show="sidebarView === 'search'" />
      <toc v-show="sidebarView === 'toc'" />
    </div>

    <button
      type="button"
      class="side-bar-settings"
      :title="t('sideBar.icons.settings')"
      :aria-label="t('sideBar.icons.settings')"
      @click="projectStore.OPEN_SETTING_WINDOW()"
    >
      <Setting aria-hidden="true" />
      <span>{{ t('sideBar.icons.settings') }}</span>
    </button>

    <div
      ref="dragBar"
      class="drag-bar"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search, Setting } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useLayoutStore } from '@/store/layout'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import Tree from './tree.vue'
import SideBarSearch from './search.vue'
import Toc from './toc.vue'
import type { TabDescriptor } from './types'

const { t } = useI18n()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const editorStore = useEditorStore()

const { sidebarView, sidebarVisible, sidebarWidth } = storeToRefs(layoutStore)
const { projectTree } = storeToRefs(projectStore)
const { tabs } = storeToRefs(editorStore)

const dragBar = ref<HTMLDivElement | null>(null)
const openedFiles = ref<TabDescriptor[]>([])
const sidebarPreviewWidth = ref(sidebarWidth.value)

let isResizing = false
let startX = 0
let startWidth = sidebarPreviewWidth.value

const renderedSidebarWidth = computed(() => Math.max(sidebarPreviewWidth.value, 220))

watch(sidebarWidth, (width) => {
  if (!isResizing) sidebarPreviewWidth.value = width
})

const stopResize = (): void => {
  if (!isResizing) return
  isResizing = false
  document.removeEventListener('mousemove', previewResize, false)
  document.removeEventListener('mouseup', stopResize, false)
  layoutStore.setSidebarWidth(renderedSidebarWidth.value)
}

const previewResize = (event: MouseEvent): void => {
  sidebarPreviewWidth.value = Math.max(startWidth + event.clientX - startX, 220)
}

const startResize = (event: MouseEvent): void => {
  isResizing = true
  startX = event.clientX
  startWidth = renderedSidebarWidth.value
  document.addEventListener('mousemove', previewResize, false)
  document.addEventListener('mouseup', stopResize, false)
}

onMounted(() => {
  dragBar.value?.addEventListener('mousedown', startResize, false)
})

onBeforeUnmount(() => {
  dragBar.value?.removeEventListener('mousedown', startResize, false)
  document.removeEventListener('mousemove', previewResize, false)
  document.removeEventListener('mouseup', stopResize, false)
})
</script>

<style scoped>
.side-bar {
  position: relative;
  display: flex;
  min-width: 220px;
  height: 100%;
  flex: 0 0 auto;
  flex-direction: column;
  box-sizing: border-box;
  color: var(--sideBarColor);
  user-select: none;
  background: var(--sideBarBgColor);
  border-right: 1px solid var(--itemBgColor);
}

.side-bar-navigation {
  display: flex;
  height: var(--appShellTabBarHeight);
  min-height: var(--appShellTabBarHeight);
  box-sizing: border-box;
  align-items: stretch;
  border-bottom: 1px solid var(--appShellDivider);
}

.side-bar-view-tab,
.side-bar-search-button,
.side-bar-settings {
  border: 0;
  color: var(--appShellFg);
  background: transparent;
  cursor: pointer;
}

.side-bar-view-tab {
  position: relative;
  min-width: 0;
  flex: 1;
  padding: 0 8px;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-bar-view-tab.active {
  color: var(--appShellStrongFg);
  font-weight: 600;
}

.side-bar-view-tab.active::after {
  position: absolute;
  right: 22%;
  bottom: 0;
  left: 22%;
  height: 2px;
  background: var(--appShellAccent);
  content: '';
}

.side-bar-search-button {
  display: grid;
  width: 34px;
  min-width: 34px;
  place-items: center;
}

.side-bar-search-button svg,
.side-bar-settings svg {
  width: 16px;
  height: 16px;
}

.side-bar-search-button:hover,
.side-bar-search-button.active,
.side-bar-settings:hover {
  color: var(--appShellAccent);
  background: var(--appShellHoverBg);
}

.side-bar-content {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.side-bar-content > * {
  height: 100%;
}

.side-bar-settings {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  text-align: left;
}

.drag-bar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 3px;
  cursor: col-resize;
}

.drag-bar:hover {
  border-right: 2px solid var(--iconColor);
}
</style>
