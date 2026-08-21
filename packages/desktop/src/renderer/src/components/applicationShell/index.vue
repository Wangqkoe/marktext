<template>
  <section
    class="application-shell"
    :class="{ 'without-in-app-title': !showTitleBar }"
  >
    <header
      v-if="showTitleBar"
      class="application-shell-title"
    >
      <slot name="title" />
    </header>
    <div class="application-shell-sidebar">
      <slot name="sidebar" />
    </div>
    <main class="application-shell-workspace">
      <slot />
    </main>
    <footer class="application-shell-status">
      <slot name="status" />
    </footer>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  showTitleBar: boolean
}>()
</script>

<style scoped>
.application-shell {
  position: absolute;
  inset: 0;
  display: grid;
  width: 100vw;
  height: 100vh;
  grid-template-rows:
    var(--appShellTitleBarHeight) var(--appShellTabBarHeight) minmax(0, 1fr)
    var(--appShellStatusBarHeight);
  grid-template-columns: auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--appShellEditorBg);
}

.application-shell.without-in-app-title {
  grid-template-rows: 0 var(--appShellTabBarHeight) minmax(0, 1fr) var(--appShellStatusBarHeight);
}

.application-shell-title {
  min-width: 0;
  grid-column: 1 / 3;
  grid-row: 1;
}

.application-shell-sidebar {
  min-width: 0;
  min-height: 0;
  grid-column: 1;
  grid-row: 2 / 4;
}

.application-shell-workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  grid-column: 2;
  grid-row: 2 / 4;
  overflow: hidden;
}

.application-shell-status {
  min-width: 0;
  grid-column: 1 / 3;
  grid-row: 4;
}
</style>
