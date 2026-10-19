<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/discover" text="" />
        </ion-buttons>
        <ion-title>分享歌单</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="loading && !tracks.length" class="state-box">
        <ion-spinner name="crescent" />
        <span>正在打开歌单分享…</span>
      </div>

      <div v-else-if="error && !tracks.length" class="state-box error">
        <ion-icon :icon="alertCircleOutline" />
        <h2>无法打开歌单分享</h2>
        <p>{{ error }}</p>
        <ion-button fill="outline" @click="load(true)">重试</ion-button>
      </div>

      <template v-else-if="detail">
        <div class="hero ceru-pad">
          <CoverImage
            :src="detail.playlist.cover"
            :size="168"
            :radius="22"
            :alt="detail.playlist.name"
            class="hero-cover"
          />
          <div class="hero-copy">
            <p class="eyebrow">PLAYLIST SHARE</p>
            <h1 class="hero-title">{{ detail.playlist.name }}</h1>
            <p v-if="detail.playlist.describe" class="hero-desc">{{ detail.playlist.describe }}</p>
            <p class="hero-meta">
              {{ detail.playlist.total || tracks.length }} 首 · {{ detail.username || '分享者' }}
            </p>
            <p v-if="!detail.canPlay" class="notice">
              分享已关闭在线播放，仍可导入到本地歌单；安装对应音源插件后可播放。
            </p>
            <p v-else-if="detail.playExpiresAt" class="notice">
              在线播放有效期至 {{ formatDate(detail.playExpiresAt) }}
            </p>
            <div class="hero-actions">
              <ion-button :disabled="!playableTracks.length" @click="playAll">
                <ion-icon slot="start" :icon="playIcon" />
                播放全部
              </ion-button>
              <ion-button fill="outline" :disabled="importing" @click="importPlaylist">
                <ion-icon slot="start" :icon="albumsOutline" />
                {{ importing ? '导入中…' : '导入歌单' }}
              </ion-button>
            </div>
          </div>
        </div>

        <p v-if="error" class="page-error">{{ error }}</p>

        <div v-if="tracks.length" class="list-block">
          <TrackRow
            v-for="track in tracks"
            :key="track.key"
            :track="track"
            @play="playTrack(track)"
            @more="openTrackActions(track)"
          />
        </div>

        <ion-infinite-scroll :disabled="!hasMore || loading || loadingMore" @ionInfinite="loadMore">
          <ion-infinite-scroll-content loading-spinner="crescent" loading-text="加载更多…" />
        </ion-infinite-scroll>

        <div v-if="!tracks.length" class="state-box">
          <ion-icon :icon="albumsOutline" />
          <p>这个歌单分享没有歌曲。</p>
        </div>
      </template>

      <div class="bottom-space" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  toastController
} from '@ionic/vue'
import {
  albumsOutline,
  alertCircleOutline,
  cloudDownloadOutline,
  play as playIcon
} from 'ionicons/icons'
import { useRoute } from 'vue-router'
import CoverImage from '@/components/CoverImage.vue'
import TrackRow from '@/components/TrackRow.vue'
import shareApi, { type PlaylistShareDetail } from '@/services/shareApi'
import {
  sharedPlaylistNextPos,
  sharedPlaylistTracks
} from '@/services/sharedPlaylist'
import { openTrackActions } from '@/services/trackActions'
import { useLibraryStore } from '@/stores/library'
import { usePlayerStore } from '@/stores/player'
import { usePluginStore } from '@/stores/plugins'
import type { Track } from '@/types/music'

const PAGE_SIZE = 50
const route = useRoute()
const id = computed(() => String(route.params.id || ''))
const library = useLibraryStore()
const player = usePlayerStore()
const pluginStore = usePluginStore()

const detail = ref<PlaylistShareDetail | null>(null)
const tracks = ref<Track[]>([])
const nextPos = ref<number | undefined>(undefined)
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const importing = ref(false)
const error = ref('')

