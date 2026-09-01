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
        class="side-bar-view-tab app-shell-focus-ring"
        role="tab"
        :aria-selected="sidebarView === 'files'"
        :class="{ active: sidebarView === 'files' }"
        @click="layoutStore.selectSidebarView('files')"
      >
        {{ t('sideBar.icons.files') }}
      </button>
      <button
        type="button"
        class="side-bar-view-tab app-shell-focus-ring"
        role="tab"
        :aria-selected="sidebarView === 'toc'"
        :class="{ active: sidebarView === 'toc' }"
        @click="layoutStore.selectSidebarView('toc')"
      >
        {{ t('sideBar.icons.toc') }}
      </button>
      <button
        type="button"
        class="side-bar-search-button app-shell-focus-ring"
        :title="t(inlineSearchOpen ? 'sideBar.inlineSearch.hide' : 'sideBar.inlineSearch.show')"
        :aria-label="
          t(inlineSearchOpen ? 'sideBar.inlineSearch.hide' : 'sideBar.inlineSearch.show')
        "
        :aria-pressed="inlineSearchOpen"
        :class="{ active: inlineSearchOpen }"
        @click="toggleInlineSearch"
      >
        <Search aria-hidden="true" />
      </button>
    </nav>

    <div
      v-if="inlineSearchOpen && sidebarView !== 'search'"
      class="side-bar-inline-search"
    >
      <input
        ref="inlineSearchInput"
        v-model="inlineSearchQuery"
        type="text"
        :placeholder="inlineSearchPlaceholder"
        :aria-label="inlineSearchInputLabel"
        @keydown.esc.prevent.stop="closeInlineSearch"
      >
    </div>

    <div class="side-bar-content">
      <tree
        v-show="sidebarView === 'files'"
        :project-tree="projectTree"
        :opened-files="openedFiles"
        :tabs="tabs"
        :query="inlineSearchQuery"
      />
      <side-bar-search v-show="sidebarView === 'search'" />
      <toc
        v-show="sidebarView === 'toc'"
        :query="inlineSearchQuery"
      />
    </div>

    <button
      type="button"
      class="side-bar-settings app-shell-focus-ring"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const inlineSearchInput = ref<HTMLInputElement | null>(null)
const inlineSearchOpen = ref(false)
const inlineSearchQuery = ref('')
const openedFiles = ref<TabDescriptor[]>([])
const sidebarPreviewWidth = ref(sidebarWidth.value)

let isResizing = false
let startX = 0
let startWidth = sidebarPreviewWidth.value

const renderedSidebarWidth = computed(() => Math.max(sidebarPreviewWidth.value, 220))
const inlineSearchPlaceholder = computed(() =>
  t(
    sidebarView.value === 'toc'
      ? 'sideBar.inlineSearch.outlinePlaceholder'
      : 'sideBar.inlineSearch.filesPlaceholder'
  )
)
const inlineSearchInputLabel = computed(() =>
  t(
    sidebarView.value === 'toc'
      ? 'sideBar.inlineSearch.outlineInputLabel'
      : 'sideBar.inlineSearch.filesInputLabel'
  )
)

watch(sidebarWidth, (width) => {
  if (!isResizing) sidebarPreviewWidth.value = width
})

watch(sidebarView, (view, previousView) => {
  if (view === 'search') {
    inlineSearchOpen.value = false
    inlineSearchQuery.value = ''
    return
  }
  if (inlineSearchOpen.value && previousView !== view && (view === 'files' || view === 'toc')) {
    inlineSearchQuery.value = ''
    nextTick(() => inlineSearchInput.value?.focus())
  }
})

const closeInlineSearch = (): void => {
  inlineSearchOpen.value = false
  inlineSearchQuery.value = ''
}

const toggleInlineSearch = (): void => {
  if (sidebarView.value === 'search') return
  if (inlineSearchOpen.value) {
    closeInlineSearch()
    return
  }
  inlineSearchOpen.value = true
  nextTick(() => inlineSearchInput.value?.focus())
}

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
  color: var(--appShellStrongFg);
  user-select: none;
  background: var(--sideBarBgColor);
  border-right: 1px solid var(--appShellVisibleDivider);
}

.side-bar-navigation {
  display: flex;
  height: var(--appShellTabBarHeight);
  min-height: var(--appShellTabBarHeight);
  box-sizing: border-box;
  align-items: stretch;
  border-bottom: 1px solid var(--appShellVisibleDivider);
}

.side-bar-view-tab,
.side-bar-search-button,
.side-bar-settings {
  border: 0;
  color: var(--appShellStrongFg);
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

.side-bar-inline-search {
  box-sizing: border-box;
  flex: 0 0 auto;
  padding: 7px 8px;
  border-bottom: 1px solid var(--appShellVisibleDivider);
}

.side-bar-inline-search input {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  color: var(--sideBarColor);
  background: var(--inputBgColor);
  border: 1px solid var(--floatBorderColor);
  border-radius: 3px;
  outline: none;
  user-select: text;
}

.side-bar-inline-search input:focus {
  border-color: var(--highlightThemeColor);
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
