<template>
  <div
    ref="sourceCodeContainer"
    class="source-code"
  />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick, computed } from 'vue'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { findMarkdownHeadingLine, scrollSourceEditorToLine } from '@/util/sourceModeToc'
import { storeToRefs } from 'pinia'
import codeMirror, { setCursorAtFirstLine, setTextDirection } from '../../codeMirror'
import { wordCount as getWordCount } from '@muyajs/core'
import { adjustCursor } from '../../util'
import bus from '../../bus'
import { oneDarkThemes, railscastsThemes } from '@/config'
import { toCaretPosition } from '@/util/caretPosition'
import type { CaretPositionUpdate, CaretSession } from '@/util/caretPosition'
import type { PaneEditorComposition, PaneEditorEventScope } from '@/workspace'
import type { IFileState } from '@shared/types/files'

// CodeMirror 5 ships no first-party types; the wrapper in src/renderer/src/
// codeMirror/index.ts also keeps the surface intentionally loose.
type CMInstance = any
type CMCursor = any

interface MuyaIndexCursorLike {
  anchor: CMCursor
  focus: CMCursor
}

const props = defineProps<{
  markdown?: string
  muyaIndexCursor?: unknown
  caretSession: CaretSession
  textDirection: string
  composition: PaneEditorComposition
  activeFile?: IFileState
  focused?: boolean
}>()

const emit = defineEmits<{
  'caret-position': [update: CaretPositionUpdate]
}>()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const sourceCodeContainer = ref<HTMLDivElement | null>(null)
const editor = ref<CMInstance>(null)
const commitTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const viewDestroyed = ref(false)
const tabId = ref<string | null>(null)
let sourceEventScope: PaneEditorEventScope | undefined
let sourceDocumentId: string | undefined
let receivingSharedDocument = false
const sourceScopeAbort = new AbortController()
const focusedBusHandlers = new Map<string, (...args: any[]) => void>()
const onFocused = (event: string, handler: (...args: any[]) => void): void => {
  const guarded = (...args: any[]) => { if (props.focused !== false) handler(...args) }
  focusedBusHandlers.set(event, guarded)
  bus.on(event, guarded)
}
const offFocused = (event: string): void => {
  const handler = focusedBusHandlers.get(event)
  if (handler) bus.off(event, handler)
  focusedBusHandlers.delete(event)
}

const { theme, sourceCode } = storeToRefs(preferencesStore)
const { currentFile: legacyCurrentTab } = storeToRefs(editorStore)
const currentTab = computed(() => props.activeFile ?? legacyCurrentTab.value)

const reportCaretPosition = (cm: CMInstance, session: CaretSession): void => {
  emit('caret-position', {
    session,
    position: toCaretPosition(cm.getCursor('head'))
  })
}

const isValidMuyaIndexCursor = (cursor: unknown): cursor is MuyaIndexCursorLike => {
  const c = cursor as MuyaIndexCursorLike | null | undefined
  return !!(c && c.anchor && c.focus)
}

watch(
  () => props.textDirection,
  (value, oldValue) => {
    if (value !== oldValue && editor.value) {
      setTextDirection(editor.value, value)
    }
  }
)

watch(
  () => props.caretSession,
  (session) => {
    nextTick(() => {
      if (editor.value) reportCaretPosition(editor.value, session)
    })
  }
)

watch(
  () => props.markdown,
  (markdown) => {
    const scope = props.composition.getScope()
    if (
      scope?.mode === 'source' &&
      editor.value &&
      typeof markdown === 'string' &&
      markdown !== editor.value.getValue()
    ) {
      const selections = editor.value.listSelections()
      const scrollTop = sourceCodeContainer.value?.scrollTop ?? 0
      receivingSharedDocument = true
      try {
        editor.value.setValue(markdown)
        editor.value.setSelections(selections, 0, { scroll: false })
        if (sourceCodeContainer.value) sourceCodeContainer.value.scrollTop = scrollTop
      } finally {
        receivingSharedDocument = false
      }
    }
  }
)

