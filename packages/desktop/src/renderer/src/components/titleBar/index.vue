<template>
  <div>
    <div
      v-if="showTitleBar"
      class="title-bar-editor-bg"
      :class="{ 'tabs-visible': tabBarVisible }"
    />
    <div
      v-if="showTitleBar"
      ref="titleBarElement"
      class="title-bar"
      :class="[
        { active: active },
        { 'tabs-visible': tabBarVisible },
        { frameless: isFramelessEditor },
        { concise: isConcise },
        { isOsx: isOsx }
      ]"
    >
      <div
        ref="titleElement"
        class="title"
        :title="filename || 'MarkText'"
        @dblclick.stop="toggleMaxmizeOnMacOS"
      >
        <span
          class="filename"
          :class="{ isOsx: platform === 'darwin' }"
          dir="ltr"
          @click="rename"
        >
          {{ visibleTitle }}
          <span
            v-if="filename"
            class="save-dot"
            :class="{ show: !isSaved }"
          />
        </span>
      </div>
      <nav
        v-if="isConcise"
        ref="leftToolbarElement"
        class="concise-menu title-no-drag"
      >
        <button
          v-for="item in conciseMenus"
          :key="item.section"
          type="button"
          class="concise-menu-button"
          :data-menu-section="item.section"
          @click.stop="handleConciseMenuClick(item.section, $event)"
        >
          {{ item.label }}
        </button>
      </nav>
      <div
        v-else
        ref="leftToolbarElement"
        :class="showCustomTitleBar ? 'left-toolbar title-no-drag' : 'right-toolbar'"
      >
        <div
          v-if="showCustomTitleBar"
          class="frameless-titlebar-menu title-no-drag"
          @click.stop="handleMenuClick"
        >
          <span class="text-center-vertical">&#9776;</span>
        </div>
      </div>
      <div
        v-if="isFramelessEditor && !isFullScreen"
        ref="rightToolbarElement"
        class="right-toolbar"
        :class="[{ 'title-no-drag': isFramelessEditor }]"
      >
        <div
          class="frameless-titlebar-button frameless-titlebar-close"
          @click.stop="handleCloseClick"
        >
          <div>
            <svg
              width="10"
              height="10"
            >
              <path :d="windowIconClose" />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-toggle"
          @click.stop="handleMaximizeClick"
        >
          <div>
            <svg
              width="10"
              height="10"
            >
              <path
                v-show="!isMaximized"
                :d="windowIconMaximize"
              />
              <path
                v-show="isMaximized"
                :d="windowIconRestore"
              />
            </svg>
          </div>
        </div>
        <div
          class="frameless-titlebar-button frameless-titlebar-minimize"
          @click.stop="handleMinimizeClick"
        >
          <div>
            <svg
              width="10"
              height="10"
            >
              <path :d="windowIconMinimize" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePreferencesStore } from '@/store/preferences.js'
import { useLayoutStore } from '@/store/layout.js'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { minimizePath, restorePath, maximizePath, closePath } from '../../assets/window-controls.js'
import { PATH_SEPARATOR } from '../../config'
import { isOsx as isOsxPlatform } from '@/util'
import { shouldShowInAppTitleBar } from './visibility'
import { useEditorStore } from '@/store/editor'
import { useI18n } from 'vue-i18n'
import {
  APPLICATION_MENU_SECTIONS,
  type ApplicationMenuSection,
  type MenuPopupPosition
} from '@shared/types/menu'
import { truncateTitleMiddle, withoutMenuMnemonic } from './display'

interface ProjectInfo {
  name?: string
  [key: string]: unknown
}

const props = defineProps<{
  project?: ProjectInfo | null
  filename?: string
  pathname?: string
  active?: boolean
  platform?: string
  isSaved?: boolean
}>()

const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const { t } = useI18n()

const isOsx = isOsxPlatform
const windowIconMinimize = minimizePath
const windowIconRestore = restorePath
const windowIconMaximize = maximizePath
const windowIconClose = closePath

const isFullScreen = ref(false)
const isMaximized = ref(false)
const titleBarElement = ref<HTMLElement | null>(null)
const titleElement = ref<HTMLElement | null>(null)
const leftToolbarElement = ref<HTMLElement | null>(null)
const rightToolbarElement = ref<HTMLElement | null>(null)
const titleAvailableWidth = ref(0)
let titleResizeObserver: ResizeObserver | null = null

onMounted(async () => {
  try {
    const [fs, max] = await Promise.all([
      window.electron.windowControl.isFullScreen(),
      window.electron.windowControl.isMaximized()
    ])
    isFullScreen.value = !!fs
    isMaximized.value = !!max
  } catch {}

  await nextTick()
  updateTitleLayout()
  titleResizeObserver = new ResizeObserver(updateTitleLayout)
  for (const element of [
    titleBarElement.value,
    leftToolbarElement.value,
    rightToolbarElement.value
  ]) {
    if (element) titleResizeObserver.observe(element)
  }
})

