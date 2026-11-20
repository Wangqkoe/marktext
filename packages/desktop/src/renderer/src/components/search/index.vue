<template>
  <div
    v-show="showSearch"
    ref="searchBarRoot"
    class="search-bar"
  >
    <div
      class="left-arrow"
      @click="toggleSearchType"
    >
      <el-icon
        :size="14"
        :class="{ 'arrow-right': type === 'search' }"
      >
        <ArrowDown />
      </el-icon>
    </div>
    <div class="right-controls">
      <section class="search">
        <div
          class="input-wrapper"
          :class="{ error: !!searchErrorMsg }"
        >
          <input
            ref="search"
            v-model="searchValue"
            type="text"
            :placeholder="t('search.searchPlaceholder')"
            @keyup="handleEnterKey"
          >
          <div class="controls">
            <span
              v-show="searchValue"
              class="search-result"
            >{{ highlightIndex + 1 }} /
              {{ highlightCount }}
            </span>
            <span
              :title="t('search.caseSensitive')"
              class="is-case-sensitive"
              :class="{ active: isCaseSensitive }"
              @click="toggleCtrl('isCaseSensitive')"
            >
              <FindCaseIcon aria-hidden="true" />
            </span>
            <span
              :title="t('search.wholeWord')"
              class="is-whole-word"
              :class="{ active: isWholeWord }"
              @click="toggleCtrl('isWholeWord')"
            >
              <FindWordIcon aria-hidden="true" />
            </span>
            <span
              :title="t('search.useRegex')"
              class="is-regex"
              :class="{ active: isRegexp }"
              @click="toggleCtrl('isRegexp')"
            >
              <FindRegexIcon aria-hidden="true" />
            </span>
          </div>
          <div
            v-if="searchErrorMsg"
            class="error-msg"
          >
            {{ searchErrorMsg }}
          </div>
        </div>
        <div class="button-group">
          <button
            class="button right"
            @click="find('prev')"
          >
            <el-icon :size="14">
              <ArrowUp />
            </el-icon>
          </button>
          <button
            class="button"
            @click="find('next')"
          >
            <el-icon :size="14">
              <ArrowDown />
            </el-icon>
          </button>
        </div>
      </section>
      <section
        v-if="type === 'replace'"
        class="replace"
      >
        <div class="input-wrapper replace-input">
          <input
            v-model="replaceValue"
            type="text"
            :placeholder="t('search.replacementPlaceholder')"
          >
        </div>
        <div class="button-group">
          <el-tooltip
            class="item"
            effect="dark"
            :content="t('search.replaceAll')"
            placement="top"
            :visible-arrow="false"
            :open-delay="1000"
          >
            <button
              class="button right"
              @click="replace(false)"
            >
              <el-icon :size="14">
                <RefreshRight />
              </el-icon>
            </button>
          </el-tooltip>
          <el-tooltip
            class="item"
            effect="dark"
            :content="t('search.replaceSingle')"
            placement="top"
            :visible-arrow="false"
            :open-delay="1000"
          >
            <button
              class="button"
              @click="replace(true)"
            >
              <el-icon :size="14">
                <Switch />
              </el-icon>
            </button>
          </el-tooltip>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import bus from '../../bus'
import FindCaseIcon from '@/assets/icons/searchIcons/iconCase.svg'
import FindWordIcon from '@/assets/icons/searchIcons/iconWord.svg'
import FindRegexIcon from '@/assets/icons/searchIcons/iconRegex.svg'
import { useI18n } from 'vue-i18n'
import debounce from 'lodash/debounce'
import { ArrowDown, ArrowUp, RefreshRight, Switch } from '@element-plus/icons-vue'

export interface PaneSearchMatches {
  index: number
  matches: Array<{ start: number; end: number; match: string }>
  value: string
}

export interface SearchOptions {
  isCaseSensitive?: boolean
  isWholeWord?: boolean
  isRegexp?: boolean
  selectHighlight?: boolean
}

// Each pane mounts its own bar. It talks only to its parent editor, so the
// query, highlights and count stay on this pane's document.
const props = defineProps<{
  paneFocused: boolean
  /** The pane's last search result, or the selection to prefill from. */
  matches: PaneSearchMatches
}>()

const emit = defineEmits<{
  search: [payload: { value: string; opt: SearchOptions }]
  replace: [payload: { value: string; opt: SearchOptions & { isSingle: boolean } }]
  find: [action: 'prev' | 'next']
}>()

const { t } = useI18n()

const showSearch = ref(false)
const isCaseSensitive = ref(false)
const isWholeWord = ref(false)
const isRegexp = ref(false)
const type = ref('search')
const searchValue = ref('')
const replaceValue = ref('')
const searchErrorMsg = ref('')
const search = ref<HTMLInputElement | null>(null)
const searchBarRoot = ref<HTMLDivElement | null>(null)

