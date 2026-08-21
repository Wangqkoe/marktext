<template>
  <div class="editor-tabs">
    <div
      ref="tabContainer"
      class="scrollable-tabs"
    >
      <ul
        ref="tabDropContainer"
        class="tabs-container"
        role="tablist"
        aria-label="Open files"
      >
        <li
          v-for="file of tabs"
          :key="file.id"
          :title="file.pathname"
          :class="{ active: currentFile?.id === file.id, unsaved: !file.isSaved }"
          :data-id="file.id"
          @click.middle="closeTab(file.id)"
          @contextmenu.prevent="handleContextMenu($event, file)"
        >
          <button
            type="button"
            class="tab-select app-shell-focus-ring"
            role="tab"
            :aria-selected="currentFile?.id === file.id"
            :tabindex="currentFile?.id === file.id ? 0 : -1"
            @click.stop="selectFile(file)"
            @keydown.left.prevent="selectAdjacentTab(file, -1)"
            @keydown.right.prevent="selectAdjacentTab(file, 1)"
          >
            <span class="tab-filename">{{ file.filename }}</span>
            <span class="unsaved-dot" />
          </button>
          <button
            type="button"
            class="close-icon app-shell-focus-ring"
            :aria-label="`Close ${file.filename}`"
            @click.stop="removeFileInTab(file)"
            @keydown.enter.space.prevent.stop="removeFileInTab(file)"
          >
            <el-icon :size="12">
              <Close />
            </el-icon>
          </button>
        </li>
      </ul>
    </div>
    <button
      type="button"
      class="new-file app-shell-focus-ring"
      title="New Tab"
      aria-label="New Tab"
      @click.stop="newFile()"
    >
      <el-icon :size="16">
        <Plus />
      </el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/store/editor'
import { storeToRefs } from 'pinia'
import autoScroll from 'dom-autoscroller'
import dragula from 'dragula'
import { Plus, Close } from '@element-plus/icons-vue'
import { showContextMenu } from '../../contextMenu/tabs'
import bus from '../../bus'
import type { IFileState } from '@shared/types/files'

const editorStore = useEditorStore()
const { currentFile, tabs } = storeToRefs(editorStore)

interface AutoScroller {
  readonly down: boolean
  destroy: (forceCleanAnimation?: boolean) => void
}

const tabContainer = ref<HTMLElement | null>(null)
const tabDropContainer = ref<HTMLElement | null>(null)
let autoScroller: AutoScroller | null = null
let drake: dragula.Drake | null = null

// Computed properties

// Methods incorporated from tabsMixins
const selectFile = (file: IFileState) => {
  if (file.id !== currentFile.value?.id) {
    editorStore.UPDATE_CURRENT_FILE(file)
  }
}

const selectAdjacentTab = (file: IFileState, offset: -1 | 1): void => {
  const currentIndex = tabs.value.findIndex((tab) => tab.id === file.id)
  if (currentIndex === -1) return
  const nextIndex = (currentIndex + offset + tabs.value.length) % tabs.value.length
  const nextFile = tabs.value[nextIndex]
  if (!nextFile) return
  selectFile(nextFile)
  nextTick(() => {
    tabDropContainer.value?.querySelectorAll<HTMLButtonElement>('.tab-select')[nextIndex]?.focus()
  })
}

const removeFileInTab = (file: IFileState) => {
  const { isSaved } = file
  if (isSaved) {
    editorStore.FORCE_CLOSE_TAB(file)
  } else {
    editorStore.CLOSE_UNSAVED_TAB(file)
  }
}

// Original methods
const newFile = () => {
  editorStore.NEW_UNTITLED_TAB({})
}

// Keep the active tab visible when the selection changes by something other
// than a direct click on a visible tab (keyboard cycle, switch-by-index, open
// from the sidebar): the strip has `overflow: hidden` and only scrolls on the
// wheel, so an off-screen tab would otherwise stay hidden (#3958).
const scrollActiveTabIntoView = () => {
  const container = tabContainer.value
  if (!container) return
  const activeTab = container.querySelector<HTMLElement>('li.active')
  if (!activeTab) return

  const containerRect = container.getBoundingClientRect()
  const tabRect = activeTab.getBoundingClientRect()
  if (tabRect.left < containerRect.left) {
    container.scrollLeft -= containerRect.left - tabRect.left
  } else if (tabRect.right > containerRect.right) {
    container.scrollLeft += tabRect.right - containerRect.right
  }
}