const { titleBarStyle } = storeToRefs(preferencesStore)
const { tabBarVisible } = storeToRefs(layoutStore)

const isConcise = computed(() => titleBarStyle.value === 'concise' && !isOsx)
const isFramelessEditor = computed(() => {
  return !isOsx && (titleBarStyle.value === 'custom' || titleBarStyle.value === 'concise')
})

const paths = computed(() => {
  if (!props.pathname) return []
  const pathnameToken = props.pathname.split(PATH_SEPARATOR).filter((i) => i)
  return pathnameToken.slice(0, pathnameToken.length - 1).slice(-3)
})

const fullTitle = computed(() => {
  if (!props.filename) return 'MarkText'
  return isConcise.value ? props.filename : [...paths.value, props.filename].join(' › ')
})

const measureTitle = (candidate: string): number => {
  const element = titleElement.value
  if (!element) return Number.POSITIVE_INFINITY
  const style = window.getComputedStyle(element)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return Number.POSITIVE_INFINITY
  context.font = style.font
  return context.measureText(candidate).width
}

const visibleTitle = computed(() =>
  truncateTitleMiddle(fullTitle.value, titleAvailableWidth.value, measureTitle)
)

const conciseMenuKeys: Record<ApplicationMenuSection, string> = {
  file: 'menu.file.file',
  edit: 'menu.edit.edit',
  paragraph: 'menu.paragraph.title',
  format: 'menu.format.format',
  window: 'menu.window.title',
  theme: 'menu.theme.theme',
  view: 'menu.view.view',
  help: 'menu.help.help'
}

const conciseMenus = computed(() =>
  APPLICATION_MENU_SECTIONS.map((section) => ({
    section,
    label: withoutMenuMnemonic(t(conciseMenuKeys[section]))
  }))
)

function updateTitleLayout (): void {
  const bar = titleBarElement.value
  if (!bar) return
  const leftWidth = leftToolbarElement.value?.getBoundingClientRect().width ?? 0
  const rightWidth = rightToolbarElement.value?.getBoundingClientRect().width ?? 0
  const safeInset = Math.ceil(Math.max(leftWidth, rightWidth))
  bar.style.setProperty('--title-safe-inset', `${safeInset}px`)
  titleAvailableWidth.value = Math.max(0, bar.clientWidth - safeInset * 2 - 16)
}

watch([isFullScreen, isConcise], async () => {
  await nextTick()
  updateTitleLayout()
})

const showCustomTitleBar = computed(() => {
  return titleBarStyle.value === 'custom' && !isOsx
})

const showTitleBar = computed(() => {
  return shouldShowInAppTitleBar(titleBarStyle.value, isOsx)
})

watch(
  () => props.filename,
  (value) => {
    // Set filename when hover on dock
    const hasOpenFolder = !!(props.project && props.project.name)
    const projectName = props.project?.name ?? ''
    let title = ''
    if (value) {
      title = hasOpenFolder ? `${value} - ${projectName}` : `${value}`
    } else {
      title = hasOpenFolder ? projectName : ''
    }

    document.title = title
  }
)

const handleCloseClick = () => {
  window.electron.windowControl.close()
}

const handleMaximizeClick = async () => {
  if (isFullScreen.value) {
    window.electron.windowControl.setFullScreen(false)
    return
  }
  if (isMaximized.value) window.electron.windowControl.unmaximize()
  else window.electron.windowControl.maximize()
}

const toggleMaxmizeOnMacOS = () => {
  if (isOsx) {
    handleMaximizeClick()
  }
}

const handleMinimizeClick = () => {
  window.electron.windowControl.minimize()
}

const handleMenuClick = () => {
  window.electron.windowControl.popupApplicationMenu({ x: 23, y: 20 })
}

const handleConciseMenuClick = (section: ApplicationMenuSection, event: MouseEvent) => {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const position: MenuPopupPosition = {
    x: Math.round(bounds.left),
    y: Math.round(bounds.bottom)
  }
  const controls = window.electron.windowControl as typeof window.electron.windowControl & {
    popupApplicationSubmenu(
      section: ApplicationMenuSection,
      position: MenuPopupPosition
    ): void
  }
  controls.popupApplicationSubmenu(section, position)
}

const rename = () => {
  if (props.platform === 'darwin') {
    editorStore.RESPONSE_FOR_RENAME()
  }
}

