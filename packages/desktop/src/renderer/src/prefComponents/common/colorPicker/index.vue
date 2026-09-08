<template>
  <section ref="pickerRoot" class="pref-color-picker-item">
    <div class="description"><span>{{ description }}:</span></div>
    <div class="color-controls">
      <button type="button" class="color-swatch" :style="{ backgroundColor: color }" :aria-label="description" :aria-expanded="pickerOpen" @click="pickerOpen = !pickerOpen" />
      <input v-model="inputText" type="text" class="color-value" :class="{ error: invalidInput }" :aria-label="`${description} HEX`" maxlength="18" spellcheck="false" @input="validateOuterInput" @blur="commitOuterInput" @keyup.enter="commitOuterInput">
      <button type="button" class="icon-button reset-button" :aria-label="resetLabel" :title="resetLabel" @click="setColor(defaultValue)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 8.2A8 8 0 1 1 4 14" /><path d="M4.8 8.2V3.8M4.8 8.2h4.4" /></svg>
      </button>
      <button type="button" class="icon-button random-button" :aria-label="randomLabel" :title="randomLabel" @click="chooseRandomColor">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="9" cy="9" r="0.8" /><circle cx="15" cy="9" r="0.8" /><circle cx="9" cy="15" r="0.8" /><circle cx="15" cy="15" r="0.8" /></svg>
      </button>
    </div>
    <div class="color-preview" :style="{ backgroundColor: color }">{{ previewLabel }}</div>

    <div v-if="pickerOpen" class="color-popover">
      <div ref="svField" class="sv-field" :style="{ '--picker-hue': hue }" role="slider" aria-label="Saturation and brightness" :aria-valuetext="`${Math.round(saturation)}%, ${Math.round(brightness)}%`" tabindex="0" @pointerdown="beginDrag($event, 'sv')">
        <span class="sv-marker" :style="{ left: `clamp(7px, ${saturation}%, calc(100% - 7px))`, top: `clamp(7px, ${100 - brightness}%, calc(100% - 7px))` }" />
      </div>
      <div class="tone-row">
        <button type="button" class="icon-button eyedropper-button" :disabled="!eyeDropperSupported" :aria-label="eyeDropperLabel" :title="eyeDropperSupported ? eyeDropperLabel : eyeDropperUnavailableLabel" @click="pickScreenColor">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4M5 19l3.2-.7L18.6 7.9a2.1 2.1 0 0 0-3-3L5.7 15.4 5 19Z" /><path d="m8.2 15.8-2-2" /></svg>
        </button>
        <div ref="hueField" class="hue-field" role="slider" aria-label="Hue" :aria-valuenow="Math.round(hue)" aria-valuemin="0" aria-valuemax="360" tabindex="0" @pointerdown="beginDrag($event, 'hue')">
          <span class="hue-marker" :style="{ left: `clamp(8px, ${(hue / 360) * 100}%, calc(100% - 8px))`, backgroundColor: `hsl(${hue} 100% 50%)` }" />
        </div>
      </div>
      <div class="swatch-row">
        <div class="current-wrap"><div class="current-swatch" :style="{ backgroundColor: color }" :title="currentLabel" /></div>
        <button v-for="index in 8" :key="index" type="button" class="history-swatch" :class="{ empty: !history[index - 1] }" :style="history[index - 1] ? { backgroundColor: history[index - 1] } : undefined" :disabled="!history[index - 1]" :aria-label="`${recentLabel} ${index}${history[index - 1] ? `: ${history[index - 1]}` : ''}`" @click="selectHistory(index - 1)" />
      </div>
      <div class="swatch-captions"><span>{{ currentLabel }}</span><span>{{ recentLabel }}</span></div>
      <div class="input-row">
        <div class="mode-tabs" role="tablist" aria-label="Color value format">
          <button type="button" class="mode-button" :class="{ active: inputMode === 'rgb' }" role="tab" :aria-selected="inputMode === 'rgb'" @click="inputMode = 'rgb'">RGB</button>
          <button type="button" class="mode-button" :class="{ active: inputMode === 'hex' }" role="tab" :aria-selected="inputMode === 'hex'" @click="inputMode = 'hex'">HEX</button>
        </div>
        <div v-if="inputMode === 'rgb'" class="values rgb-values">
          <label v-for="(channel, index) in rgb" :key="index" class="channel"><span>{{ ['R', 'G', 'B'][index] }}</span><input :value="channel" type="number" min="0" max="255" @change="setRgbChannel(index, $event)"></label>
        </div>
        <div v-else class="values hex-values"><input v-model="popoverHex" maxlength="7" aria-label="HEX color value" @input="validatePopoverHex" @blur="restorePopoverHex" @keyup.enter="restorePopoverHex"></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  description: string
  value: string
  defaultValue: string
  previewLabel: string
  resetLabel: string
  randomLabel: string
  eyeDropperLabel: string
  eyeDropperUnavailableLabel: string
  currentLabel: string
  recentLabel: string
  onChange: (value: string) => void
}>()