const handleTabScroll = (event: WheelEvent) => {
  // Use mouse wheel value first but prioritize X value more (e.g. touchpad input).
  let delta = event.deltaY
  if (event.deltaX !== 0) {
    delta = event.deltaX
  }

  const tabsEl = tabContainer.value
  if (!tabsEl) return
  const newLeft = Math.max(0, Math.min(tabsEl.scrollLeft + delta, tabsEl.scrollWidth))
  tabsEl.scrollLeft = newLeft
}

const closeTab = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.CLOSE_TAB(tab)
  }
}

const closeOthers = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab) {
    editorStore.CLOSE_OTHER_TABS(tab)
  }
}

const closeSaved = () => {
  editorStore.CLOSE_SAVED_TABS()
}

const closeAll = () => {
  editorStore.CLOSE_ALL_TABS()
}

const rename = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    editorStore.RENAME_FILE(tab)
  }
}

const copyPath = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    window.electron.clipboard.writeText(tab.pathname)
  }
}

const showInFolder = (tabId: unknown) => {
  const tab = tabs.value.find((f) => f.id === tabId)
  if (tab && tab.pathname) {
    window.electron.shell.showItemInFolder(tab.pathname)
  }
}

const handleContextMenu = (event: MouseEvent, tab: IFileState) => {
  if (tab.id) {
    showContextMenu(event, tab)
  }
}

watch(
  () => currentFile.value?.id,
  () => {
    nextTick(scrollActiveTabIntoView)
  }
)

onMounted(() => {
  bus.on('TABS::close-this', closeTab)
  bus.on('TABS::close-others', closeOthers)
  bus.on('TABS::close-saved', closeSaved)
  bus.on('TABS::close-all', closeAll)
  bus.on('TABS::rename', rename)
  bus.on('TABS::copy-path', copyPath)
  bus.on('TABS::show-in-folder', showInFolder)

  const tabsEl = tabContainer.value
  if (!tabsEl || !tabDropContainer.value) return

  // Allow to scroll through the tabs by mouse wheel or touchpad.
  tabsEl.addEventListener('wheel', handleTabScroll)

  // Allow tab drag and drop to reorder tabs.
  drake = dragula([tabDropContainer.value], {
    direction: 'horizontal',
    revertOnSpill: true,
    mirrorContainer: tabDropContainer.value,
    ignoreInputTextSelection: false
  }).on('drop', (el, _target, _source, sibling) => {
    // Current tab that was dropped and need to be reordered.
    const droppedId = el?.getAttribute('data-id')
    // This should be the next tab (tab | ... | el | sibling | tab | ...) but may be
    // the mirror image or null (tab | ... | el | sibling or null) if last tab.
    const nextTabId = sibling ? sibling.getAttribute('data-id') : null
    const isLastTab = !sibling || sibling.classList.contains('gu-mirror')
    if (!droppedId || (sibling && !nextTabId)) {
      console.error('Tab reorder error: invalid tab IDs')
      return
    }

    editorStore.EXCHANGE_TABS_BY_ID({
      fromId: droppedId,
      toId: isLastTab ? null : nextTabId
    })
  })

  // Scroll when dragging a tab to the beginning or end of the tab container.
  autoScroller = autoScroll([tabsEl], {
    margin: 20,
    maxSpeed: 6,
    scrollWhenOutside: false,
    autoScroll: () => {
      return autoScroller!.down && drake?.dragging
    }
  })
})