const getMarkdownAndCursor = (cm: CMInstance) => {
  let focus = cm.getCursor('head')
  let anchor = cm.getCursor('anchor')

  const markdown: string = cm.getValue()
  const convertToMuyaCursor = (cursor: CMCursor) => {
    const line = cm.getLine(cursor.line)
    const preLine = cm.getLine(cursor.line - 1)
    const nextLine = cm.getLine(cursor.line + 1)
    return adjustCursor(
      cursor,
      preLine,
      line,
      nextLine,
      (lineNumber) => {
        return cm.getLine(lineNumber)
      },
      cm.lineCount()
    )
  }

  anchor = convertToMuyaCursor(anchor) // Selection start as Muya cursor
  focus = convertToMuyaCursor(focus) // Selection end as Muya cursor

  // Normalize cursor that `anchor` is always before `focus` because
  // this is the expected behavior in Muya.
  if (anchor && focus && anchor.line > focus.line) {
    const tmpCursor = focus
    focus = anchor
    anchor = tmpCursor
  }
  return { cursor: { focus, anchor }, markdown }
}

const activeSourceScope = (): PaneEditorEventScope | undefined => {
  const scope = props.composition.getScope()
  return scope?.mode === 'source' && scope.documentId === sourceDocumentId ? scope : undefined
}

/**
 * This is to write the OLD content of the editor before switching to another tab
 * @param id
 */
const prepareTabSwitch = () => {
  if (commitTimer.value) clearTimeout(commitTimer.value)
  if (tabId.value) {
    const { markdown: newMarkdown, cursor } = getMarkdownAndCursor(editor.value)
    const scope = activeSourceScope()
    if (scope) {
      props.composition.reportSource(scope, { markdown: newMarkdown, cursor })
    }
    tabId.value = null
  }
}

interface FileChangePayloadLike {
  id: string
  markdown?: string
  muyaIndexCursor?: unknown
}

const handleFileChange = (payload: unknown) => {
  if (!(payload as { workspaceRefresh?: boolean })?.workspaceRefresh) return
  const { id, markdown: newMarkdown, muyaIndexCursor } = payload as FileChangePayloadLike
  if (!editor.value) return

  // On same-tab reload (external file change), preserve scroll across
  // setValue. Snapshot every plausible scroll element (the outer
  // .source-code div, CodeMirror's own scroller, and the nearest scrollable
  // ancestor) and restore each, since which one is actually active depends
  // on CodeMirror's height:auto + outer overflow:auto interplay. Re-apply
  // on nextTick and the next animation frame to outlast layout side-effects
  // from sibling handlers: muya editor.vue also listens for file-changed.
  // A cross-tab switch must instead commit the outgoing tab's state; the
  // fresh markdown from disk would otherwise overwrite uncommitted edits.
  const isSameTabReload = tabId.value && tabId.value === id
  const scrollTargets: Array<{ el: HTMLElement; top: number }> = []
  if (isSameTabReload) {
    const seen = new Set<HTMLElement>()
    const consider = (el: HTMLElement | null | undefined) => {
      if (el && !seen.has(el)) {
        seen.add(el)
        scrollTargets.push({ el, top: el.scrollTop })
      }
    }
    consider(sourceCodeContainer.value)
    consider(editor.value.getScrollerElement?.() as HTMLElement | null | undefined)
    let node: HTMLElement | null = sourceCodeContainer.value?.parentElement ?? null
    while (node && node !== document.body) {
      const overflowY = window.getComputedStyle(node).overflowY
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight
      ) {
        consider(node)
        break
      }
      node = node.parentElement
    }
  } else {
    prepareTabSwitch()
    tabId.value = id
    sourceDocumentId = id
  }

  if (typeof newMarkdown === 'string') {
    editor.value.setValue(newMarkdown)
  }

  // t('editor.sourceCode.cursorNullComment')
  if (isValidMuyaIndexCursor(muyaIndexCursor)) {
    const { anchor, focus } = muyaIndexCursor

    editor.value.setSelection(anchor, focus, { scroll: true }) // Scroll the focus into view.
  } else if (scrollTargets.length) {
    const restoreScroll = () => {
      for (const { el, top } of scrollTargets) el.scrollTop = top
    }
    restoreScroll()
    nextTick(restoreScroll)
    requestAnimationFrame(restoreScroll)
  } else {
    setCursorAtFirstLine(editor.value)
  }
}

const handleInvalidateImageCache = () => {
  if (editor.value) {
    editor.value.invalidateImageCache()
  }
}