const playableTracks = computed(() => tracks.value.filter((track) => track.playable))

function formatDate(value: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2600, color })
  await element.present()
}

async function load(reset: boolean) {
  if (!id.value) {
    error.value = '歌单分享缺少 ID'
    return
  }
  if (reset) {
    if (loading.value) return
    loading.value = true
    error.value = ''
    detail.value = null
    tracks.value = []
    nextPos.value = undefined
    hasMore.value = true
  } else {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true
  }
  try {
    const page = await shareApi.getPlaylistById(id.value, PAGE_SIZE, nextPos.value)
    if (!page?.playlist) throw new Error('歌单分享不存在')
    detail.value = page
    const mapped = sharedPlaylistTracks(page.playlist.songs ?? [], {
      providers: pluginStore.providers,
      shareId: id.value
    })
    if (reset) tracks.value = mapped
    else tracks.value = [...tracks.value, ...mapped]
    const cursor = sharedPlaylistNextPos(page.playlist.songs ?? [])
    nextPos.value = cursor
    const total = Number(page.playlist.total || tracks.value.length)
    hasMore.value = (page.playlist.songs ?? []).length > 0 && tracks.value.length < total
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '歌单分享不存在或已过期'
    if (reset) tracks.value = []
    hasMore.value = false
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function loadMore(event: any) {
  try {
    await load(false)
  } finally {
    event.target.complete()
  }
}

async function playAll() {
  if (!playableTracks.value.length) return
  try {
    await player.playTrack(playableTracks.value[0], playableTracks.value)
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '播放失败', 'danger')
  }
}

async function playTrack(track: Track) {
  if (!track.playable) {
    await toast('未安装对应音源插件，无法播放这首歌', 'danger')
    return
  }
  try {
    await player.playTrack(track, playableTracks.value)
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '播放失败', 'danger')
  }
}

async function importPlaylist() {
  if (!detail.value || importing.value) return
  importing.value = true
  try {
    const playlist = library.createPlaylist(
      detail.value.playlist.name || '分享歌单',
      detail.value.playlist.describe || ''
    )
    for (const track of tracks.value) {
      library.upsertTrack(track)
      if (!playlist.trackKeys.includes(track.key)) playlist.trackKeys.push(track.key)
    }
    playlist.updatedAt = Date.now()
    await toast(`已导入到“${playlist.name}”`, 'success')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '导入失败', 'danger')
  } finally {
    importing.value = false
  }
}

watch(id, () => void load(true), { immediate: true })
</script>

<style scoped>
.state-box {
  min-height: 62vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 30px;
  text-align: center;
  color: var(--ceru-text-secondary);
  font-size: 13px;
}
.state-box ion-icon {
  color: var(--ceru-danger);
  font-size: 44px;
}
.state-box h2 {
  margin: 0;
  color: var(--ceru-text);
}
.state-box p {
  max-width: 320px;
  line-height: 1.6;
}
.hero {
  display: flex;
  gap: 18px;
  align-items: flex-end;
  padding-top: 18px;
}
.hero-cover {
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18);
  flex: 0 0 auto;
}
.hero-copy {
  min-width: 0;
  flex: 1;
}
.eyebrow {
  margin: 0 0 6px;
  color: var(--ceru-brand);
  font-size: 10px;
  letter-spacing: 0.13em;
  font-weight: 700;
}
.hero-title {
  margin: 0;
  font-size: 26px;
  line-height: 1.08;
  letter-spacing: -0.035em;
  font-weight: 800;
}
.hero-desc {
  margin: 8px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hero-meta {
  margin: 8px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.notice {
  margin: 8px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.hero-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.page-error {
  margin: 12px 16px 0;
  color: var(--ceru-danger);
  font-size: 12px;
}
.list-block {
  margin: 18px 8px 0;
}
.bottom-space {
  height: 120px;
}
@media (max-width: 420px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }
  .hero-cover {
    align-self: center;
  }
  .hero-copy {
    width: 100%;
  }
}
</style>
