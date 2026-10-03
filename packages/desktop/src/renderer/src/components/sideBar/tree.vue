<template>
  <div
    ref="treeView"
    class="tree-view"
  >
    <!-- Opened tabs -->
    <div
      v-if="openedFilesInSidebar"
      class="opened-files"
      :style="{ height: `${openedFilesHeight}px` }"
    >
      <div class="title">
        <el-icon
          class="icon-arrow"
          :class="{ fold: !effectiveShowOpenedFiles }"
          :size="12"
          @click.stop="toggleOpenedFiles()"
        >
          <ArrowRight />
        </el-icon>
        <span
          class="default-cursor text-overflow"
          @click.stop="toggleOpenedFiles()"
        >{{
          t('sideBar.tree.openedFiles')
        }}</span>
        <a
          href="javascript:;"
          :title="t('sideBar.tree.saveAll')"
          @click.stop="saveAll(false)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-save-all" />
          </svg>
        </a>
        <a
          href="javascript:;"
          :title="t('sideBar.tree.closeAll')"
          @click.stop="saveAll(true)"
        >
          <svg
            class="icon"
            aria-hidden="true"
          >
            <use xlink:href="#icon-close-all" />
          </svg>
        </a>
      </div>
      <div
        v-show="effectiveShowOpenedFiles"
        class="opened-files-list"
      >
        <transition-group name="list">
          <opened-file
            v-for="tab of filteredTabs"
            :key="tab.id"
            :file="tab"
            :resolve-workspace-menu="resolveOpenedFileWorkspaceMenu"
          />
        </transition-group>
      </div>
    </div>

    <div
      v-if="openedFilesInSidebar"
      class="sidebar-divider"
      role="separator"
      aria-orientation="horizontal"
      @pointerdown="startDividerDrag"
      @dblclick="resetDivider"
    />

    <!-- Project tree view -->
    <div
      v-if="projectTree"
      class="project-tree"
    >
      <div
        class="title"
        @contextmenu.prevent="handleRootContextMenu"
      >
        <el-icon
          class="icon-arrow"
          :class="{ fold: !effectiveShowDirectories }"
          :size="12"
          @click.stop="toggleDirectories()"
        >
          <ArrowRight />
        </el-icon>
        <span
          class="default-cursor text-overflow"
          @click.stop="toggleDirectories()"
        >{{
          projectTree.name
        }}</span>
        <el-dropdown
          trigger="click"
          placement="bottom-end"
          popper-class="folder-sort-menu"
          @command="setFileSort"
        >
          <button
            class="sort-button"
            type="button"
            :aria-label="t('preferences.general.sidebar.fileSortBy.title')"
            :title="t('preferences.general.sidebar.fileSortBy.title')"
            @click.stop
          >
            <el-icon :size="16">
              <Sort />
            </el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="option of fileSortOptions"
                :key="option.command"
                :command="option.command"
                :divided="option.divided"
              >
                <span
                  class="sort-check"
                  aria-hidden="true"
                >
                  <el-icon v-if="option.command === activeFileSort">
                    <Check />
                  </el-icon>
                </span>
                {{ option.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div
        v-show="effectiveShowDirectories"
        class="tree-wrapper"
      >
        <folder
          v-for="folder of filteredTree.folders"
          :key="folder.id"
          :folder="folder"
          :depth="depth"
          :is-folder-collapsed="isFolderCollapsed"
          :on-toggle-folder="toggleFolder"
        />
        <input
          v-show="!filteredTree.active && createCacheDirname === projectTree.pathname"
          ref="input"
          v-model="createName"
          placeholder="Enter .md file name"
          type="text"
          class="new-input"
          :style="{
            'margin-left': `calc(var(--files-content-inset) + ${depth * 5 + 15}px)`
          }"
          @keypress.enter="handleInputEnter"
        >
        <file
          v-for="file of filteredTree.files"
          :key="file.id"
          :file="file"
          :depth="depth"
        />
        <div
          v-if="
            !filteredTree.active &&
              projectTree.files.length === 0 &&
              projectTree.folders.length === 0 &&
              createCacheDirname !== projectTree.pathname
          "
          class="empty-project"
        >
          <span>{{ t('sideBar.tree.emptyProject') }}</span>
          <div class="centered-group">
            <button
              class="button-primary"
              @click.stop="createFile"
            >
              {{ t('sideBar.tree.createFile') }}
            </button>
          </div>
        </div>
        <div
          v-else-if="filteredTree.active && !hasFilesResults"
          class="filter-no-results"
        >
          {{ t('sideBar.inlineSearch.filesNoResults') }}
        </div>
      </div>
    </div>
    <div
      v-else
      class="open-project"
    >
      <div class="centered-group">
        <el-button
          text
          bg
          type="primary"
          @click="openFolder"
        >
          {{ t('sideBar.tree.openFolder') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted, nextTick, reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/store/project'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import Folder from './treeFolder.vue'
import File from './treeFile.vue'
import OpenedFile from './treeOpenedTab.vue'
import bus from '../../bus'
import { showContextMenu } from '../../contextMenu/sideBar'
import { resolveWorkspaceTabMenu } from '../../contextMenu/tabs'
import { useI18n } from 'vue-i18n'
import { ArrowRight, Check, Sort } from '@element-plus/icons-vue'
import type { FileSortBy, FileSortOrder } from '@/store/preferences'
import { PATH_SEPARATOR } from '@/config'
import { isOsx } from '@/util'
import {
  isEditableTarget,
  isModifierKey,
  isMuyaEditorTarget,
  isNameInput,
  keepsSidebarSelection,
  shouldTrashSelection
} from './trashKey'
import type { TreeNode, TabDescriptor } from './types'
import { filterFilesTree, filterOpenedFiles } from '@/util/sidebarFilter'

const { t } = useI18n()

const props = defineProps<{
  // The project store seeds `projectTree` as `null` until a folder is
  // opened; the template renders the "open project" empty-state behind
  // `v-if="projectTree"`. Type the prop nullable to match runtime + the
  // template guard.
  projectTree: TreeNode | null
  openedFiles?: TabDescriptor[]
  tabs?: TabDescriptor[]
  query?: string
}>()

const depth = 0
// The section state survives both renderer remounts and application restart.
const SHOW_DIRECTORIES_KEY = 'side-bar-show-directories'
const SHOW_OPENED_FILES_KEY = 'side-bar-show-opened-files'
const DIVIDER_RATIO_KEY = 'side-bar-files-divider-ratio'
const DIVIDER_SIZE = 5
const OPENED_FILES_MIN_HEIGHT = 58
const FOLDER_TREE_MIN_HEIGHT = 60
const readSectionExpanded = (key: string): boolean => localStorage.getItem(key) !== 'false'
const readDividerRatio = (): number => {
  const stored = localStorage.getItem(DIVIDER_RATIO_KEY)
  if (stored === null) return 0.5
  const value = Number(stored)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.5
}
const showDirectories = ref(readSectionExpanded(SHOW_DIRECTORIES_KEY))
const showOpenedFiles = ref(readSectionExpanded(SHOW_OPENED_FILES_KEY))
const treeView = ref<HTMLElement | null>(null)
const treeHeight = ref(0)
const dividerRatio = ref(readDividerRatio())
const createName = ref('')
const input = ref<HTMLInputElement | null>(null)
const baseCollapsedByKey = reactive(new Map<string, boolean>())
const searchCollapsedKeys = ref<Set<string>>(new Set())
const manuallyExpandedKeys = ref<Set<string>>(new Set())
const searchShowDirectories = ref<boolean | null>(null)
const searchShowOpenedFiles = ref<boolean | null>(null)

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

// Computed properties
const { createCache, clipboard, folderRootIdentity } = storeToRefs(projectStore)
const { fileSortBy, fileSortOrder, openedFilesInSidebar } = storeToRefs(preferencesStore)
type FileSortCommand = `${FileSortBy}:${FileSortOrder}`
const fileSortOptions = computed<Array<{
  command: FileSortCommand
  label: string
  divided?: boolean
}>>(() => [
  {
    command: 'title:asc',
    label: `${t('preferences.general.sidebar.fileSortBy.filename')} · ${t('preferences.general.sidebar.fileSortOrder.aToZ')}`
  },
  {
    command: 'title:desc',
    label: `${t('preferences.general.sidebar.fileSortBy.filename')} · ${t('preferences.general.sidebar.fileSortOrder.zToA')}`
  },
  {
    command: 'modified:desc',
    divided: true,
    label: `${t('preferences.general.sidebar.fileSortBy.modificationTime')} · ${t('preferences.general.sidebar.fileSortOrder.newestFirst')}`
  },
  {
    command: 'modified:asc',
    label: `${t('preferences.general.sidebar.fileSortBy.modificationTime')} · ${t('preferences.general.sidebar.fileSortOrder.oldestFirst')}`
  },
  {
    command: 'created:desc',
    divided: true,
    label: `${t('preferences.general.sidebar.fileSortBy.creationTime')} · ${t('preferences.general.sidebar.fileSortOrder.newestFirst')}`
  },
  {
    command: 'created:asc',
    label: `${t('preferences.general.sidebar.fileSortBy.creationTime')} · ${t('preferences.general.sidebar.fileSortOrder.oldestFirst')}`
  }
])
const activeFileSort = computed<FileSortCommand>(
  () => `${fileSortBy.value}:${fileSortOrder.value}` as FileSortCommand
)
const clampDividerPosition = (position: number, height: number): number => {
  const maximum = Math.max(0, height - DIVIDER_SIZE - FOLDER_TREE_MIN_HEIGHT)
  const minimum = Math.min(OPENED_FILES_MIN_HEIGHT, maximum)
  return Math.max(minimum, Math.min(maximum, position))
}
const openedFilesHeight = computed(() =>
  clampDividerPosition(treeHeight.value * dividerRatio.value, treeHeight.value)
)
const filteredTree = computed(() =>
  filterFilesTree(props.projectTree, props.query ?? '', manuallyExpandedKeys.value)
)
const filteredTabs = computed(() => filterOpenedFiles(props.tabs ?? [], props.query ?? ''))
const hasFilesResults = computed(
  () =>
    (openedFilesInSidebar.value && filteredTabs.value.length > 0) ||
    filteredTree.value.files.length > 0 ||
    filteredTree.value.folders.length > 0
)
const effectiveShowOpenedFiles = computed(() => {
  if (!filteredTree.value.active) return showOpenedFiles.value
  return (
    searchShowOpenedFiles.value ?? (openedFilesInSidebar.value && filteredTabs.value.length > 0)
  )
})
const effectiveShowDirectories = computed(() => {
  if (!filteredTree.value.active) return showDirectories.value
  return searchShowDirectories.value ?? true
})

const folderKey = (folder: TreeNode): string => folder.id || folder.pathname

const baseFolderCollapsed = (folder: TreeNode): boolean => {
  const key = folderKey(folder)
  if (!baseCollapsedByKey.has(key)) {
    baseCollapsedByKey.set(key, !!folder.isCollapsed)
  }
  return baseCollapsedByKey.get(key) ?? false
}

const isFolderCollapsed = (folder: TreeNode): boolean => {
  if (!filteredTree.value.active) return baseFolderCollapsed(folder)
  const key = folderKey(folder)
  if (searchCollapsedKeys.value.has(key)) return true
  return !(manuallyExpandedKeys.value.has(key) || filteredTree.value.autoExpandedKeys.has(key))
}

const toggleFolder = (folder: TreeNode): void => {
  const key = folderKey(folder)
  if (!filteredTree.value.active) {
    baseCollapsedByKey.set(key, !baseFolderCollapsed(folder))
    return
  }

  if (isFolderCollapsed(folder)) {
    const collapsed = new Set(searchCollapsedKeys.value)
    collapsed.delete(key)
    searchCollapsedKeys.value = collapsed
    if (filteredTree.value.matchedFolderKeys.has(key)) {
      manuallyExpandedKeys.value = new Set(manuallyExpandedKeys.value).add(key)
    }
  } else {
    searchCollapsedKeys.value = new Set(searchCollapsedKeys.value).add(key)
    const expanded = new Set(manuallyExpandedKeys.value)
    expanded.delete(key)
    manuallyExpandedKeys.value = expanded
  }
}

watch(
  () => props.query,
  (query) => {
    if (query?.length) return
    searchCollapsedKeys.value = new Set()
    manuallyExpandedKeys.value = new Set()
    searchShowDirectories.value = null
    searchShowOpenedFiles.value = null
  }
)

watch(
  () => {
    const identity = folderRootIdentity.value
    return identity ? `${identity.generation}:${identity.pathname}` : ''
  },
  () => {
    baseCollapsedByKey.clear()
    searchCollapsedKeys.value = new Set()
    manuallyExpandedKeys.value = new Set()
    searchShowDirectories.value = null
    searchShowOpenedFiles.value = null
  }
)
const { activeItem, renameCache } = storeToRefs(projectStore)

// The createCache state is `{ dirname, type }` while an input is shown, and
// `{}` otherwise. Expose a typed accessor for the template so we don't have
// to thread `as any` through every comparison.
const createCacheDirname = computed<string | undefined>(() => {
  const cache = createCache.value as { dirname?: string }
  return cache.dirname
})

const resolveOpenedFileWorkspaceMenu = (documentId: string) =>
  resolveWorkspaceTabMenu(
    documentId,
    folderRootIdentity.value ? { ...folderRootIdentity.value } : undefined
  )

// Methods
const openFolder = (): void => {
  projectStore.ASK_FOR_OPEN_PROJECT()
}

const saveAll = (isClose: boolean): void => {
  editorStore.ASK_FOR_SAVE_ALL(isClose)
}

const createFile = (): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  bus.emit('SIDEBAR::new', 'file')
}

const handleRootContextMenu = (event: MouseEvent): void => {
  projectStore.CHANGE_ACTIVE_ITEM(props.projectTree)
  showContextMenu(event, !!clipboard.value, 'root')
}

const toggleOpenedFiles = (): void => {
  if (filteredTree.value.active) {
    searchShowOpenedFiles.value = !effectiveShowOpenedFiles.value
    return
  }
  showOpenedFiles.value = !showOpenedFiles.value
  localStorage.setItem(SHOW_OPENED_FILES_KEY, String(showOpenedFiles.value))
}

const toggleDirectories = (): void => {
  if (filteredTree.value.active) {
    searchShowDirectories.value = !effectiveShowDirectories.value
    return
  }
  showDirectories.value = !showDirectories.value
  localStorage.setItem(SHOW_DIRECTORIES_KEY, String(showDirectories.value))
}

const setFileSort = (command: FileSortCommand): void => {
  const [sortBy, sortOrder] = command.split(':') as [FileSortBy, FileSortOrder]
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'fileSortBy', value: sortBy })
  preferencesStore.SET_SINGLE_PREFERENCE({ type: 'fileSortOrder', value: sortOrder })
}

