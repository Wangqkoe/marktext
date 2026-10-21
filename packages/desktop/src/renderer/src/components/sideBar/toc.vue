<template>
  <div
    class="side-bar-toc"
    :class="[{ 'side-bar-toc-overflow': !wordWrapInToc, 'side-bar-toc-wordwrap': wordWrapInToc }]"
    :style="{ '--mark-highlight-color': highlightColor }"
  >
    <el-tree
      v-if="filteredToc.nodes.length"
      :key="treeRenderKey"
      ref="tocTreeRef"
      :data="filteredToc.nodes"
      node-key="key"
      :default-expanded-keys="expandedKeys"
      :current-node-key="activeNodeKey"
      highlight-current
      :props="defaultProps"
      :expand-on-click-node="false"
      :indent="10"
      :icon="ArrowRight"
      @node-click="handleClick"
      @node-expand="onExpand"
      @node-collapse="onCollapse"
    >
      <!-- Element Plus escapes `data.label`, so showing the heading HTML needs a
           scoped slot; re-add the label wrapper the default renderer would have
           made so the outline CSS keeps applying. -->
      <template #default="{ data }">
        <!-- eslint-disable vue/no-v-html -- sanitized by labelHtmlOf -->
        <span
          class="el-tree-node__label"
          :title="plainLabel(data)"
          v-html="labelHtmlOf(data)"
        />
        <!-- eslint-enable vue/no-v-html -->
      </template>
    </el-tree>
    <div
      v-else-if="filteredToc.active"
      class="toc-filter-no-results"
    >
      {{ t('sideBar.inlineSearch.outlineNoResults') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { deriveKeyedToc, type KeyedTocNode } from '@/util/tocKeys'
import { sanitize, TOC_DOMPURIFY_CONFIG } from '@/util/dompurify'
import bus from '../../bus'
import { storeToRefs } from 'pinia'
import { ArrowRight } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { filterOutline } from '@/util/sidebarFilter'
import type { TreeInstance } from 'element-plus'

const props = defineProps<{ query?: string }>()
const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const tocTreeRef = ref<TreeInstance | null>(null)

const defaultProps = {
  children: 'children',
  label: 'label'
}

interface TocNodeData {
  label?: unknown
  labelHtml?: unknown
}

const plainLabel = (data: TocNodeData): string =>
  typeof data.label === 'string' ? data.label : ''

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const labelHtmlOf = (data: TocNodeData): string => {
  const html = typeof data.labelHtml === 'string' ? data.labelHtml : ''
  return html ? sanitize(html, TOC_DOMPURIFY_CONFIG) : escapeHtml(plainLabel(data))
}

const { toc } = storeToRefs(editorStore)
const { wordWrapInToc, highlightColor } = storeToRefs(preferencesStore)

// Stable per-node key so el-tree preserves the user's expand/collapse state
// across content edits (#3028) and tab switches (#3791). See deriveKeyedToc.
const keyedToc = computed<KeyedTocNode[]>(() => deriveKeyedToc(toc.value))
const filteredToc = computed(() => filterOutline(keyedToc.value, props.query ?? ''))
const treeRenderKey = computed(() =>
  filteredToc.value.active ? `filter:${props.query}` : 'outline'
)

// Track which headings the user collapsed, by stable key (#3028). Headings are
// expanded by default; a collapse is remembered here.
const collapsedKeys = ref<Set<string>>(new Set())
const searchCollapsedKeys = ref<Set<string>>(new Set())

const onCollapse = (data: { key?: string }): void => {
  if (!data.key) return
  if (filteredToc.value.active) {
    searchCollapsedKeys.value = new Set(searchCollapsedKeys.value).add(data.key)
  } else {
    collapsedKeys.value = new Set(collapsedKeys.value).add(data.key)
  }
}

const onExpand = (data: { key?: string }): void => {
  if (!data.key) return
  const source = filteredToc.value.active ? searchCollapsedKeys : collapsedKeys
  const next = new Set(source.value)
  next.delete(data.key)
  source.value = next
}

watch(
  () => props.query,
  (query) => {
    if (!query?.length) searchCollapsedKeys.value = new Set()
  }
)

// The set el-tree should have expanded: every node that is neither collapsed
// nor inside a collapsed ancestor. On each content edit el-tree rebuilds and
// re-applies these keys, so binding the *correct* set makes it paint the right
// state directly — instead of expanding everything and then collapsing, which
// flickered.
const expandedKeys = computed<string[]>(() => {
  const keys: string[] = []
  const walk = (nodes: KeyedTocNode[], hiddenByAncestor: boolean): void => {
    for (const node of nodes) {
      const collapsed =
        hiddenByAncestor ||
        (filteredToc.value.active
          ? searchCollapsedKeys.value.has(node.key) ||
            (node.children.length > 0 && !filteredToc.value.autoExpandedKeys.has(node.key))
          : collapsedKeys.value.has(node.key))
      if (!collapsed) keys.push(node.key)
      walk(node.children, collapsed)
    }
  }
  walk(filteredToc.value.nodes, false)
  return keys
})

// The store names the caret's heading by engine slug; el-tree keys its nodes by
// githubSlug. Both sit on the same node, so one resolves to the other.
const activeNodeKey = computed<string>(() => {
  const slug = editorStore.activeHeadingSlug
  if (typeof slug !== 'string') return ''
  const findKey = (nodes: KeyedTocNode[]): string => {
    for (const node of nodes) {
      if (node.slug === slug) return node.key
      const found = findKey(node.children)
      if (found) return found
    }
    return ''
  }
  return findKey(keyedToc.value)
})

// `current-node-key` only seeds el-tree at mount; later changes need the setter.
watch(activeNodeKey, (key) => {
  tocTreeRef.value?.setCurrentKey(key || undefined)
})

const handleClick = (data: { slug?: unknown }): void => {
  // editor.vue resolves the slug to a heading by document order — bail out if
  // the node has no slug (e.g. unsluggable headings) rather than emitting an
  // `undefined` / non-string payload it cannot match.
  if (typeof data.slug !== 'string' || data.slug.length === 0) return
  bus.emit('scroll-to-header', data.slug)
}
</script>

<style>
.side-bar-toc {
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.side-bar-toc .el-tree-node {
  margin-top: 8px;
}

.side-bar-toc .el-tree {
  background: transparent;
  color: var(--sideBarColor);
  flex: 1;
  min-height: 0;
}

/* The scoped slot replaced Element Plus's `<el-text truncated>` label, so its
   truncation is re-declared here. `color: inherit` overrides the gray that
   `el-text` imposed, which beat the themed color from `.el-tree` (#5094). */
.side-bar-toc .el-tree-node__label {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  color: inherit;
  align-self: center;
  overflow-wrap: break-word;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-bar-toc .el-tree-node__expand-icon {
  color: var(--sideBarIconColor);
}

.side-bar-toc .el-tree-node:focus > .el-tree-node__content {
  background-color: var(--sideBarItemHoverBgColor);
}

.side-bar-toc .el-tree-node__content:hover {
  background: var(--sideBarItemHoverBgColor);
}

/* Element Plus paints `.is-current` from a selector carrying
   `.el-tree--highlight-current`, so overriding it needs that class too. The
   label is an `.el-text`, which sets its own color instead of inheriting. */
.side-bar-toc .el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content {
  background-color: var(--sideBarItemHoverBgColor);
  color: var(--themeColor);
}

.side-bar-toc .el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content .el-tree-node__label {
  color: var(--themeColor);
}

.side-bar-toc > li {
  font-size: 14px;
  margin-bottom: 15px;
  cursor: pointer;
}
.side-bar-toc-overflow {
  overflow: auto;
}
.side-bar-toc-wordwrap {
  overflow-x: hidden;
  overflow-y: auto;
}

.side-bar-toc-wordwrap .el-tree,
.side-bar-toc-wordwrap .el-tree-node,
.side-bar-toc-wordwrap .el-tree-node__children {
  min-width: 0;
}

.side-bar-toc-wordwrap .el-tree-node__content {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  white-space: normal;
  height: auto;
  min-height: 26px;
}

.side-bar-toc-wordwrap .el-tree-node__content .el-tree-node__label {
  min-width: 0;
  flex: 1;
  padding: 3px 0;
  line-height: 20px;
  overflow-wrap: anywhere;
  white-space: normal;
}

.toc-filter-no-results {
  padding: 28px 12px;
  color: var(--sideBarTextColor);
  text-align: center;
}

.side-bar-toc .el-tree-node__label strong {
  font-weight: 700;
}

.side-bar-toc .el-tree-node__label em {
  font-style: italic;
}

.side-bar-toc .el-tree-node__label del {
  opacity: 0.65;
  text-decoration: line-through;
}

/* Same colour as `<mark>` in the editor: the "default highlight colour"
   preference, which `--mark-highlight-color` carries on the outline root. */
.side-bar-toc .el-tree-node__label mark {
  padding: 0 2px;
  color: inherit;
  background-color: var(--mark-highlight-color, #ffff00);
  border-radius: 2px;
}

.side-bar-toc .el-tree-node__label code {
  padding: 0 3px;
  font-family: 'DejaVu Sans Mono', 'Source Code Pro', 'Droid Sans Mono', Consolas, monospace;
  font-size: 0.9em;
  color: var(--codeBlockColor);
  background: var(--codeBgColor);
  border-radius: 3px;
  /* Prism sets `white-space: normal` on every non-`pre` code element, which
     overrides the label's nowrap setting and makes the row overflow. */
  white-space: inherit;
}

.side-bar-toc .el-tree-node__label sup,
.side-bar-toc .el-tree-node__label sub {
  /* Keeps a raised superscript from growing the row. */
  line-height: 0;
}
</style>