type InputMode = 'rgb' | 'hex'
type DragTarget = 'sv' | 'hue'
type EyeDropperConstructor = new () => { open: () => Promise<{ sRGBHex: string }> }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const rgbToHex = (channels: number[]) => `#${channels.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
const hexToRgb = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
const normalizeColor = (input: string): string | null => {
  const value = input.trim().toLowerCase()
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (shortHex) return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toUpperCase()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase()
  const match = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(value)
  if (!match) return null
  const channels = match.slice(1).map(Number)
  return channels.some(channel => channel > 255) ? null : rgbToHex(channels)
}
const hsvToRgb = (h: number, s: number, v: number) => {
  const normalizedHue = ((h % 360) + 360) % 360
  const normalizedSaturation = s / 100
  const normalizedValue = v / 100
  const chroma = normalizedValue * normalizedSaturation
  const x = chroma * (1 - Math.abs((normalizedHue / 60) % 2 - 1))
  const match = normalizedValue - chroma
  const parts = normalizedHue < 60 ? [chroma, x, 0] : normalizedHue < 120 ? [x, chroma, 0] : normalizedHue < 180 ? [0, chroma, x] : normalizedHue < 240 ? [0, x, chroma] : normalizedHue < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return parts.map(channel => (channel + match) * 255)
}
const rgbToHsv = ([red, green, blue]: number[]) => {
  const [r, g, b] = [red / 255, green / 255, blue / 255]
  const maximum = Math.max(r, g, b)
  const minimum = Math.min(r, g, b)
  const delta = maximum - minimum
  let calculatedHue = 0
  if (delta) calculatedHue = maximum === r ? 60 * (((g - b) / delta) % 6) : maximum === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4)
  return [((calculatedHue + 360) % 360), maximum ? delta / maximum * 100 : 0, maximum * 100]
}

const initialColor = normalizeColor(props.value) ?? '#FFFF00'
const color = ref(initialColor)
const [initialHue, initialSaturation, initialBrightness] = rgbToHsv(hexToRgb(initialColor))
const hue = ref(initialHue)
const saturation = ref(initialSaturation)
const brightness = ref(initialBrightness)
const history = ref<string[]>([])
const pickerOpen = ref(false)
const inputMode = ref<InputMode>('rgb')
const inputText = ref(initialColor)
const popoverHex = ref(initialColor)
const invalidInput = ref(false)
const pickerRoot = ref<HTMLElement>()
const svField = ref<HTMLElement>()
const hueField = ref<HTMLElement>()
const rgb = computed(() => hexToRgb(color.value))
const eyeDropperSupported = typeof window !== 'undefined' && 'EyeDropper' in window

const syncColorState = (nextColor: string) => {
  color.value = nextColor
  inputText.value = nextColor
  popoverHex.value = nextColor
  invalidInput.value = false
  const [nextHue, nextSaturation, nextBrightness] = rgbToHsv(hexToRgb(nextColor))
  if (nextSaturation > 0) hue.value = nextHue
  saturation.value = nextSaturation
  brightness.value = nextBrightness
}
const recordHistory = (previous: string, current: string) => {
  if (previous !== current) history.value = [previous, ...history.value.filter(item => item !== previous && item !== current)].slice(0, 8)
}
const setColor = (input: string, options: { emit?: boolean, record?: boolean } = {}) => {
  const nextColor = normalizeColor(input)
  if (!nextColor) return false
  const previous = color.value
  syncColorState(nextColor)
  if (options.record !== false) recordHistory(previous, nextColor)
  if (options.emit !== false && previous !== nextColor) props.onChange(nextColor.toLowerCase())
  return true
}
const setColorFromHsv = () => {
  const nextColor = rgbToHex(hsvToRgb(hue.value, saturation.value, brightness.value))
  const previous = color.value
  color.value = nextColor
  inputText.value = nextColor
  popoverHex.value = nextColor
  invalidInput.value = false
  if (previous !== nextColor) props.onChange(nextColor.toLowerCase())
}

watch(() => props.value, value => {
  const nextColor = normalizeColor(value)
  if (nextColor && nextColor !== color.value) syncColorState(nextColor)
})

const validateOuterInput = () => { inputText.value = inputText.value.toUpperCase(); invalidInput.value = normalizeColor(inputText.value) === null }
const commitOuterInput = () => { if (!setColor(inputText.value)) syncColorState(color.value) }
const validatePopoverHex = () => { popoverHex.value = popoverHex.value.toUpperCase(); if (/^#[0-9A-F]{6}$/.test(popoverHex.value)) setColor(popoverHex.value) }
const restorePopoverHex = () => { if (!setColor(popoverHex.value)) popoverHex.value = color.value }
const chooseRandomColor = () => setColor(`#${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0')}`)
const selectHistory = (index: number) => { const selected = history.value[index]; if (selected) setColor(selected) }
const setRgbChannel = (index: number, event: Event) => { const channels = [...rgb.value]; channels[index] = clamp(Number((event.target as HTMLInputElement).value) || 0, 0, 255); setColor(rgbToHex(channels)) }

