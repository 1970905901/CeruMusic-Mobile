<template>
  <div
    class="share-card"
    :class="{ clickable: !!view, failed: loadFailed, skeleton: !view && !loadFailed }"
    role="button"
    :tabindex="view ? 0 : -1"
    @click="onClick"
    @keyup.enter="onClick"
  >
    <template v-if="loadFailed">
      <span class="failed-icon">⚠</span>
      <span>分享已失效或被删除</span>
    </template>

    <template v-else-if="!view">
      <div class="skeleton-cover" />
      <div class="skeleton-body">
        <div class="skeleton-line title" />
        <div class="skeleton-line sub" />
      </div>
    </template>

    <template v-else>
      <div class="card-head">
        <CoverImage :src="view.cover" :size="48" :radius="7" :alt="view.title" />
        <div class="card-copy">
          <div class="card-title ceru-truncate">{{ view.title }}</div>
          <div class="card-sub ceru-truncate">{{ view.subtitle }}</div>
          <div class="card-meta ceru-truncate">{{ view.meta }}</div>
        </div>
      </div>
      <div v-if="view.tracks.length" class="card-tracks">
        <div v-for="(track, index) in view.tracks" :key="index" class="card-track">
          <span class="track-index">{{ index + 1 }}.</span>
          <span class="track-name">{{ track.name }}</span>
          <span v-if="track.singer" class="track-singer">— {{ track.singer }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import CoverImage from '@/components/CoverImage.vue'
import {
  chatSharePlaylistView,
  chatShareSongView,
  fetchChatSharePlaylist,
  fetchChatShareSong,
  type ChatShareCardView
} from '@/services/chatShareCards'

const props = defineProps<{
  cardType: string
  cardId: string
}>()

const emit = defineEmits<{ open: [] }>()

/** 加载中 view 为 null：骨架与失效是两种不同状态，不能混用。 */
const view = ref<ChatShareCardView | null>(null)
const loadFailed = ref(false)

function onClick() {
  if (view.value) emit('open')
}

onMounted(async () => {
  if (props.cardType === 'song') {
    const detail = await fetchChatShareSong(props.cardId)
    if (detail) view.value = chatShareSongView(detail)
    else loadFailed.value = true
  } else if (props.cardType === 'playlist') {
    const detail = await fetchChatSharePlaylist(props.cardId)
    if (detail) view.value = chatSharePlaylistView(detail)
    else loadFailed.value = true
  } else {
    loadFailed.value = true
  }
})
</script>

<style scoped>
.share-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 210px;
  max-width: 100%;
  margin-top: 6px;
  padding: 9px;
  border-radius: 11px;
  background: rgba(127, 127, 127, 0.14);
  border: 1px solid var(--ceru-border);
  text-align: left;
}
.share-card.clickable {
  cursor: pointer;
}
.share-card.failed {
  flex-direction: row;
  align-items: center;
  gap: 7px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.failed-icon {
  color: #e37318;
  font-size: 13px;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.card-copy {
  flex: 1;
  min-width: 0;
}
.card-title {
  font-size: 13px;
  font-weight: 650;
}
.card-sub {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.78;
}
.card-meta {
  margin-top: 2px;
  font-size: 10px;
  opacity: 0.55;
}
.card-tracks {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 7px;
  border-top: 1px dashed var(--ceru-border);
  font-size: 11px;
}
.card-track {
  display: flex;
  min-width: 0;
  opacity: 0.8;
}
.track-index {
  flex: 0 0 auto;
  margin-right: 4px;
  opacity: 0.6;
}
.track-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-singer {
  flex: 0 0 auto;
  margin-left: 5px;
  opacity: 0.62;
}
.skeleton-cover {
  width: 48px;
  height: 48px;
  border-radius: 7px;
  background: rgba(127, 127, 127, 0.2);
}
.share-card.skeleton {
  flex-direction: row;
  align-items: center;
  gap: 9px;
}
.skeleton-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.skeleton-line {
  height: 9px;
  border-radius: 5px;
  background: rgba(127, 127, 127, 0.2);
}
.skeleton-line.title {
  width: 70%;
}
.skeleton-line.sub {
  width: 45%;
}
</style>