let dividerObserver: ResizeObserver | undefined
let dividerPointerId: number | undefined
let dragStartRatio = dividerRatio.value

const removeDividerListeners = (): void => {
  window.removeEventListener('pointermove', moveDivider)
  window.removeEventListener('pointerup', commitDividerDrag)
  window.removeEventListener('pointercancel', cancelDividerDrag)
}

const moveDivider = (event: PointerEvent): void => {
  const rect = treeView.value?.getBoundingClientRect()
  if (dividerPointerId !== event.pointerId || !rect || rect.height <= 0) return
  const position = clampDividerPosition(event.clientY - rect.top, rect.height)
  dividerRatio.value = position / rect.height
}

const finishDividerDrag = (event: PointerEvent): boolean => {
  if (dividerPointerId !== event.pointerId) return false
  dividerPointerId = undefined
  removeDividerListeners()
  return true
}

const commitDividerDrag = (event: PointerEvent): void => {
  if (!finishDividerDrag(event)) return
  localStorage.setItem(DIVIDER_RATIO_KEY, String(dividerRatio.value))
}

const cancelDividerDrag = (event: PointerEvent): void => {
  if (!finishDividerDrag(event)) return
  dividerRatio.value = dragStartRatio
}

const startDividerDrag = (event: PointerEvent): void => {
  if (event.button !== 0 || dividerPointerId !== undefined) return
  dividerPointerId = event.pointerId
  dragStartRatio = dividerRatio.value
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  } catch {
    // Synthetic pointer events used by automation do not own browser capture.
  }
  window.addEventListener('pointermove', moveDivider)
  window.addEventListener('pointerup', commitDividerDrag)
  window.addEventListener('pointercancel', cancelDividerDrag)
}

