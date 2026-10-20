<template>
  <div
    class="track-row ceru-press"
    :class="{ selectable, selected }"
    @click="selectable ? $emit('toggleSelect', track) : $emit('play', track)"
  >
    <div v-if="selectable" class="checkbox-container">
      <ion-icon
        :icon="selected ? checkmarkCircle : ellipseOutline"
        class="select-icon"
        :class="{ checked: selected }"
      />
    </div>
    <CoverImage :src="track.artworkUrl" :size="52" :radius="12" :alt="track.title" />
    <div class="meta">
      <div class="title ceru-truncate">{{ track.title }}</div>
      <div class="sub ceru-truncate">
        {{ track.artists.join(' / ') || track.subtitle || '未知艺术家' }}
        <span v-if="track.album"> · {{ track.album }}</span>
      </div>
    </div>
    <div class="tail">
      <ion-icon v-if="favorite && !selectable" :icon="heart" class="favorite" />
      <span v-if="duration" class="duration">{{ duration }}</span>
      <button
        v-if="!selectable"
        class="more"
        type="button"
        aria-label="更多操作"
        @click.stop="$emit('more', track)"
      >
        <ion-icon :icon="ellipsisHorizontal" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import { checkmarkCircle, ellipseOutline, ellipsisHorizontal, heart } from 'ionicons/icons'
import CoverImage from './CoverImage.vue'
import type { Track } from '@/types/music'

const props = defineProps<{
  track: Track
  favorite?: boolean
  index?: number
  selectable?: boolean
  selected?: boolean
}>()
defineEmits<{
  play: [track: Track]
  more: [track: Track]
  toggleSelect: [track: Track]
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
.checkbox-container {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: var(--ceru-text-secondary);
  flex-shrink: 0;
}
.select-icon.checked {
  color: var(--ceru-brand);
}
.track-row.selectable {
  user-select: none;
}
.track-row.selected {
  background: var(--ceru-card-active, rgba(120, 120, 128, 0.08));
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
