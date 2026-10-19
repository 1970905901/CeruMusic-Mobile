<template>
  <ion-page class="player-page" :class="{ 'background-animated': settings.settings.playerBackgroundAnimation }">
    <ion-content :fullscreen="true" class="player-content">
      <div v-if="track" class="bg-layer" :style="bgStyle" />
      <div class="bg-shade" />
      <div class="player-shell ceru-safe-top">
        <header class="top-bar">
          <button class="round-btn" type="button" aria-label="关闭播放器" @click="closePlayer">
            <ion-icon :icon="chevronDown" />
          </button>
          <div class="top-title">
            <span>正在播放</span>
            <small>{{ sourceLabel }}</small>
          </div>
          <button class="round-btn" type="button" aria-label="更多操作" @click="openMore">
            <ion-icon :icon="ellipsisHorizontal" />
          </button>
        </header>

        <div v-if="!track" class="ceru-empty">
          <ion-icon :icon="musicalNotesOutline" />
          <div class="empty-title">还没有正在播放的歌曲</div>
          <div class="empty-desc">从发现、搜索或音乐库选择一首歌。</div>
          <ion-button @click="$router.replace('/tabs/discover')">去发现音乐</ion-button>
        </div>

        <template v-else>
          <div class="art-wrap" :class="{ compact: showLyrics }">
            <div class="art-shadow" :style="bgStyle" />
            <CoverImage :src="track.artworkUrl" :size="artSize" :radius="26" :alt="track.title" class="main-art" />
          </div>

          <div class="track-head">
            <div class="track-copy">
              <h1 class="track-title">{{ track.title }}</h1>
              <p class="track-artist">
                {{ track.artists.join(' / ') || '未知艺术家' }}
                <span v-if="track.album"> · {{ track.album }}</span>
              </p>
            </div>
            <button class="heart-btn" :class="{ active: favorite }" type="button" :aria-label="favorite ? '取消收藏' : '收藏'" @click="toggleFavorite">
              <ion-icon :icon="favorite ? heart : heartOutline" />
            </button>
          </div>

          <div v-if="player.error" class="play-error">{{ player.error }}</div>

          <div class="timeline">
            <ion-range
              :value="position"
              :min="0"
              :max="duration || 1"
              :step="0.5"
              :disabled="!duration"
              class="seek"
              aria-label="播放进度"
              @ionChange="seekTo($event.detail.value)"
            />
            <div class="times">
              <span>{{ formatTime(position) }}</span>
              <span>-{{ formatTime(Math.max(0, duration - position)) }}</span>
            </div>
          </div>

          <div class="controls">
            <button class="side-btn" :class="{ active: player.shuffle }" type="button" aria-label="随机播放" @click="player.toggleShuffle()">
              <ion-icon :icon="shuffle" />
            </button>
            <button class="skip-btn" type="button" aria-label="上一首" @click="player.previous()">
              <ion-icon :icon="playSkipBack" />
            </button>
            <button class="main-play" type="button" :aria-label="player.isPlaying ? '暂停' : '播放'" @click="player.toggle()">
              <ion-spinner v-if="player.loading" name="crescent" />
              <ion-icon v-else :icon="player.isPlaying ? pause : play" />
            </button>
            <button class="skip-btn" type="button" aria-label="下一首" @click="player.next()">
              <ion-icon :icon="playSkipForward" />
            </button>
            <button class="side-btn" :class="{ active: player.repeat !== 'off' }" type="button" aria-label="循环模式" @click="player.cycleRepeat()">
              <ion-icon :icon="repeat" />
            </button>
          </div>

          <div class="bottom-actions">
            <button type="button" class="action-pill" :class="{ active: showLyrics }" @click="toggleLyrics">
              <ion-icon :icon="textOutline" />
              歌词
            </button>
            <button type="button" class="action-pill" @click="openComments">
              <ion-icon :icon="chatbubbleEllipsesOutline" />
              评论
            </button>
            <button type="button" class="action-pill" @click="openQueue">
              <ion-icon :icon="listOutline" />
              队列
            </button>
            <button type="button" class="action-pill" @click="chooseQuality">
              <ion-icon :icon="optionsOutline" />
              {{ qualityLabel }}
            </button>
            <button type="button" class="action-pill" @click="choosePlaybackRate">
              <ion-icon :icon="speedometerOutline" />
              {{ player.playbackRate }}×
            </button>
            <button type="button" class="action-pill" @click="downloadTrack">
              <ion-icon :icon="cloudDownloadOutline" />
              下载
            </button>
          </div>

          <div v-if="showLyrics" class="lyrics-panel">
            <div v-if="lyricsLoading" class="lyrics-loading">
              <ion-spinner name="crescent" />
              正在读取歌词…
            </div>
            <div v-else-if="lyricsDoc.lines.length" ref="lyricsContainer" class="lyrics-lines" :class="{ 'lyric-animate': settings.settings.lyricAnimate }" :style="{ '--lyric-size': settings.settings.lyricFontSize + 'px' }">
              <p
                v-for="(line, index) in lyricsDoc.lines"
                :key="index"
                class="lyric-line"
                :class="{ active: index === currentLineIndex }"
                @click="seekTo((line.startMs - settings.settings.lyricOffsetMs) / 1000)"
              >
                <span class="lyric-text">{{ line.text }}</span>
                <span v-if="settings.settings.lyricShowTranslation && line.translation" class="lyric-translation">{{ line.translation }}</span>
                <span v-if="settings.settings.lyricShowRomanization && line.romanization" class="lyric-romanization">{{ line.romanization }}</span>
              </p>
            </div>
            <div v-else class="plain-lyrics">{{ lyricsDoc.plainText || '暂无歌词' }}</div>
          </div>
        </template>
      </div>
    </ion-content>

    <ion-modal :is-open="queueOpen" :initial-breakpoint="0.88" :breakpoints="[0, 0.55, 0.88]" @didDismiss="queueOpen = false">
      <ion-content class="queue-content">
        <div class="queue-head ceru-pad">
          <h2>播放队列</h2>
          <span>{{ player.queue.length }} 首</span>
        </div>
        <ion-reorder-group :disabled="false" @ionItemReorder="reorderQueue">
          <div v-for="(item, index) in player.queue" :key="item.key" class="queue-row" :class="{ current: index === player.currentIndex }">
            <button class="queue-main" type="button" @click="playQueueItem(item)">
              <span class="queue-index">{{ index + 1 }}</span>
              <CoverImage :src="item.artworkUrl" :size="42" :radius="10" :alt="item.title" />
              <span class="queue-copy">
                <span class="queue-title ceru-truncate">{{ item.title }}</span>
                <span class="queue-sub ceru-truncate">{{ item.artists.join(' / ') }}</span>
              </span>
            </button>
            <ion-reorder />
          </div>
        </ion-reorder-group>
      </ion-content>
    </ion-modal>

    <TrackCommentsSheet :open="commentsOpen" :track="track" @close="commentsOpen = false" />
  </ion-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  IonButton,
  IonContent,
  IonIcon,
  IonModal,
  IonPage,
  IonRange,
  IonReorder,
  IonReorderGroup,
  IonSpinner,
  actionSheetController,
  toastController,
  useIonRouter
} from '@ionic/vue'
import {
  chatbubbleEllipsesOutline,
  chevronDown,
  cloudDownloadOutline,
  ellipsisHorizontal,
  heart,
  heartOutline,
  headsetOutline,
  listOutline,
  musicalNotesOutline,
  optionsOutline,
  pause,
  play,
  playSkipBack,
  playSkipForward,
  repeat,
  shuffle,
  speedometerOutline,
  textOutline
} from 'ionicons/icons'
import { Clipboard } from '@capacitor/clipboard'
import CoverImage from '@/components/CoverImage.vue'
import TrackCommentsSheet from '@/components/TrackCommentsSheet.vue'
import { usePlayerStore } from '@/stores/player'
import { useLibraryStore } from '@/stores/library'
import { usePluginStore } from '@/stores/plugins'
import { useDownloadStore } from '@/stores/downloads'
import { useShareStore } from '@/stores/share'
import { useSettingsStore } from '@/stores/settings'
import { currentLyricIndex, parseLyrics } from '@/services/lyrics'
import type { LyricDocument } from '@/types/music'
import type { Track } from '@/types/music'