const resetDivider = (): void => {
  dividerRatio.value = 0.5
  localStorage.setItem(DIVIDER_RATIO_KEY, String(dividerRatio.value))
}

// From createFileOrDirectoryMixins
const handleInputFocus = (): void => {
  nextTick(() => {
    if (input.value) {
      input.value.focus()
      createName.value = ''
    }
  })
}

const handleInputEnter = (): void => {
  projectStore.CREATE_FILE_DIRECTORY(createName.value)
}

// Hide the name inputs on outside clicks; their trigger buttons use @click.stop.
const handleDocumentClick = (event: MouseEvent): void => {
  const { target } = event
  if (!target) return

  if (!keepsSidebarSelection(target)) {
    projectStore.CHANGE_ACTIVE_ITEM({})
  }

  if (isNameInput(target)) return
  projectStore.CLEAR_NAME_INPUT_STATE()
}

const handleDocumentContextMenu = (event: MouseEvent): void => {
  const { target } = event
  if (isNameInput(target)) return

  projectStore.CLEAR_NAME_INPUT_STATE()
}

const handleDocumentKeydown = (event: KeyboardEvent): void => {
  const { target, key, metaKey } = event
  const editableTarget = isEditableTarget(target)

  if (key === 'Escape') {
    projectStore.CLEAR_NAME_INPUT_STATE()
  }

  const shouldTrash = shouldTrashSelection({
    key,
    metaKey,
    isMac: isOsx,
    selection: activeItem.value,
    projectRootPath: props.projectTree?.pathname,
    pathSeparator: PATH_SEPARATOR,
    isEditingName: !!renameCache.value || !!createCacheDirname.value,
    editableTarget,
    allowEditableTarget: isMuyaEditorTarget(target)
  })
  if (shouldTrash) {
    event.preventDefault()
    // Stop the event so the WYSIWYG engine does not also act on this Delete.
    event.stopPropagation()
    // The store drops the selection once the item is really trashed, so a
    // cancelled dialog leaves the target in place for a retry.
    bus.emit('SIDEBAR::remove')
    return
  }

  // Any other key ends the selection, so a later Delete edits text instead of
  // trashing a stale node.
  const hasSelection = !!activeItem.value && Object.keys(activeItem.value).length > 0
  if (!isModifierKey(key) && hasSelection) {
    projectStore.CHANGE_ACTIVE_ITEM({})
  }
}

