<template>
  <div v-if="open" class="batch-bar-backdrop">
    <div class="batch-bar-container ceru-card">
      <button
        type="button"
        class="batch-action-btn ceru-press"
        :disabled="selectedCount === 0"
        @click="$emit('play')"
      >
        <ion-icon :icon="playIcon" />
        <span>播放</span>
      </button>
      <button
        type="button"
        class="batch-action-btn ceru-press"
        :disabled="selectedCount === 0"
        @click="$emit('playNext')"
      >
        <ion-icon :icon="playSkipForwardOutline" />
        <span>下一首</span>
      </button>
      <!-- 桌面版本地音乐页「添加全部到播放列表」：批量排到队尾，而不是只加下一首 -->
      <button
        type="button"
        class="batch-action-btn ceru-press"
        :disabled="selectedCount === 0"
        @click="$emit('appendToQueue')"
      >
        <ion-icon :icon="listOutline" />
        <span>加入队列</span>
      </button>
      <button
        type="button"
        class="batch-action-btn ceru-press"
        :disabled="selectedCount === 0"
        @click="$emit('addToPlaylist')"
      >
        <ion-icon :icon="addCircleOutline" />
        <span>加歌单</span>
      </button>
      <button
        type="button"
        class="batch-action-btn ceru-press"
        :disabled="selectedCount === 0"
        @click="$emit('download')"
      >
        <ion-icon :icon="cloudDownloadOutline" />
        <span>下载</span>
      </button>
      <button
        v-if="destructiveLabel"
        type="button"
        class="batch-action-btn danger ceru-press"
        :disabled="selectedCount === 0"
        @click="$emit('destructive')"
      >
        <ion-icon :icon="destructiveIcon || trashOutline" />
        <span>{{ destructiveLabel }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import {
  addCircleOutline,
  cloudDownloadOutline,
  listOutline,
  play as playIcon,
  playSkipForwardOutline,
  trashOutline
} from 'ionicons/icons'

defineProps<{
  open: boolean
  selectedCount: number
  destructiveLabel?: string
  destructiveIcon?: string
}>()

defineEmits<{
  play: []
  playNext: []
  appendToQueue: []
  addToPlaylist: []
  download: []
  destructive: []
}>()
</script>

<style scoped>
.batch-bar-backdrop {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--ceru-mini-player-height, 64px) + var(--ion-safe-area-bottom, 16px) + 12px);
  display: flex;
  justify-content: center;
  padding: 0 16px;
  z-index: 99;
  pointer-events: none;
  animation: batchSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes batchSlideUp {
  from {
    transform: translateY(24px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
.batch-bar-container {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--ceru-card-bg, rgba(30, 30, 35, 0.92));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--ceru-border, rgba(255, 255, 255, 0.12));
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
  max-width: 440px;
  width: 100%;
  justify-content: space-around;
}
.batch-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: var(--ceru-text);
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 12px;
  transition: opacity 0.15s ease, transform 0.15s ease;
  min-width: 52px;
}
.batch-action-btn ion-icon {
  font-size: 20px;
  color: var(--ceru-brand);
}
.batch-action-btn.danger ion-icon {
  color: var(--ion-color-danger, #eb445a);
}
.batch-action-btn:disabled {
  opacity: 0.38;
  pointer-events: none;
}
</style>