const player = usePlayerStore()
const ionRouter = useIonRouter()
const library = useLibraryStore()
const pluginStore = usePluginStore()
const downloadStore = useDownloadStore()
const shareStore = useShareStore()
const settings = useSettingsStore()

const track = computed(() => player.currentTrack)
const favorite = computed(() => (track.value ? library.isFavorite(track.value) : false))
const position = computed(() => player.positionMs / 1000)
const duration = computed(() => (player.durationMs || track.value?.durationMs || 0) / 1000)
const bgStyle = computed(() => {
  const url = track.value?.artworkUrl || ''
  return { backgroundImage: 'url("' + url + '")' }
})
const sourceLabel = computed(() => {
  if (!track.value) return ''
  if (track.value.localUri) return '本地文件'
  if (track.value.downloadedPath) return '已下载'
  const plugin = pluginStore.plugins.find((item) => item.key === track.value?.pluginKey)
  return plugin?.manifest.name || track.value.subtitle || '插件音源'
})
const qualityLabel = computed(() => settings.settings.preferredQuality || '自动音质')

const showLyrics = ref(false)
const lyricsLoading = ref(false)
const lyricsDoc = ref<LyricDocument>({ lines: [], format: 'plain' })
const lyricsContainer = ref<HTMLElement | null>(null)
const queueOpen = ref(false)
const commentsOpen = ref(false)
const artSize = ref(Math.min(360, Math.max(220, window.innerWidth - 84)))
const lyricCache = new Map<string, LyricDocument>()