const onMaximize = () => {
  isMaximized.value = true
}
const onUnmaximize = () => {
  isMaximized.value = false
}
const onEnterFullScreen = () => {
  isFullScreen.value = true
}
const onLeaveFullScreen = () => {
  isFullScreen.value = false
}

const offMaximize = window.electron.ipcRenderer.on('mt::window-maximize', onMaximize)
const offUnmaximize = window.electron.ipcRenderer.on('mt::window-unmaximize', onUnmaximize)
const offEnterFullScreen = window.electron.ipcRenderer.on(
  'mt::window-enter-full-screen',
  onEnterFullScreen
)
const offLeaveFullScreen = window.electron.ipcRenderer.on(
  'mt::window-leave-full-screen',
  onLeaveFullScreen
)

onBeforeUnmount(() => {
  titleResizeObserver?.disconnect()
  offMaximize()
  offUnmaximize()
  offEnterFullScreen()
  offLeaveFullScreen()
})
</script>

<style scoped>
.title-bar-editor-bg {
  height: var(--appShellTitleBarHeight);
  background: var(--appShellEditorBg);
  position: relative;
  left: 0;
  top: 0;
  right: 0;
}
.title-bar {
  --title-safe-inset: 142px;

  -webkit-app-region: drag;
  user-select: none;
  background: transparent;
  height: var(--appShellTitleBarHeight);
  box-sizing: border-box;
  color: var(--appShellStrongFg);
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  z-index: 2;
  transition: color 0.4s ease-in-out;
  cursor: default;
}
.active {
  color: var(--appShellStrongFg);
}
img {
  height: 90%;
  margin-top: 1px;
  vertical-align: top;
}
.title {
  position: absolute;
  left: 50%;
  width: max(0px, calc(100% - 2 * var(--title-safe-inset)));
  box-sizing: border-box;
  transform: translateX(-50%);
  height: 100%;
  line-height: var(--appShellTitleBarHeight);
  font-size: 14px;
  text-align: center;
  transition: color 0.25s ease-in-out;
  & .filename {
    transition: color 0.25s ease-in-out;
  }
  &::after {
    content: '';
    position: absolute;
    top: 0;
    height: 1px;
    width: 100%;
    z-index: 1;
    -webkit-app-region: no-drag;
  }
}
.title > .filename {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  unicode-bidi: isolate;
}

.title-bar .title .filename.isOsx:hover {
  color: var(--themeColor);
}

.active .save-dot {
  margin-right: 0.25rem;
  width: 8px;
  height: 8px;
  display: inline-block;
  border-radius: 50%;
  background: var(--highlightThemeColor);
  opacity: 0.7;
  visibility: hidden;
}
.active .save-dot.show {
  visibility: visible;
}
.title:hover {
  color: var(sideBarTitleColor);
}

.left-toolbar {
  padding: 0 10px;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  width: 118px; /* + 2*10px padding*/
  display: flex;
  flex-direction: row;
}
.concise-menu {
  position: absolute;
  inset: 0 auto 0 0;
  display: flex;
  align-items: stretch;
  flex-wrap: nowrap;
  white-space: nowrap;
}
.concise-menu-button {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 5px;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: 12px;
  line-height: 30px;
  cursor: default;
}
.concise-menu-button:hover,
.concise-menu-button:focus-visible {
  outline: none;
  background: var(--appShellHoverBg);
}
.right-toolbar {
  height: 100%;
  position: absolute;
  top: 0;
  right: 0;
  width: 138px;
  display: flex;
  align-items: center;
  flex-direction: row-reverse;
  & .item {
    margin-right: 10px;
  }
}

.title-no-drag {
  -webkit-app-region: no-drag;
}
/* frameless window controls */
.frameless-titlebar-button {
  position: relative;
  display: block;
  width: 46px;
  height: var(--appShellTitleBarHeight);
}
.frameless-titlebar-button > div {
  position: absolute;
  display: inline-flex;
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-50%);
}
.frameless-titlebar-menu {
  color: var(--appShellStrongFg);
}
.frameless-titlebar-close:hover {
  background-color: var(--appShellDestructiveHoverBg);
}
.frameless-titlebar-minimize:hover,
.frameless-titlebar-toggle:hover {
  background-color: var(--appShellHoverBg);
}
.frameless-titlebar-button svg {
  fill: currentcolor !important;
}
.frameless-titlebar-close:hover svg {
  fill: var(--appShellDestructiveHoverFg) !important;
}

.text-center-vertical {
  display: inline-block;
  vertical-align: middle;
  line-height: normal;
}
</style>

<style>
.title-item {
  height: 28px;
  line-height: 28px;
  & .front {
    opacity: 0.7;
  }
  & .text {
    margin-left: 10px;
  }
}
</style>