const updateFromPointer = (event: PointerEvent, target: DragTarget) => {
  const element = target === 'sv' ? svField.value : hueField.value
  if (!element) return
  const bounds = element.getBoundingClientRect()
  const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
  if (target === 'sv') {
    saturation.value = x * 100
    brightness.value = (1 - clamp((event.clientY - bounds.top) / bounds.height, 0, 1)) * 100
  } else hue.value = x * 360
  setColorFromHsv()
}
const beginDrag = (event: PointerEvent, target: DragTarget) => {
  const element = event.currentTarget as HTMLElement
  const previous = color.value
  element.setPointerCapture(event.pointerId)
  updateFromPointer(event, target)
  const move = (moveEvent: PointerEvent) => updateFromPointer(moveEvent, target)
  const end = (upEvent: PointerEvent) => {
    updateFromPointer(upEvent, target)
    recordHistory(previous, color.value)
    element.removeEventListener('pointermove', move)
    element.removeEventListener('pointerup', end)
    element.removeEventListener('pointercancel', end)
  }
  element.addEventListener('pointermove', move)
  element.addEventListener('pointerup', end)
  element.addEventListener('pointercancel', end)
}
const pickScreenColor = async () => {
  if (!eyeDropperSupported) return
  const EyeDropper = (window as unknown as { EyeDropper: EyeDropperConstructor }).EyeDropper
  try { setColor((await new EyeDropper().open()).sRGBHex) } catch (error) { if (!(error instanceof DOMException) || error.name !== 'AbortError') console.error(error) }
}
const closeFromOutside = (event: PointerEvent) => { if (!pickerRoot.value?.contains(event.target as Node)) pickerOpen.value = false }
const closeFromEscape = (event: KeyboardEvent) => {
  if (pickerOpen.value && event.key === 'Escape') { pickerOpen.value = false; nextTick(() => pickerRoot.value?.querySelector<HTMLButtonElement>('.color-swatch')?.focus()) }
}
onMounted(() => { document.addEventListener('pointerdown', closeFromOutside); document.addEventListener('keydown', closeFromEscape) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', closeFromOutside); document.removeEventListener('keydown', closeFromEscape) })
</script>

<style>
.pref-color-picker-item {
  position: relative; width: 100%; margin: 12px 0; color: var(--editorColor); font-size: 14px; user-select: none;
  & .description { margin-bottom: 10px; }
  & .color-controls { display: flex; align-items: center; gap: 8px; }
  & button, & input { font: inherit; }
  & .color-swatch, & .icon-button { width: 32px; height: 32px; padding: 0; display: grid; flex: 0 0 32px; place-items: center; color: var(--buttonFontColor); background-color: var(--buttonBgColor); border: var(--buttonBorder); border-radius: 4px; box-sizing: border-box; cursor: pointer; }
  & .icon-button:hover { color: var(--buttonFontColorHover); background: var(--buttonBgColorHover); border: var(--buttonBorderHover); }
  & .icon-button:disabled { cursor: not-allowed; opacity: 0.45; }
  & .icon-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  & .random-button circle { fill: currentColor; stroke: none; }
  & .color-swatch:focus-visible, & .icon-button:focus-visible, & .mode-button:focus-visible, & .history-swatch:focus-visible { outline: var(--buttonFocusBorder); outline-offset: 1px; }
  & .color-value { width: 100px; height: 32px; padding: 0 9px; color: var(--editorColor); text-transform: uppercase; background: transparent; border: 1px solid var(--editorColor30); border-radius: 4px; box-shadow: none; box-sizing: border-box; outline: none; }
  & .color-value:focus { border-color: var(--themeColor); }
  & .color-value.error { color: #f56c6c; border-color: #f56c6c; }
  & .color-preview { width: fit-content; margin-top: 10px; padding: 2px 5px; color: #1f2328; border-radius: 2px; }
  & .color-popover { position: absolute; z-index: 10; top: 72px; left: 0; width: 358px; padding: 14px; background: var(--floatBgColor, var(--editorBgColor)); border: 1px solid var(--editorColor30); border-radius: 10px; box-shadow: 0 9px 25px rgb(0 0 0 / 13%); box-sizing: border-box; }
  & .sv-field { position: relative; height: 190px; overflow: hidden; border-radius: 7px; background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(var(--picker-hue) 100% 50%)); cursor: crosshair; touch-action: none; }
  & .sv-marker { position: absolute; width: 14px; height: 14px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgb(0 0 0 / 35%); transform: translate(-50%, -50%); pointer-events: none; box-sizing: border-box; }
  & .tone-row { display: grid; grid-template-columns: 32px 1fr; gap: 12px; align-items: start; margin-top: 13px; }
  & .hue-field { position: relative; height: 18px; margin-top: 7px; border-radius: 999px; background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); cursor: pointer; touch-action: none; }
  & .hue-marker { position: absolute; top: 50%; width: 16px; height: 16px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgb(0 0 0 / 30%); transform: translate(-50%, -50%); pointer-events: none; box-sizing: border-box; }
  & .sv-field:focus-visible, & .hue-field:focus-visible { outline: var(--buttonFocusBorder); outline-offset: 2px; }
  & .swatch-row { width: 100%; display: grid; grid-template-columns: 32px repeat(8, 1fr); gap: 8px; align-items: center; margin-top: 9px; }
  & .current-wrap { width: 32px; display: grid; place-items: center; }
  & .current-swatch, & .history-swatch { width: 24px; height: 24px; border: 1px solid var(--editorColor30); border-radius: 4px; box-sizing: border-box; }
  & .history-swatch { justify-self: center; padding: 0; cursor: pointer; }
  & .history-swatch.empty { background: var(--buttonBgColor); cursor: default; opacity: 0.6; }
  & .history-swatch:not(.empty):hover { border-color: var(--editorColor); }
  & .swatch-captions { display: grid; grid-template-columns: 32px 1fr; gap: 12px; margin-top: 4px; color: var(--editorColor50); font-size: 10px; text-align: center; }
  & .input-row { width: 100%; min-height: 32px; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
  & .mode-tabs { flex: 0 0 auto; display: flex; gap: 3px; }
  & .mode-button { padding: 4px 8px; color: var(--editorColor50); background: transparent; border: 0; border-radius: 4px; cursor: pointer; }
  & .mode-button.active { color: var(--editorColor); background: var(--buttonBgColorHover); font-weight: 600; }
  & .values { flex: 1 1 auto; display: flex; justify-content: flex-end; gap: 6px; }
  & .channel { display: flex; align-items: center; gap: 4px; color: var(--editorColor50); font-size: 11px; }
  & .channel input, & .hex-values input { height: 28px; padding: 0 4px; color: var(--editorColor); text-align: center; background: transparent; border: 1px solid var(--editorColor30); border-radius: 4px; box-sizing: border-box; outline: none; }
  & .channel input { width: 48px; }
  & .hex-values input { width: 100px; text-transform: uppercase; }
  & .channel input:focus, & .hex-values input:focus { border-color: var(--themeColor); }
}
</style>