onMounted(() => {
  dividerObserver = new ResizeObserver(() => {
    treeHeight.value = treeView.value?.clientHeight ?? 0
  })
  if (treeView.value) dividerObserver.observe(treeView.value)
  treeHeight.value = treeView.value?.clientHeight ?? 0

  bus.on('SIDEBAR::show-new-input', handleInputFocus)
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('contextmenu', handleDocumentContextMenu)
  // Capture phase: muya stops keydown propagation for keys it handles.
  document.addEventListener('keydown', handleDocumentKeydown, true)
})

onBeforeUnmount(() => {
  bus.off('SIDEBAR::show-new-input', handleInputFocus)
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('contextmenu', handleDocumentContextMenu)
  document.removeEventListener('keydown', handleDocumentKeydown, true)
  dividerPointerId = undefined
  dividerObserver?.disconnect()
  removeDividerListeners()
})
</script>

<style scoped>
.list-item {
  display: inline-block;
  margin-right: 10px;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.2s;
}
.list-enter, .list-leave-to
  /* .list-leave-active for below version 2.1.8 */ {
  opacity: 0;
  transform: translateX(-50px);
}
.tree-view {
  --files-content-inset: 12px;

  font-size: 14px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  height: 100%;
}
.icon-arrow {
  margin-right: 5px;
  transition: transform 0.25s ease-out;
  transform: rotate(90deg);
  color: var(--sideBarTextColor);
  cursor: pointer;
}