const handleSelectAll = () => {
  if (!sourceCode.value) {
    return
  }

  if (editor.value && editor.value.hasFocus()) {
    editor.value.execCommand('selectAll')
  } else {
    const activeElement = document.activeElement as HTMLElement | null
    const nodeName = activeElement?.nodeName
    if (nodeName === 'INPUT' || nodeName === 'TEXTAREA') {
      const selectable = activeElement as HTMLInputElement | HTMLTextAreaElement | null
      if (selectable && typeof selectable.select === 'function') {
        selectable.select()
      }
    }
  }
}

const handleUndo = async () => {
  if (!sourceCode.value) {
    return
  }

  if (editor.value) {
    if (await props.composition.sharedSourceHistory('undo')) return
    editor.value.execCommand('undo')
  }
}

const handleRedo = async () => {
  if (!sourceCode.value) {
    return
  }

  if (editor.value) {
    if (await props.composition.sharedSourceHistory('redo')) return
    editor.value.execCommand('redo')
  }
}

interface ImageActionPayload {
  id: string
  result: string
  alt: string
}

const handleImageAction = (payload: unknown) => {
  const { id, result, alt } = payload as ImageActionPayload
  const value: string = editor.value.getValue()
  const focus = editor.value.getCursor('focus')
  const anchor = editor.value.getCursor('anchor')
  const lines: string[] = value.split('\n')
  const index = lines.findIndex((line: string) => line.indexOf(id) > 0)

  if (index > -1) {
    const oldLine = lines[index]
    lines[index] = oldLine.replace(new RegExp(`!\\[${id}\\]\\(.*\\)`), `![${alt}](${result})`)
    const newValue = lines.join('\n')
    editor.value.setValue(newValue)
    const match = /(!\[.*\]\(.*\))/.exec(oldLine)
    if (!match) {
      // t('editor.sourceCode.imageStructureDeletedComment')
      return
    }
    const range = {
      start: match.index,
      end: match.index + match[1].length
    }
    const delta = alt.length + result.length + 5 - match[1].length

    const adjustPointer = (pointer: CMCursor) => {
      if (!pointer) {
        return
      }
      if (pointer.line !== index) {
        return
      }
      if (pointer.ch <= range.start) {
        // do nothing.
      } else if (pointer.ch > range.start && pointer.ch < range.end) {
        pointer.ch = range.start + alt.length + result.length + 5
      } else {
        pointer.ch += delta
      }
    }

    adjustPointer(focus)
    adjustPointer(anchor)
    if (focus && anchor) {
      editor.value.setSelection(anchor, focus, { scroll: true })
    } else {
      setCursorAtFirstLine(editor.value)
    }
  }
}

const saveContent = (cm: CMInstance) => {
  if (receivingSharedDocument) return
  const { markdown: newMarkdown, cursor } = getMarkdownAndCursor(cm)
  // Attention: the cursor may be `{focus: null, anchor: null}` when press `backspace`
  const wordCount = getWordCount(newMarkdown)
  // See "beforeDestroy" note
  if (!viewDestroyed.value) {
    const scope = activeSourceScope()
    if (scope) {
      props.composition.reportSource(scope, {
        markdown: newMarkdown,
        cursor,
        status: { wordCount: wordCount.word }
      })
    }
  }
}

const listenChange = () => {
  editor.value.on('change', (cm: CMInstance) => {
    saveContent(cm)
  })
  editor.value.on('cursorActivity', (cm: CMInstance) => {
    reportCaretPosition(cm, props.caretSession)
    saveContent(cm)
  })
}

// #3580: in Source Code mode the WYSIWYG container is hidden, so the
// `scroll-to-header` bus event (emitted when a TOC entry is clicked) must scroll
// CodeMirror instead. Resolve the TOC entry to its heading line in the source.
const handleScrollToHeader = (slug: unknown) => {
  if (!editor.value) return
  const index = editorStore.listToc.findIndex((item) => item.slug === slug)
  if (index < 0) return
  const line = findMarkdownHeadingLine(editor.value.getValue(), index)
  if (line < 0) return
  // `.source-code` is the scroll container (CodeMirror renders full-height with
  // viewportMargin: Infinity, so its own scroller never scrolls).
  scrollSourceEditorToLine(editor.value, line, sourceCodeContainer.value)
}