const searchMatches = computed(() => props.matches)

watch(searchValue, () => {
  if (!showSearch.value) return // make sure search box is actually open
  debouncedSearchFn()
})

watch(searchMatches, (newValue, oldValue) => {
  // Once the search bar is open it owns the query. Ignore editor
  // selection-changes while open — notably the spurious selection-change the
  // engine emits when the bar steals editor focus, which would otherwise
  // clobber the just-prefilled value (e.g. leaving a stale single character).
  if (showSearch.value) return
  if (!newValue || !oldValue) return
  const { value } = newValue
  if (value !== oldValue.value) {
    searchValue.value = value
  }
})

// Seed the find input from the current selection synchronously, before the bar
// opens and steals focus. Relying on the reactive `searchMatches` watch alone
// races with the focus-steal selection-change and can drop the prefill.
const prefillFromSelection = () => {
  const selected = searchMatches.value?.value
  if (selected) {
    searchValue.value = selected
  }
}

const highlightIndex = computed(() => searchMatches.value.index)

const highlightCount = computed(() => searchMatches.value.matches.length)

// Find commands arrive on the window-wide bus; only the focused pane's bar
// answers them.
const whenPaneFocused = (handler: () => void) => () => {
  if (props.paneFocused) handler()
}
const listenFindFocused = whenPaneFocused(() => listenFind())
const listenReplaceFocused = whenPaneFocused(() => listenReplace())
const listenFindNextFocused = whenPaneFocused(() => find('next'))
const listenFindPrevFocused = whenPaneFocused(() => find('prev'))

onMounted(() => {
  bus.on('find', listenFindFocused)
  bus.on('replace', listenReplaceFocused)
  bus.on('findNext', listenFindNextFocused)
  bus.on('findPrev', listenFindPrevFocused)
  document.addEventListener('click', docClick)
  document.addEventListener('keyup', docKeyup)
  bus.on('search-blur', blurSearch)
})

onBeforeUnmount(() => {
  bus.off('find', listenFindFocused)
  bus.off('replace', listenReplaceFocused)
  bus.off('findNext', listenFindNextFocused)
  bus.off('findPrev', listenFindPrevFocused)
  document.removeEventListener('click', docClick)
  document.removeEventListener('keyup', docKeyup)
  bus.off('search-blur', blurSearch)
})

const toggleCtrl = (ctrl: 'isCaseSensitive' | 'isWholeWord' | 'isRegexp') => {
  switch (ctrl) {
    case 'isCaseSensitive':
      isCaseSensitive.value = !isCaseSensitive.value
      break
    case 'isWholeWord':
      isWholeWord.value = !isWholeWord.value
      break
    case 'isRegexp':
      isRegexp.value = !isRegexp.value
      break
  }
  searchFn()
}

const listenFind = () => {
  prefillFromSelection()
  showSearch.value = true
  type.value = 'search'
  nextTick(() => {
    search.value?.focus()
    // Select the existing term so re-opening Find types over it instead of
    // appending to the previous query (#3458).
    search.value?.select()
    if (searchValue.value) {
      searchFn()
    }
  })
}

const listenReplace = () => {
  prefillFromSelection()
  showSearch.value = true
  type.value = 'replace'
}

const docKeyup = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.paneFocused) {
    emptySearch(true)
  }
}

// Only a click into this bar's own pane closes it, so both panes can keep a
// search open side by side and the sidebar, title bar or dialogs leave it be.
const docClick = (event: MouseEvent) => {
  if (!showSearch.value) return
  const target = event.target as HTMLElement | null
  if (!target || target.closest('.search-bar')) return
  const ownPane = searchBarRoot.value?.closest('.workspace-pane')
  if (ownPane && ownPane.contains(target)) emptySearch(true)
}

const blurSearch = () => {
  // Every pane's bar hears this; a closed one has nothing to clear.
  if (showSearch.value) emptySearch(true)
}

const emptySearch = (selectHighlight = false) => {
  showSearch.value = false
  searchValue.value = ''
  replaceValue.value = ''
  emit('search', { value: searchValue.value, opt: { selectHighlight } })
}

/** Closes the bar and clears its highlights without moving the caret. */
const close = () => {
  if (showSearch.value) emptySearch(false)
}

/**
 * The query the open bar shows, for re-running it after the document is
 * replaced underneath it; null when there is nothing to re-run.
 */
const openQuery = (): { value: string; opt: SearchOptions } | null => {
  if (!showSearch.value || !searchValue.value || searchErrorMsg.value) return null
  return {
    value: searchValue.value,
    opt: { isCaseSensitive: isCaseSensitive.value, isWholeWord: isWholeWord.value, isRegexp: isRegexp.value }
  }
}