.icon-arrow.fold {
  transform: rotate(0);
}

.opened-files > .title,
.project-tree > .title {
  height: 30px;
  line-height: 30px;
  font-size: 14px;
  padding-left: var(--files-content-inset);
}

.opened-files .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
}

.opened-files .title > span {
  flex: 1;
}

.opened-files .title > a {
  display: none;
  text-decoration: none;
  color: var(--sideBarColor);
  margin-left: 8px;
}
.opened-files div.title:hover > a,
.opened-files div.title > a:hover {
  display: block;
}

.opened-files div.title:hover > a:hover,
.opened-files div.title > a:hover:hover {
  color: var(--highlightThemeColor);
}
.opened-files {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 0 0 auto;
}
.default-cursor {
  cursor: pointer;
}
.opened-files .opened-files-list {
  min-height: 0;
  overflow: auto;
  flex: 1;
}

.opened-files .opened-files-list::-webkit-scrollbar:vertical {
  width: 8px;
}

.sidebar-divider {
  position: relative;
  flex: 0 0 5px;
  cursor: row-resize;
  touch-action: none;
}

.sidebar-divider::after {
  position: absolute;
  top: 2px;
  right: 0;
  left: 0;
  height: 1px;
  background: var(--appShellVisibleDivider);
  content: '';
}