onBeforeUnmount(() => {
  const tabsEl = tabContainer.value
  if (tabsEl) {
    tabsEl.removeEventListener('wheel', handleTabScroll)
  }

  if (autoScroller) {
    // Force destroy
    autoScroller.destroy(true)
  }
  if (drake) {
    drake.destroy()
  }

  // Remove event listeners
  bus.off('TABS::close-this', closeTab)
  bus.off('TABS::close-others', closeOthers)
  bus.off('TABS::close-saved', closeSaved)
  bus.off('TABS::close-all', closeAll)
  bus.off('TABS::rename', rename)
  bus.off('TABS::copy-path', copyPath)
  bus.off('TABS::show-in-folder', showInFolder)
})
</script>

<style scoped>
.close-icon {
  display: grid;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  padding: 0;
  place-items: center;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: opacity 0.15s ease-in-out;
}

.close-icon:hover {
  color: var(--appShellFocus);
}

.editor-tabs {
  position: relative;
  display: flex;
  flex-direction: row;
  height: var(--appShellTabBarHeight);
  user-select: none;
  box-shadow: 0px 0px 9px 2px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  &:hover > .new-file {
    opacity: 1 !important;
  }
}
.scrollable-tabs {
  flex: 0 1 auto;
  height: var(--appShellTabBarHeight);
  overflow: hidden;
}
.tabs-container {
  min-width: min-content;
  list-style: none;
  margin: 0;
  padding: 0;
  height: var(--appShellTabBarHeight);
  position: relative;
  display: flex;
  flex-direction: row;
  overflow-y: hidden;
  z-index: 2;
  &::-webkit-scrollbar:horizontal {
    display: none;
  }
  & > li {
    transition: all 0.15s ease-in-out;
    position: relative;
    padding: 0 4px;
    color: var(--appShellStrongFg);
    font-size: 12px;
    line-height: var(--appShellTabBarHeight);
    height: var(--appShellTabBarHeight);
    max-width: 280px;
    display: flex;
    align-items: center;
    &[aria-grabbed='true'] {
      color: var(--appShellMutedFg) !important;
    }
    & > .close-icon {
      opacity: 0;
    }
    &:focus {
      outline: none;
    }
    &:hover {
      background: var(--appShellHoverBg) !important;
    }
    &:hover > .close-icon {
      opacity: 1;
    }
    &:hover .unsaved-dot {
      display: none;
    }
    & .tab-filename {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 3px;
    }
    & .unsaved-dot {
      display: none;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--appShellAccent);
      flex-shrink: 0;
    }
  }
  & > li.unsaved:not(.active) {
    & > .close-icon {
      opacity: 0;
    }
    & .unsaved-dot {
      display: block;
    }
    &:hover > .close-icon {
      opacity: 1;
    }
    &:hover .unsaved-dot {
      display: none;
    }
  }
  & > li.active {
    background: var(--appShellDivider);
    z-index: 3;
    &:after {
      content: '';
      position: absolute;
      left: 0;
      bottom: 0;
      right: 0;
      height: 2px;
      background: var(--appShellAccent);
    }
    & > .close-icon {
      opacity: 1;
    }
    & .unsaved-dot {
      display: none;
    }
  }
}

.tab-select {
  display: flex;
  min-width: 0;
  height: 100%;
  flex: 1;
  align-items: center;
  padding: 0 4px;
  overflow: hidden;
  color: inherit;
  font: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.close-icon:focus-visible {
  opacity: 1;
}

.editor-tabs > .new-file {
  flex: 0 0 var(--appShellTabBarHeight);
  width: var(--appShellTabBarHeight);
  height: var(--appShellTabBarHeight);
  border-right: none;
  border-top: 0;
  border-bottom: 0;
  border-left: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-around;
  cursor: pointer;
  color: var(--appShellStrongFg);
  opacity: 0;
  &.always-visible {
    opacity: 1;
  }
  &:focus-visible {
    opacity: 1;
  }
}

.editor-tabs > .new-file:hover {
  transition: all 0.15s ease-in-out;
  color: var(--appShellFocus);
}

/* dragula effects */
.gu-mirror {
  position: fixed !important;
  margin: 0 !important;
  z-index: 9999 !important;
  opacity: 0.8;
  cursor: grabbing;
}
.gu-hide {
  display: none !important;
}
.gu-unselectable {
  user-select: none !important;
}
.gu-transit {
  opacity: 0.2;
}
</style>
