<template>
  <aside
    v-show="sidebarVisible"
    ref="sideBar"
    class="side-bar"
    :style="{ width: `${finalSideBarWidth}px` }"
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
        @click="selectView('files')"
      >
        {{ t('sideBar.icons.files') }}
      </button>
      <button
        type="button"
        class="side-bar-view-tab"
        role="tab"
        :aria-selected="sidebarView === 'toc'"
        :class="{ active: sidebarView === 'toc' }"
        @click="selectView('toc')"
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
        @click="selectView('search')"
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
      @click="openSettings"
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
import { useLayoutStore, type SidebarView } from '@/store/layout'
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

const sideBar = ref<HTMLElement | null>(null)
const dragBar = ref<HTMLDivElement | null>(null)
const openedFiles = ref<TabDescriptor[]>([])
const sideBarViewWidth = ref(sidebarWidth.value)

let isResizing = false
let startX = 0
let startWidth = sideBarViewWidth.value

const finalSideBarWidth = computed(() => Math.max(sideBarViewWidth.value, 220))

watch(sidebarWidth, (width) => {
  if (!isResizing) sideBarViewWidth.value = width
})

const stopResize = (): void => {
  if (!isResizing) return
  isResizing = false
  document.removeEventListener('mousemove', previewResize, false)
  document.removeEventListener('mouseup', stopResize, false)
  layoutStore.setSidebarWidth(finalSideBarWidth.value)
}

const previewResize = (event: MouseEvent): void => {
  sideBarViewWidth.value = Math.max(startWidth + event.clientX - startX, 220)
}

const startResize = (event: MouseEvent): void => {
  isResizing = true
  startX = event.clientX
  startWidth = finalSideBarWidth.value
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

const selectView = (view: SidebarView): void => {
  layoutStore.selectSidebarView(view)
}

const openSettings = (): void => {
  projectStore.OPEN_SETTING_WINDOW()
}
</script>

<style scoped>
.side-bar {
  position: relative;
  display: flex;
  min-width: 220px;
  height: 100vh;
  flex: 0 0 auto;
  flex-direction: column;
  padding-top: var(--titleBarHeight);
  box-sizing: border-box;
  color: var(--sideBarColor);
  user-select: none;
  background: var(--sideBarBgColor);
  border-right: 1px solid var(--itemBgColor);
}

.side-bar-navigation {
  display: flex;
  height: 35px;
  min-height: 35px;
  align-items: stretch;
  border-bottom: 1px solid var(--itemBgColor);
}

.side-bar-view-tab,
.side-bar-search-button,
.side-bar-settings {
  border: 0;
  color: var(--sideBarColor);
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
  color: var(--sideBarTitleColor);
  font-weight: 600;
}

.side-bar-view-tab.active::after {
  position: absolute;
  right: 22%;
  bottom: 0;
  left: 22%;
  height: 2px;
  background: var(--themeColor);
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
  color: var(--themeColor);
  background: var(--sideBarItemHoverBgColor);
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