.sidebar-divider:hover::after {
  background: var(--highlightThemeColor);
}

.project-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  flex: 1;
}

.project-tree > .title {
  padding-right: 15px;
  display: flex;
  align-items: center;
}

.project-tree > .title > span {
  flex: 1;
  min-width: 0;
  user-select: none;
}

.sort-button {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 3px;
  color: var(--sideBarIconColor);
  background: transparent;
  cursor: pointer;
}

.sort-button:hover,
.sort-button:focus-visible {
  color: var(--highlightThemeColor);
  background: var(--sideBarItemHoverBgColor);
  outline: none;
}

.sort-check {
  width: 16px;
  margin-right: 6px;
  display: inline-flex;
  align-items: center;
}

:global(.folder-sort-menu.el-popper) {
  border-color: var(--floatBorderColor);
  background: var(--floatBgColor);
}

:global(.folder-sort-menu .el-dropdown-menu) {
  background: var(--floatBgColor);
}

:global(.folder-sort-menu .el-dropdown-menu__item) {
  color: var(--sideBarColor);
}

:global(.folder-sort-menu .el-dropdown-menu__item:hover),
:global(.folder-sort-menu .el-dropdown-menu__item:focus) {
  color: var(--highlightThemeColor);
  background: var(--sideBarItemHoverBgColor);
}

:global(.folder-sort-menu .el-dropdown-menu__item--divided) {
  border-top-color: var(--floatBorderColor);
}

.project-tree > .title > a {
  pointer-events: auto;
  cursor: pointer;
  margin-left: 8px;
  color: var(--sideBarIconColor);
  opacity: 0;
}

.project-tree > .title > a:hover {
  color: var(--highlightThemeColor);
}

.project-tree > .title > a.active {
  color: var(--highlightThemeColor);
}

.project-tree > .tree-wrapper {
  overflow: auto;
  flex: 1;
}

.project-tree > .tree-wrapper::-webkit-scrollbar:vertical {
  width: 8px;
}
.project-tree div.title:hover > a {
  opacity: 1;
}
.open-project {
  box-sizing: border-box;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  align-items: center;
  padding-bottom: min(100px, calc(100% - 52px));
}

.open-project .centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.open-project .el-button {
  margin-top: 20px;
}
.open-project .el-button.is-text.is-has-bg,
.empty-project .el-button.is-text.is-has-bg {
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
  border-color: transparent;
}
.open-project .el-button.is-text.is-has-bg:hover,
.open-project .el-button.is-text.is-has-bg:focus,
.empty-project .el-button.is-text.is-has-bg:hover,
.empty-project .el-button.is-text.is-has-bg:focus {
  background-color: var(--buttonPrimaryBgColorHover);
  color: var(--buttonPrimaryFontColorHover);
}
.new-input {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--inputBgColor);
  width: calc(100% - 45px);
  border-radius: 3px;
}
.tree-wrapper {
  position: relative;
}
.empty-project {
  font-size: 14px;
  display: flex;
  flex-direction: column;
  padding-top: 40px;
  align-items: center;
  color: var(--sideBarTextColor);
  & button {
    margin-top: 10px;
  }
}
.filter-no-results {
  padding: 28px var(--files-content-inset);
  color: var(--sideBarTextColor);
  text-align: center;
}

.empty-project > a {
  color: var(--highlightThemeColor);
  text-align: center;
  margin-top: 15px;
  text-decoration: none;
}
.bold {
  font-weight: 600;
}
</style>
