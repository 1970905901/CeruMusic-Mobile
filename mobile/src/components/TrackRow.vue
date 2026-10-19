<template>
  <div class="track-row ceru-press" @click="$emit('play', track)">
    <CoverImage :src="track.artworkUrl" :size="52" :radius="12" :alt="track.title" />
    <div class="meta">
      <div class="title ceru-truncate">{{ track.title }}</div>
      <div class="sub ceru-truncate">
        {{ track.artists.join(' / ') || track.subtitle || '未知艺术家' }}
        <span v-if="track.album"> · {{ track.album }}</span>
      </div>
    </div>
    <div class="tail">
      <ion-icon v-if="favorite" :icon="heart" class="favorite" />
      <span v-if="duration" class="duration">{{ duration }}</span>
      <button class="more" type="button" aria-label="更多操作" @click.stop="$emit('more', track)">
        <ion-icon :icon="ellipsisHorizontal" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import { ellipsisHorizontal, heart } from 'ionicons/icons'
import CoverImage from './CoverImage.vue'
import type { Track } from '@/types/music'

const props = defineProps<{
  track: Track
  favorite?: boolean
  index?: number
}>()
defineEmits<{
  play: [track: Track]
  more: [track: Track]
}>()

const duration = computed(() => {
  if (!props.track.durationMs) return ''
  const total = Math.round(props.track.durationMs / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
})
</script>

<style scoped>
.track-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  min-height: 68px;
  cursor: pointer;
}
.meta {
  min-width: 0;
  flex: 1;
}
.title {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.tail {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ceru-text-secondary);
}
.duration {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.favorite {
  color: var(--ceru-brand);
  font-size: 16px;
}
.more {
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  padding: 8px;
  display: grid;
  place-items: center;
  font-size: 20px;
}
button {
  -webkit-tap-highlight-color: transparent;
}
</style>
