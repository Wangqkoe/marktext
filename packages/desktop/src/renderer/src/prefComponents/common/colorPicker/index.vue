<template>
  <section class="pref-color-picker-item">
    <div class="description">
      <span>{{ description }}:</span>
    </div>
    <div class="color-controls">
      <label
        class="color-swatch"
        :style="{ backgroundColor: value }"
        :title="description"
      >
        <input
          type="color"
          :value="value"
          :aria-label="description"
          @input="handleColorInput"
        >
      </label>
      <el-input
        v-model="inputText"
        class="color-value"
        :class="{ error: invalidInput }"
        size="small"
        placeholder="#ffff00 or rgb(255, 255, 0)"
        @input="handleTextInput"
        @blur="restoreValidValue"
        @keyup.enter="restoreValidValue"
      />
      <button
        type="button"
        class="reset-button"
        @click="reset"
      >
        {{ resetLabel }}
      </button>
    </div>
    <div
      class="color-preview"
      :style="{ backgroundColor: value }"
    >
      {{ previewLabel }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  description: string
  value: string
  defaultValue: string
  previewLabel: string
  resetLabel: string
  onChange: (value: string) => void
}>()

const inputText = ref(props.value)
const invalidInput = ref(false)

const normalizeColor = (input: string): string | null => {
  const value = input.trim().toLowerCase()
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (shortHex) {
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) return value

  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(value)
  if (!rgb) return null
  const channels = rgb.slice(1).map(Number)
  if (channels.some((channel) => channel > 255)) return null
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

watch(
  () => props.value,
  (value) => {
    inputText.value = value
    invalidInput.value = false
  }
)

const applyColor = (value: string) => {
  inputText.value = value
  invalidInput.value = false
  props.onChange(value)
}

const handleColorInput = (event: Event) => {
  applyColor((event.target as HTMLInputElement).value.toLowerCase())
}

const handleTextInput = (input: string) => {
  invalidInput.value = normalizeColor(input) === null
}

const restoreValidValue = () => {
  const value = normalizeColor(inputText.value)
  if (value) {
    applyColor(value)
  } else {
    inputText.value = props.value
    invalidInput.value = false
  }
}

const reset = () => applyColor(props.defaultValue)
</script>

<style>
.pref-color-picker-item {
  width: 100%;
  margin: 12px 0;
  color: var(--editorColor);
  font-size: 14px;
  user-select: none;

  & .description {
    margin-bottom: 10px;
  }

  & .color-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  & .color-swatch {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    overflow: hidden;
    border: 1px solid var(--editorColor30);
    border-radius: 4px;
    box-sizing: border-box;
    cursor: pointer;
  }

  & input[type='color'] {
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  & .color-value {
    width: 230px;
  }

  & .color-value .el-input__wrapper {
    background: transparent;
  }

  & .color-value.error input {
    color: #f56c6c;
  }

  & .reset-button {
    height: 30px;
    padding: 0 12px;
    color: var(--buttonFontColor);
    background: var(--buttonBgColor);
    border: var(--buttonBorder);
    border-radius: 4px;
    cursor: pointer;
  }

  & .reset-button:hover {
    color: var(--buttonFontColorHover);
    background: var(--buttonBgColorHover);
    border: var(--buttonBorderHover);
  }

  & .reset-button:focus-visible {
    outline: var(--buttonFocusBorder);
    outline-offset: 1px;
  }

  & .color-preview {
    width: fit-content;
    margin-top: 10px;
    padding: 2px 5px;
    color: #1f2328;
    border-radius: 2px;
  }
}
</style>
