<template>
  <div class="mini ceru-glass" role="button" tabindex="0" @click="ionRouter.push('/player')" @keyup.enter="ionRouter.push('/player')">
    <div class="progress-track">
      <div class="progress-fill" :style="{ width: `${Math.round(player.progress * 100)}%` }" />
    </div>
    <div class="body">
      <CoverImage :src="track?.artworkUrl" :size="42" :radius="10" :alt="track?.title" />
      <div class="meta">
        <div class="title ceru-truncate">{{ track?.title || '未播放' }}</div>
        <div class="sub ceru-truncate">{{ track?.artists.join(' / ') || '未知艺术家' }}</div>
      </div>
      <div class="actions" @click.stop>
        <button type="button" class="icon-btn" :aria-label="player.isPlaying ? '暂停' : '播放'" @click="player.toggle()">
          <ion-icon :icon="player.isPlaying ? pause : play" />
        </button>
        <button type="button" class="icon-btn" aria-label="下一首" @click="player.next()">
          <ion-icon :icon="playSkipForward" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonIcon, useIonRouter } from '@ionic/vue'
import { pause, play, playSkipForward } from 'ionicons/icons'
import CoverImage from './CoverImage.vue'
import { usePlayerStore } from '@/stores/player'

const player = usePlayerStore()
const ionRouter = useIonRouter()
const track = computed(() => player.currentTrack)
</script>

<style scoped>
.mini {
  width: 100%;
  border: 1px solid var(--ceru-border);
  border-radius: 18px;
  overflow: hidden;
  color: var(--ceru-text);
  text-align: left;
  padding: 0;
  box-shadow: var(--ceru-shadow);
}
.progress-track {
  height: 2px;
  background: rgba(127, 127, 127, 0.18);
}
.progress-fill {
  height: 100%;
  background: var(--ceru-brand);
  transition: width 0.2s linear;
}
.body {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
}
.meta {
  min-width: 0;
  flex: 1;
}
.title {
  font-size: 14px;
  font-weight: 650;
}
.sub {
  font-size: 11px;
  color: var(--ceru-text-secondary);
  margin-top: 2px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.icon-btn {
  width: 38px;
  height: 38px;
  border: 0;
  background: transparent;
  color: var(--ceru-text);
  display: grid;
  place-items: center;
  font-size: 22px;
}
</style>
