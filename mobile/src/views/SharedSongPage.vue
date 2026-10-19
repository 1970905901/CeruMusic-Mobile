<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/discover" text="" />
        </ion-buttons>
        <ion-title>分享歌曲</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="shared-content">
      <div v-if="loading" class="state-box">
        <ion-spinner name="crescent" />
        <span>正在打开分享…</span>
      </div>

      <div v-else-if="error" class="state-box error">
        <ion-icon :icon="alertCircleOutline" />
        <h2>无法打开分享</h2>
        <p>{{ error }}</p>
        <ion-button fill="outline" @click="load">重试</ion-button>
      </div>

      <template v-else-if="detail">
        <div class="hero ceru-pad">
          <CoverImage :src="detail.song.img" :size="176" :radius="24" :alt="detail.song.name" class="hero-cover" />
          <p class="eyebrow">SHARED BY {{ detail.username || '音乐同好' }}</p>
          <h1>{{ detail.song.name }}</h1>
          <p class="singers">{{ detail.song.singer }}</p>
          <p class="meta">
            <span v-if="detail.song.albumName">{{ detail.song.albumName }} · </span>
            有效期至 {{ formatDate(detail.expiresAt) }}
            <span v-if="detail.quality"> · {{ detail.quality }}</span>
          </p>
          <div class="actions">
            <ion-button :disabled="playing" @click="play">
              <ion-spinner v-if="playing" name="crescent" />
              <template v-else>
                <ion-icon slot="start" :icon="playIcon" />
                播放
              </template>
            </ion-button>
            <ion-button fill="outline" @click="toggleFavorite">
              <ion-icon slot="start" :icon="favorite ? heart : heartOutline" />
              {{ favorite ? '已收藏' : '收藏' }}
            </ion-button>
          </div>
          <p v-if="playNotice" class="play-notice">{{ playNotice }}</p>
        </div>

        <div v-if="detail.lyric?.lrc" class="section ceru-pad">
          <button type="button" class="section-toggle" @click="lyricsOpen = !lyricsOpen">
            <span>歌词</span>
            <ion-icon :icon="lyricsOpen ? chevronUpOutline : chevronDownOutline" />
          </button>
          <pre v-if="lyricsOpen" class="lyric">{{ detail.lyric.lrc }}</pre>
        </div>

        <div class="section ceru-pad">
          <h2>热门评论 <span v-if="detail.hotComments?.length">{{ detail.hotComments.length }}</span></h2>
          <div v-if="detail.hotComments?.length" class="comments">
            <article v-for="(comment, index) in detail.hotComments" :key="index" class="comment">
              <CoverImage :src="comment.avatar || ''" :size="36" :radius="18" round :alt="comment.userName" />
              <div class="comment-main">
                <div class="comment-meta">
                  <strong>{{ comment.userName }}</strong>
                  <span v-if="comment.timeStr">{{ comment.timeStr }}</span>
                  <span v-if="comment.location">{{ comment.location }}</span>
                </div>
                <p>{{ comment.text }}</p>
                <small v-if="comment.likedCount">♡ {{ comment.likedCount }}</small>
              </div>
            </article>
          </div>
          <p v-else class="empty-comments">分享中没有评论。</p>
        </div>
        <div class="bottom-safe" />
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  toastController
} from '@ionic/vue'
import {
  alertCircleOutline,
  chevronDownOutline,
  chevronUpOutline,
  heart,
  heartOutline,
  play as playIcon
} from 'ionicons/icons'
import CoverImage from '@/components/CoverImage.vue'
import { useLibraryStore } from '@/stores/library'
import { usePluginStore } from '@/stores/plugins'
import { usePlayerStore } from '@/stores/player'
import shareApi, { type ShareDetail } from '@/services/shareApi'
import type { Track } from '@/types/music'
import type { ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'

const route = useRoute()
const pluginStore = usePluginStore()
const library = useLibraryStore()
const player = usePlayerStore()
const id = computed(() => String(route.params.id || ''))
const detail = ref<ShareDetail | null>(null)
const loading = ref(false)
const error = ref('')
const playing = ref(false)
const playNotice = ref('')
const lyricsOpen = ref(false)
const directTrack = ref<Track | null>(null)

const favorite = computed(() => {
  const item = directTrack.value || buildPluginTrack()
  return item ? library.isFavorite(item) : false
})

function durationMs(interval?: string): number | undefined {
  if (!interval) return undefined
  const parts = interval.split(':').map(Number)
  if (!parts.length || parts.some((value) => !Number.isFinite(value))) return undefined
  return Math.round(parts.reduce((total, value) => total * 60 + value, 0) * 1000)
}

function artistsOf(value: unknown): string[] {
  return String(value || '')
    .split(/[、,/]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildDirectTrack(): Track | null {
  if (!detail.value) return null
  const song = detail.value.song
  return {
    key: 'share:' + detail.value.id,
    ref: { providerId: song.source || 'share', kind: 'track', id: String(song.songmid) },
    title: song.name || '分享歌曲',
    artists: artistsOf(song.singer),
    album: song.albumName,
    durationMs: durationMs(song.interval),
    artworkUrl: song.img,
    qualities: [],
    playable: true,
    raw: { ...song },
    localUri: detail.value.audioUrl,
    source: 'local'
  }
}

function buildPluginTrack(): Track | null {
  if (!detail.value) return null
  const song = detail.value.song
  const provider = pluginStore.providers.find((item) => item.providerId === song.source)
  if (!provider) return null
  const ref: ResourceRef = song.pluginResource?.kind === 'track'
    ? (song.pluginResource as ResourceRef)
    : { providerId: song.source, kind: 'track', id: String(song.songmid), scope: 'provider' }
  return {
    key: provider.pluginKey + ':' + ref.providerId + ':' + ref.id,
    pluginKey: provider.pluginKey,
    ref,
    title: song.name || '分享歌曲',
    artists: artistsOf(song.singer),
    album: song.albumName,
    durationMs: durationMs(song.interval),
    artworkUrl: song.img,
    qualities: provider.qualities,
    playable: true,
    raw: { ...song, ref },
    source: 'plugin'
  }
}

function formatDate(value: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

async function load() {
  if (!id.value) {
    error.value = '分享链接缺少 ID'
    return
  }
  loading.value = true
  error.value = ''
  try {
    detail.value = await shareApi.getById(id.value)
    directTrack.value = buildDirectTrack()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '分享不存在或已过期'
  } finally {
    loading.value = false
  }
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

async function play() {
  if (playing.value || !detail.value) return
  playing.value = true
  playNotice.value = ''
  try {
    const pluginTrack = buildPluginTrack()
    if (pluginTrack) {
      try {
        await player.playTrack(pluginTrack)
        directTrack.value = pluginTrack
        return
      } catch (cause) {
        playNotice.value =
          '插件解析失败，已改用分享代理播放：' +
          (cause instanceof Error ? cause.message : String(cause))
      }
    } else {
      playNotice.value = '未安装对应音源插件，正在使用分享代理播放；安装插件后可完整播放与下载。'
    }
    const fallback = buildDirectTrack()
    if (!fallback) throw new Error('分享中没有可播放的音频')
    await player.playTrack(fallback)
    directTrack.value = fallback
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '播放失败', 'danger')
  } finally {
    playing.value = false
  }
}

async function toggleFavorite() {
  const item = directTrack.value || buildPluginTrack() || buildDirectTrack()
  if (!item) return
  const added = await library.toggleFavorite(item)
  directTrack.value = item
  await toast(added ? '已收藏' : '已取消收藏')
}

watch(id, load, { immediate: true })
</script>
<style scoped>
.shared-content {
  --background: var(--ceru-bg);
}
.state-box {
  min-height: 70vh;
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
  font-size: 48px;
}
.state-box h2 {
  margin: 0;
  color: var(--ceru-text);
}
.state-box p {
  max-width: 320px;
  margin: 0;
  line-height: 1.6;
}
.hero {
  padding-top: 114px;
  text-align: center;
}
.hero-cover {
  margin: 0 auto;
  box-shadow: var(--ceru-shadow);
}
.eyebrow {
  margin: 22px 0 7px;
  color: var(--ceru-brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
}
h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -0.035em;
}
.singers {
  margin: 8px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 14px;
}
.meta {
  margin: 8px 0 0;
  color: var(--ceru-text-secondary);
  font-size: 11px;
}
.actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}
.play-notice {
  max-width: 420px;
  margin: 12px auto 0;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.section {
  max-width: 760px;
  margin: 24px auto 0;
}
.section h2 {
  margin: 0 0 12px;
  font-size: 18px;
}
.section h2 span {
  color: var(--ceru-text-secondary);
  font-weight: 500;
}
.section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 0;
  border: 0;
  border-top: 1px solid var(--ceru-border);
  border-bottom: 1px solid var(--ceru-border);
  background: transparent;
  color: var(--ceru-text);
  font-size: 16px;
  font-weight: 700;
}
.lyric {
  margin: 0;
  max-height: 360px;
  overflow: auto;
  padding: 14px 0;
  color: var(--ceru-text-secondary);
  font-family: var(--ion-font-family);
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
}
.comments {
  display: flex;
  flex-direction: column;
}
.comment {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 0;
  border-bottom: 1px solid var(--ceru-border);
}
.comment-main {
  min-width: 0;
  flex: 1;
}
.comment-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 11px;
  color: var(--ceru-text-secondary);
}
.comment-meta strong {
  color: var(--ceru-text);
  font-size: 13px;
}
.comment-main p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.comment-main small {
  display: block;
  margin-top: 5px;
  color: var(--ceru-text-secondary);
  font-size: 10px;
}
.empty-comments {
  color: var(--ceru-text-secondary);
  font-size: 13px;
}
.bottom-safe {
  height: calc(40px + env(safe-area-inset-bottom));
}
</style>