const lyricPositionMs = computed(() => player.positionMs + Number(settings.settings.lyricOffsetMs || 0))
const currentLineIndex = computed(() => currentLyricIndex(lyricsDoc.value.lines, lyricPositionMs.value))

function closePlayer() {
  if (window.history.length > 1) {
    window.history.back()
  } else {
    ionRouter.navigate('/tabs/discover', 'back', 'pop')
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const value = Math.floor(seconds)
  const minutes = Math.floor(value / 60)
  const rest = String(value % 60).padStart(2, '0')
  return minutes + ':' + rest
}

function seekTo(value: any) {
  const seconds = Number(value)
  if (Number.isFinite(seconds)) player.seek(seconds * 1000)
}

async function toggleFavorite() {
  if (!track.value) return
  const added = await library.toggleFavorite(track.value)
  await toast(added ? '已收藏' : '已取消收藏')
}

async function loadLyrics() {
  const item = track.value
  if (!item) {
    lyricsDoc.value = { lines: [], format: 'plain' }
    return
  }
  if (item.localUri) {
    const localLyrics = typeof item.raw?.lrc === 'string' ? item.raw.lrc : ''
    lyricsDoc.value = localLyrics
      ? parseLyrics(localLyrics)
      : { lines: [], plainText: '本地文件暂未匹配歌词', format: 'plain' }
    return
  }
  const cached = lyricCache.get(item.key)
  if (cached) {
    lyricsDoc.value = cached
    return
  }
  lyricsLoading.value = true
  try {
    const raw = await pluginStore.lyrics(item)
    const parsed = parseLyrics(raw)
    lyricCache.set(item.key, parsed)
    lyricsDoc.value = parsed
  } catch {
    lyricsDoc.value = { lines: [], plainText: '暂无歌词', format: 'plain' }
  } finally {
    lyricsLoading.value = false
  }
}

function toggleLyrics() {
  showLyrics.value = !showLyrics.value
  if (showLyrics.value) void loadLyrics()
}

async function chooseQuality() {
  if (!track.value) return
  const qualities = track.value.qualities.length ? track.value.qualities : ['自动']
  const sheet = await actionSheetController.create({
    header: '选择音质',
    buttons: [
      ...qualities.map((quality) => ({
        text: quality,
        handler: () => {
          settings.settings.preferredQuality = quality === '自动' ? '' : quality
          if (track.value) void player.playTrack(track.value)
        }
      })),
      {
        text: '自动（最高）',
        handler: () => {
          settings.settings.preferredQuality = ''
          if (track.value) void player.playTrack(track.value)
        }
      },
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function downloadTrack() {
  if (!track.value) return
  try {
    await downloadStore.createDownload(track.value)
    await toast('已加入下载队列')
  } catch (error) {
    await toast(error instanceof Error ? error.message : String(error), 'danger')
  }
}

async function choosePlaybackRate() {
  const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]
  const sheet = await actionSheetController.create({
    header: '播放速度',
    subHeader: `当前 ${player.playbackRate}×`,
    buttons: [
      ...rates.map((rate) => ({
        text: rate === 1 ? '1×（正常）' : `${rate}×`,
        handler: () => player.setPlaybackRate(rate)
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}
async function openComments() {
  commentsOpen.value = true
}

async function openQueue() {
  queueOpen.value = true
}

async function playQueueItem(item: Track) {
  queueOpen.value = false
  await player.playTrack(item)
}

function reorderQueue(event: any) {
  const keys = player.queue.map((item) => item.key)
  const [moved] = keys.splice(event.detail.from, 1)
  keys.splice(event.detail.to, 0, moved)
  player.reorderHostTracks(keys)
  event.detail.complete()
}

async function openMore() {
  if (!track.value) return
  const sheet = await actionSheetController.create({
    header: track.value.title,
    buttons: [
      {
        text: player.sleepRemainingMs ? '关闭睡眠定时' : '15 分钟后暂停',
        handler: () => {
          player.setSleepTimer(player.sleepRemainingMs ? null : 15)
          void toast(player.sleepRemainingMs ? '已关闭睡眠定时' : '将在 15 分钟后暂停')
        }
      },
      {
        text: '查看评论',
        handler: () => openComments()
      },
      {
        text: '分享链接',
        handler: () => {
          if (track.value) shareStore.show(track.value)
        }
      },
      {
        text: '复制歌曲信息',
        handler: () => {
          if (!track.value) return
          void Clipboard.write({
            string:
              track.value.title +
              ' - ' +
              track.value.artists.join(' / ') +
              (track.value.album ? ' (' + track.value.album + ')' : '')
          }).then(() => toast('已复制'))
        }
      },
      {
        text: '一起听',
        handler: () => ionRouter.push('/listen-together')
      },
      {
        text: '查看插件',
        handler: () => {
          if (track.value?.pluginKey) {
            ionRouter.push('/plugin/' + encodeURIComponent(track.value.pluginKey))
          }
        }
      },
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function toast(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 1900, color })
  await element.present()
}

function updateArtSize() {
  artSize.value = Math.min(360, Math.max(220, window.innerWidth - 84))
}

watch(
  () => track.value?.key,
  () => {
    lyricsDoc.value = { lines: [], format: 'plain' }
    if (showLyrics.value) void loadLyrics()
  }
)
let currentTrackCacheKey = ''

watch(currentLineIndex, () => {
  void nextTick(() => {
    const active = lyricsContainer.value?.querySelector('.lyric-line.active')
    active?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
})

onMounted(() => {
  window.addEventListener('resize', updateArtSize)
  if (showLyrics.value) void loadLyrics()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateArtSize)
})
</script>

<style scoped>
.player-page {
  --background: #080b0f;
}
.player-content {
  --background: #080b0f;
  color: #f5f8fb;
}
.bg-layer {
  position: fixed;
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(44px) saturate(140%);
  transform: scale(1.16);
  opacity: 0.32;
  pointer-events: none;
}
.bg-shade {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(circle at 20% 0%, rgba(0, 218, 192, 0.2), transparent 42%),
    linear-gradient(180deg, rgba(8, 11, 15, 0.18), rgba(8, 11, 15, 0.9) 68%, #080b0f 100%);
  pointer-events: none;
}
.player-shell {
  position: relative;
  z-index: 1;
  min-height: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 24px 40px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}
.round-btn {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: #f5f8fb;
  display: grid;
  place-items: center;
  font-size: 22px;
}
.top-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: rgba(245, 248, 251, 0.66);
  letter-spacing: 0.04em;
}
.top-title small {
  font-size: 10px;
  color: rgba(245, 248, 251, 0.42);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.art-wrap {
  position: relative;
  align-self: center;
  margin-top: 28px;
  transition: transform 0.32s ease, opacity 0.32s ease;
}
.art-wrap.compact {
  transform: scale(0.66);
  margin-top: 4px;
  margin-bottom: -14px;
}
.art-shadow {
  position: absolute;
  inset: 12% 8% -6%;
  border-radius: 40px;
  filter: blur(34px);
  opacity: 0.45;
  background-size: cover;
  background-position: center;
}
.main-art {
  position: relative;
  box-shadow: 0 32px 70px rgba(0, 0, 0, 0.48);
}
.track-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 26px;
}
.track-copy {
  min-width: 0;
  flex: 1;
}
.track-title {
  margin: 0;
  font-size: 26px;
  line-height: 1.12;
  letter-spacing: -0.035em;
  font-weight: 800;
  color: #f7fafc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-artist {
  margin: 7px 0 0;
  font-size: 13px;
  color: rgba(245, 248, 251, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.heart-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.07);
  color: rgba(245, 248, 251, 0.72);
  display: grid;
  place-items: center;
  font-size: 23px;
  flex: 0 0 auto;
}
.heart-btn.active {
  color: #00dac0;
  background: rgba(0, 218, 192, 0.12);
  border-color: rgba(0, 218, 192, 0.28);
}
.play-error {
  margin-top: 10px;
  color: #ff8c90;
  font-size: 12px;
  line-height: 1.5;
}
.timeline {
  margin-top: 24px;
}
.seek {
  padding: 0;
  --bar-background: rgba(255, 255, 255, 0.16);
  --bar-background-active: #00dac0;
  --knob-background: #ffffff;
  --knob-size: 14px;
  --height: 28px;
}
.times {
  display: flex;
  justify-content: space-between;
  margin-top: -2px;
  color: rgba(245, 248, 251, 0.48);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
  padding: 0 8px;
}
.side-btn {
  width: 46px;
  height: 46px;
  border: 0;
  background: transparent;
  color: rgba(245, 248, 251, 0.54);
  display: grid;
  place-items: center;
  font-size: 22px;
}
.side-btn.active {
  color: #00dac0;
}
.skip-btn {
  width: 54px;
  height: 54px;
  border: 0;
  background: transparent;
  color: #f5f8fb;
  display: grid;
  place-items: center;
  font-size: 30px;
}
.main-play {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  border: 0;
  background: linear-gradient(145deg, #2affdf, #00b39b);
  color: #032b26;
  display: grid;
  place-items: center;
  font-size: 34px;
  box-shadow: 0 18px 42px rgba(0, 218, 192, 0.25);
}
.main-play ion-spinner {
  color: #032b26;
}
.bottom-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 28px;
}
.action-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.055);
  color: rgba(245, 248, 251, 0.66);
  border-radius: 999px;
  padding: 8px 13px;
  font-size: 12px;
  font-weight: 600;
}
.action-pill.active {
  color: #00dac0;
  border-color: rgba(0, 218, 192, 0.28);
  background: rgba(0, 218, 192, 0.09);
}
.action-pill ion-icon {
  font-size: 16px;
}
.lyric-romanization {
  display: block;
  margin-top: 3px;
  color: var(--ceru-text-secondary);
  font-size: 0.68em;
  font-weight: 500;
}
.lyrics-panel {
  margin-top: 26px;
  padding: 6px 4px 20px;
}
.lyrics-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(245, 248, 251, 0.5);
  font-size: 12px;
  padding: 22px;
}
.lyrics-lines {
  max-height: 36vh;
  overflow-y: auto;
  scrollbar-width: none;
  text-align: center;
  padding: 8px 8px 20px;
}
.lyrics-lines::-webkit-scrollbar {
  display: none;
}
.lyric-line {
  font-size: var(--lyric-size, 22px);
  margin: 0;
  padding: 10px 6px;
  color: rgba(245, 248, 251, 0.28);
  font-size: 16px;
  line-height: 1.45;
  transition: color 0.25s ease, transform 0.25s ease;
}
.lyric-line.active {
  color: #f5f8fb;
  transform: scale(1.035);
  font-weight: 650;
}
.lyric-animate .lyric-line.active .lyric-text {
  display: inline-block;
  animation: lyric-beat 1.8s ease-in-out infinite;
  text-shadow: 0 0 20px rgba(0, 218, 192, 0.36);
}
@keyframes lyric-beat {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.025); }
}
.lyric-text {
  display: block;
}
.lyric-translation {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: rgba(245, 248, 251, 0.42);
}
.plain-lyrics {
  text-align: center;
  white-space: pre-wrap;
  color: rgba(245, 248, 251, 0.58);
  font-size: 14px;
  line-height: 1.7;
  padding: 20px 12px;
}
.queue-content {
  --background: var(--ceru-bg);
}
.queue-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-top: 22px;
  padding-bottom: 10px;
}
.queue-head h2 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -0.02em;
}
.queue-head span {
  font-size: 12px;
  color: var(--ceru-text-secondary);
}
.queue-row {
  display: flex;
  align-items: center;
  padding: 6px 10px 6px 16px;
  border-bottom: 1px solid var(--ceru-border);
}
.queue-row.current {
  background: rgba(0, 179, 155, 0.08);
}
.queue-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--ceru-text);
  text-align: left;
  padding: 4px 0;
}
.queue-index {
  width: 20px;
  font-size: 11px;
  color: var(--ceru-text-secondary);
  font-variant-numeric: tabular-nums;
}
.queue-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.queue-title {
  font-size: 14px;
  font-weight: 600;
}
.queue-sub {
  font-size: 11px;
  color: var(--ceru-text-secondary);
}
.empty-title {
  font-weight: 700;
  color: var(--ceru-text);
}
.empty-desc {
  max-width: 260px;
  line-height: 1.55;
  font-size: 13px;
}
@media (min-width: 700px) {
  .player-shell {
    padding-top: 20px;
  }
  .art-wrap {
    margin-top: 12px;
  }
  .lyrics-lines {
    max-height: 40vh;
  }
}
.background-animated .bg-layer {
  animation: background-breathe 12s ease-in-out infinite alternate;
}
@keyframes background-breathe {
  from { transform: scale(1.05); opacity: 0.42; }
  to { transform: scale(1.16); opacity: 0.62; }
}
</style>