onMounted(async () => {
  if (!currentTab.value) return
  const { id } = currentTab.value
  sourceDocumentId = id
  sourceEventScope = await props.composition.scopeForMode('source', sourceScopeAbort.signal)
  if (!sourceEventScope || viewDestroyed.value) return

  const { markdown, muyaIndexCursor, textDirection } = props
  const container = sourceCodeContainer.value
  const codeMirrorConfig: Record<string, unknown> = {
    value: markdown,
    lineNumbers: true,
    autofocus: true,
    lineWrapping: true,
    styleActiveLine: true,
    direction: textDirection,
    viewportMargin: Infinity,
    extraKeys: {
      'Ctrl-Z': handleUndo,
      'Cmd-Z': handleUndo,
      'Ctrl-Y': handleRedo,
      'Ctrl-Shift-Z': handleRedo,
      'Cmd-Shift-Z': handleRedo
    },
    lineNumberFormatter (line: number) {
      if (line % 10 === 0 || line === 1) {
        return line
      } else {
        return ''
      }
    }
  }

  if (railscastsThemes.includes(theme.value)) {
    codeMirrorConfig.theme = 'railscasts'
  } else if (oneDarkThemes.includes(theme.value)) {
    codeMirrorConfig.theme = 'one-dark'
  }

  onFocused('file-loaded', handleFileChange)
  onFocused('invalidate-image-cache', handleInvalidateImageCache)
  onFocused('file-changed', handleFileChange)
  onFocused('selectAll', handleSelectAll)
  onFocused('undo', handleUndo)
  onFocused('redo', handleRedo)
  onFocused('image-action', handleImageAction)
  onFocused('scroll-to-header', handleScrollToHeader)

  // For some reason, code mirror does not seem to play well with Vue's refs if we reference editor.value directly.
  // See https://github.com/codemirror/codemirror5/issues/6886 - hence, we need to use a local variable first.
  const codeMirrorInstance = codeMirror(container, codeMirrorConfig)
  editor.value = codeMirrorInstance
  tabId.value = id
  listenChange()

  // `markdown-math` wraps the standard Markdown mode and delegates `$...$` and
  // `$$...$$` spans to stex so subscript underscores in math do not flip the
  // outer mode into emphasis. See src/renderer/src/codeMirror/markdownMathMode.js.
  codeMirrorInstance.setOption('mode', 'markdown-math')

  codeMirrorInstance.on('contextmenu', (_cm: CMInstance, event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  })

  if (isValidMuyaIndexCursor(muyaIndexCursor)) {
    const { anchor, focus } = muyaIndexCursor
    codeMirrorInstance.setSelection(anchor, focus, { scroll: true })
  } else {
    setCursorAtFirstLine(codeMirrorInstance)
  }

  reportCaretPosition(codeMirrorInstance, props.caretSession)
})

onBeforeUnmount(() => {
  viewDestroyed.value = true
  sourceScopeAbort.abort()
  if (commitTimer.value) clearTimeout(commitTimer.value)

  offFocused('file-loaded')
  offFocused('invalidate-image-cache')
  offFocused('file-changed')
  offFocused('selectAll')
  offFocused('undo')
  offFocused('redo')
  offFocused('image-action')
  offFocused('scroll-to-header')

  const scope = activeSourceScope()
  if (scope && editor.value) {
    const { markdown: newMarkdown, cursor } = getMarkdownAndCursor(editor.value)
    props.composition.reportSource(scope, {
      markdown: newMarkdown,
      cursor,
      status: { wordCount: getWordCount(newMarkdown).word }
    })
    props.composition.handoffSource(scope)
  }
})
</script>

<style>
.source-code {
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
}
.source-code .CodeMirror {
  height: auto;
  max-width: var(--appShellEditorLineWidth);
  margin: var(--appShellEditorTopInset) auto;
  padding-right: var(--appShellPaperMinInlinePadding);
  padding-left: var(--appShellPaperMinInlinePadding);
  box-sizing: border-box;
  background: transparent;
}
.source-code .CodeMirror-gutters {
  border-right: none;
  background-color: transparent;
}
.source-code .CodeMirror-activeline-background,
.source-code .CodeMirror-activeline-gutter {
  background: var(--floatHoverColor);
}
</style>
