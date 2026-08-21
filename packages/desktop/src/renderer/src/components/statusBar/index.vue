<template>
  <div class="app-status-bar">
    <button
      type="button"
      class="sidebar-toggle"
      :title="toggleLabel"
      :aria-label="toggleLabel"
      @click="$emit('toggle-sidebar')"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="sidebarVisible ? 'm10 3-5 5 5 5' : 'm6 3 5 5-5 5'" />
      </svg>
    </button>
    <span class="status-context">{{ context }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  context: string
  sidebarVisible: boolean
  toggleLabel: string
}>()

defineEmits<{
  'toggle-sidebar': []
}>()
</script>

<style scoped>
.app-status-bar {
  display: flex;
  height: var(--appShellStatusBarHeight);
  box-sizing: border-box;
  align-items: center;
  color: var(--appShellFg);
  font-size: 11px;
  background: var(--appShellSidebarBg);
  border-top: 1px solid var(--appShellDivider);
  user-select: none;
}

.sidebar-toggle {
  display: inline-grid;
  width: 34px;
  min-width: 34px;
  height: 100%;
  padding: 0;
  place-items: center;
  color: var(--appShellIcon);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.sidebar-toggle svg {
  display: block;
  width: 16px;
  height: 16px;
}

.sidebar-toggle:hover {
  color: var(--appShellStrongFg);
  background: var(--appShellHoverBg);
}

.sidebar-toggle:focus-visible {
  outline: 1px solid var(--appShellFocus);
  outline-offset: -2px;
}

.status-context {
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  color: var(--appShellMutedFg);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