defineExpose({ close, openQuery })

const toggleSearchType = () => {
  type.value = type.value === 'search' ? 'replace' : 'search'
}

/**
 * Find the previous or next search result.
 * action: prev or next
 */
const find = (action: 'prev' | 'next') => {
  emit('find', action)
}

const handleEnterKey = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    find('next')
  }
}

const searchFn = () => {
  if (isRegexp.value) {
    // Handle invalid regexp.
    try {
      RegExp(searchValue.value)
      searchErrorMsg.value = ''
    } catch {
      searchErrorMsg.value = t('search.invalidRegex', { pattern: searchValue.value })
      return
    }
    // Handle match empty string, no need to search.
    try {
      const SEARCH_REG = new RegExp(searchValue.value)
      if (searchValue.value && SEARCH_REG.test('')) {
        throw new Error()
      }
      searchErrorMsg.value = ''
    } catch {
      searchErrorMsg.value = t('search.regexMatchEmpty', { pattern: searchValue.value })
      return
    }
  }

  emit('search', {
    value: searchValue.value,
    opt: {
      isCaseSensitive: isCaseSensitive.value,
      isWholeWord: isWholeWord.value,
      isRegexp: isRegexp.value
    }
  })
}

const debouncedSearchFn = debounce(searchFn, 150)

const replace = (isSingle = true) => {
  emit('replace', {
    value: replaceValue.value,
    opt: {
      isSingle,
      isCaseSensitive: isCaseSensitive.value,
      isWholeWord: isWholeWord.value,
      isRegexp: isRegexp.value
    }
  })
}
</script>

<style scoped>
.search-bar {
  position: absolute;
  width: 400px;
  max-width: calc(100% - 40px);
  padding: 0;
  top: 0;
  right: 20px;
  border-radius: 3px;
  box-shadow: var(--floatShadow);
  background: var(--floatBgColor);
  display: flex;
  flex-direction: row;
}
.search-bar .left-arrow {
  width: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.search-bar .left-arrow:hover {
  background: var(--floatHoverColor);
}
.search-bar .left-arrow svg {
  height: 12px;
  width: 12px;
}
.search-bar .left-arrow .arrow-right {
  transform: rotate(-90deg);
}

.search-bar .right-controls {
  flex: 1;
}
.search,
.replace {
  height: 28px;
  display: flex;
  padding: 4px 10px 0 4px;
  margin-bottom: 5px;
}

.search-bar .button {
  outline: none;
  cursor: pointer;
  box-sizing: border-box;
  height: 28px;
  width: 28px;
  text-align: center;
  padding: 5px;
  display: inline-block;
  font-weight: 500;
  color: var(--sideBarIconColor);
  &.left {
    margin-right: 10px;
  }
  &.right {
    margin-left: 10px;
  }
}
.button.active {
  color: var(--themeColor);
}
.search-bar .button > svg {
  width: 16px;
  height: 16px;
}
.search-bar .button:active {
  opacity: 0.5;
}
.input-wrapper {
  display: flex;
  flex: 1;
  position: relative;
  border: 1px solid var(--inputBgColor);
  background: var(--inputBgColor);
  border-radius: 3px;
  overflow: visible;
}
.input-wrapper.error {
  border: 1px solid var(--notificationErrorBg);
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;
}
.input-wrapper .controls {
  flex-shrink: 0;
  align-self: flex-end;
  padding-right: 10px;
  font-size: 12px;
  display: flex;
  color: var(--sideBarTitleColor);
  & > span.search-result {
    height: 20px;
    margin-right: 5px;
    line-height: 17px;
  }
  & > span:not(.search-result) {
    cursor: pointer;
    width: 20px;
    height: 20px;
    margin-left: 2px;
    margin-right: 2px;
    &:hover {
      color: var(--sideBarIconColor);
    }
    & > svg {
      fill: var(--sideBarIconColor);
      &:hover {
        fill: var(--highlightThemeColor);
      }
    }
    &.active svg {
      fill: var(--highlightThemeColor);
    }
  }
}

.input-wrapper .error-msg {
  position: absolute;
  top: 27px;
  width: calc(100% + 2px);
  height: 28px;
  left: -1px;
  padding: 0 8px;
  box-sizing: border-box;
  border-bottom-left-radius: 3px;
  border-bottom-right-radius: 3px;
  background: var(--notificationErrorBg);
  line-height: 28px;
  color: #ffffff;
  font-size: 14px;
  z-index: 1;
}

.input-wrapper input {
  flex: 1;
  min-width: 0;
  padding: 0 8px;
  height: 26px;
  outline: none;
  border: none;
  box-sizing: border-box;
  font-size: 14px;
  color: var(--editorColor);
  padding: 0 8px;
  background: transparent;
}
</style>
