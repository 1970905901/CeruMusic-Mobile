<template>
  <div v-if="pluginProgressState.items.length" class="plugin-progress-host" aria-live="polite">
    <div v-for="item in pluginProgressState.items" :key="item.id" class="plugin-progress-card">
      <div class="plugin-progress-head">
        <span class="plugin-progress-title">{{ item.title }}</span>
        <button type="button" aria-label="关闭进度" @click="dismissPluginProgress(item.id)">×</button>
      </div>
      <p v-if="item.message" class="plugin-progress-message">{{ item.message }}</p>
      <div class="plugin-progress-track">
        <span :style="{ width: item.value === null ? '28%' : `${Math.round(item.value * 100)}%` }" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { pluginProgressState, dismissPluginProgress } from '@/services/pluginProgress'
</script>
<style scoped>
.plugin-progress-host {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: calc(72px + env(safe-area-inset-bottom));
  z-index: 120;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.plugin-progress-card {
  pointer-events: auto;
  max-width: 620px;
  margin: 0 auto;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--ceru-border);
  border-radius: 14px;
  background: var(--ceru-bg-soft);
  color: var(--ceru-text);
  box-shadow: var(--ceru-shadow);
  backdrop-filter: var(--ceru-blur);
  -webkit-backdrop-filter: var(--ceru-blur);
}
.plugin-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.plugin-progress-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
}
.plugin-progress-head button {
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  font-size: 20px;
  line-height: 1;
  padding: 0 2px;
}
.plugin-progress-message {
  margin: 5px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.45;
}
.plugin-progress-track {
  height: 3px;
  margin-top: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--ceru-border);
}
.plugin-progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ceru-brand);
  transition: width 0.25s ease;
}
html.md .plugin-progress-host {
  bottom: calc(82px + env(safe-area-inset-bottom));
}
</style>