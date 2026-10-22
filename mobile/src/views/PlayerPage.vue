<template>
  <ion-page
    class="player-page"
    :class="[`bg-renderer-${backgroundRenderer}`, { 'background-animated': settings.settings.playerBackgroundAnimation && !isAppBackground }]"
  >
    <ion-content :fullscreen="true" class="player-content" @click.capture="controlsIdle.poke()" @scroll="controlsIdle.poke()">
      <div ref="backgroundHost" class="bg-beat-host">
        <div v-if="track" class="bg-layer" :style="bgStyle" />
        <div v-if="track && gradientBackground" class="bg-gradient" :style="{ backgroundImage: gradientBackground }" />
      </div>
      <div class="bg-shade" />
      <LtDanmakuLayer v-if="track" />
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
          <div
            class="art-wrap"
            :class="{ compact: showLyrics, vinyl: settings.settings.playerLayout === 'cd' }"
            :style="{ '--art-size': artSize + 'px' }"
          >
            <div class="art-shadow" :style="bgStyle" />
            <template v-if="settings.settings.playerLayout === 'cd'">
              <div class="tonearm" :class="{ playing: player.isPlaying }" />
              <div class="vinyl-disc" :class="{ spinning: player.isPlaying }">
                <div class="vinyl-grooves" />
                <div class="vinyl-label">
                  <CoverImage :src="track.artworkUrl" :size="Math.round(artSize * 0.44)" round :alt="track.title" />
                  <div class="label-shine" />
                </div>
                <div class="vinyl-hole" />
              </div>
            </template>
            <CoverImage
              v-else
              :src="track.artworkUrl"
              :size="artSize"
              :radius="26"
              :alt="track.title"
              class="main-art"
            />
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

          <AudioVisualizer
            v-if="settings.settings.audioVisualizer && player.isPlaying && !isAppBackground"
            class="player-visualizer"
            :height="52"
            :bar-count="48"
            :color="lyricAccent"
          />

          <div v-if="player.error" class="play-error">{{ player.error }}</div>

          <div class="timeline">
            <div class="seek-host">
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
              <!-- 无感过渡：预告区间与淡入区间标记（桌面 PlayMusic.vue 的进度条标记） -->
              <div class="seek-marks" aria-hidden="true">
                <div
                  v-if="crossfadeMarkVisible"
                  class="crossfade-mark"
                  :style="{ left: crossfadeMarkLeft + '%', width: crossfadeMarkWidth + '%' }"
                />
                <div
                  v-if="crossfadeFadeInMarkVisible"
                  class="crossfade-fadein-mark"
                  :style="{ width: crossfadeFadeInMarkWidth + '%' }"
                />
              </div>
            </div>
            <div class="times">
              <span>{{ formatTime(position) }}</span>
              <span>-{{ formatTime(Math.max(0, duration - position)) }}</span>
            </div>
          </div>

          <div class="controls" :class="{ 'chrome-idle': chromeHidden }">
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

          <div class="bottom-actions" :class="{ 'chrome-idle': chromeHidden }">
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
            <button v-if="canChooseQuality" type="button" class="action-pill" @click="chooseQuality">
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

          <PluginSlot slot="player.actions" class="player-plugin-slot" />

          <div v-if="showLyrics" class="lyrics-panel">
            <div v-if="displayLyrics.lines.length || displayLyrics.plainText" class="lyrics-head">
              <div class="lyrics-head-left">
                <span>歌词</span>
                <button
                  v-if="currentTrackOffset !== 0"
                  type="button"
                  class="offset-badge"
                  aria-label="查看时间轴偏移"
                  @click="lyricOffsetOpen = true"
                >
                  {{ currentTrackOffset > 0 ? '+' : '' }}{{ (currentTrackOffset / 1000).toFixed(1) }}s
                </button>
              </div>
              <div class="lyrics-head-actions">
                <button class="lyric-btn" type="button" aria-label="调整歌词时间" @click="lyricOffsetOpen = true">
                  <ion-icon :icon="timeOutline" />
                  微调
                </button>
                <button class="lyric-btn" type="button" aria-label="分享复制歌词" @click="lyricShareOpen = true">
                  <ion-icon :icon="copyOutline" />
                  分享
                </button>
                <button v-if="lyricConverters.length" class="lyric-btn" type="button" aria-label="导出歌词" @click="lyricConverterOpen = true">
                  <ion-icon :icon="downloadOutline" />
                  导出
                </button>
              </div>
            </div>
            <div v-if="lyricsLoading" class="lyrics-loading">
              <ion-spinner name="crescent" />
              正在读取歌词…
            </div>
            <div
              v-else-if="displayLyrics.lines.length"
              ref="lyricsContainer"
              class="lyrics-lines"
              :class="{
                'lyric-animate': settings.settings.lyricAnimate,
                'lyric-jump': settings.settings.lyricJump,
                'lyric-apple': settings.settings.lyricAppleStyle
              }"
              :style="{
                '--lyric-size':
                  Math.round(settings.settings.lyricFontSize * settings.settings.lyricFontScale) + 'px',
                '--lyric-weight': String(settings.settings.lyricFontWeight),
                '--lyric-accent': lyricAccent
              }"
            >
              <p
                v-for="(line, index) in displayLyrics.lines"
                :key="index"
                class="lyric-line"
                :class="{ active: index === currentLineIndex }"
                :style="lyricLineStyle(index)"
                @click="seekTo((line.startMs - settings.settings.lyricOffsetMs - currentTrackOffset) / 1000)"
              >
                <span class="lyric-text">{{ line.text }}</span>
                <span v-if="settings.settings.lyricShowTranslation && line.translation" class="lyric-translation">{{ line.translation }}</span>
                <span v-if="settings.settings.lyricShowRomanization && line.romanization" class="lyric-romanization">{{ line.romanization }}</span>
              </p>
            </div>
            <div v-else class="plain-lyrics">
              <template v-if="lyricError">
                <span>{{ lyricError }}</span>
                <button class="lyric-retry" type="button" @click="retryLyrics">重试</button>
              </template>
              <template v-else>{{ displayLyrics.plainText || '暂无歌词' }}</template>
            </div>
          </div>
        </template>
      </div>
    </ion-content>

    <ion-modal :is-open="queueOpen" :initial-breakpoint="0.88" :breakpoints="[0, 0.55, 0.88]" @didDismiss="queueOpen = false">
      <ion-content ref="queueContentRef" class="queue-content">
        <input
          ref="queueFileInput"
          type="file"
          accept=".cmpl,.cpl,application/octet-stream"
          class="queue-file-input"
          @change="onQueueFile"
        />
        <div class="queue-head ceru-pad">
          <h2>播放队列</h2>
          <div class="queue-head-actions">
            <span>{{ player.queue.length }} 首</span>
            <!-- 对齐桌面版「播放列表管理」：当前播放队列可以导出/导入为歌单文件 -->
            <button
              v-if="player.queue.length"
              class="queue-action"
              type="button"
              :disabled="queueFileBusy"
              @click="exportQueueFile"
            >
              <ion-icon :icon="shareOutline" />
              导出
            </button>
            <button
              class="queue-action"
              type="button"
              :disabled="queueFileBusy"
              @click="pickQueueFile"
            >
              <ion-icon :icon="folderOpenOutline" />
              导入
            </button>
            <!-- 桌面版队列底部有「定位当前播放」；长队列里靠手滑找正在播的那行很难 -->
            <button
              v-if="player.currentIndex >= 0"
              class="queue-action"
              type="button"
              @click="locateCurrentInQueue"
            >
              <ion-icon :icon="locateOutline" />
              定位
            </button>
            <button v-if="player.queue.length" class="queue-clear" type="button" @click="clearQueue">
              <ion-icon :icon="trashOutline" />
              清空
            </button>
          </div>
        </div>
        <!-- 一起听房间内没有控制权时，改队列只会被服务端覆盖回去；
             桌面端同样在这种情况下禁用拖拽与移除（`lt.isInRoom && !lt.canControl`）。 -->
        <p v-if="roomReadOnly" class="queue-room-notice">
          一起听房间内由房主 / 管理员控制播放队列，你的改动不会生效。
        </p>
        <ion-reorder-group :disabled="roomReadOnly" @ionItemReorder="reorderQueue">
          <div v-for="(item, index) in player.queue" :key="item.key" class="queue-row" :class="{ current: index === player.currentIndex }">
            <button class="queue-main" type="button" @click="playQueueItem(item)">
              <span class="queue-index">{{ index + 1 }}</span>
              <CoverImage :src="item.artworkUrl" :size="42" :radius="10" :alt="item.title" />
              <span class="queue-copy">
                <span class="queue-title ceru-truncate">{{ item.title }}</span>
                <span class="queue-sub ceru-truncate">{{ item.artists.join(' / ') }}</span>
              </span>
            </button>
            <button
              v-if="!roomReadOnly"
              class="queue-remove"
              type="button"
              :aria-label="`移除 ${item.title}`"
              @click="removeQueueItem(item)"
            >
              <ion-icon :icon="closeCircle" />
            </button>
            <ion-reorder v-if="!roomReadOnly" />
          </div>
        </ion-reorder-group>
      </ion-content>
    </ion-modal>

    <TrackCommentsSheet :open="commentsOpen" :track="track" @close="commentsOpen = false" />
    <!-- 无感过渡进行中的提示（桌面 CrossfadeHint.vue） -->
    <transition name="crossfade-hint">
      <div v-if="crossfadeState.active" class="crossfade-hint">
        <div class="cf-wave">
          <span v-for="bar in 4" :key="bar" :style="{ animationDelay: `${(bar - 1) * 0.12}s` }" />
        </div>
        <span class="cf-text">正在平滑过渡</span>
      </div>
    </transition>
    <LyricConverterSheet
      :open="lyricConverterOpen"
      :track="track"
      :document="displayLyrics"
      @close="lyricConverterOpen = false"
    />
    <LyricShareSheet
      :open="lyricShareOpen"
      :track="track"
      :document="displayLyrics"
      @close="lyricShareOpen = false"
    />
    <LyricOffsetSheet
      :open="lyricOffsetOpen"
      :track="track"
      @close="lyricOffsetOpen = false"
    />
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
  alertController,
  toastController,
  useIonRouter
} from '@ionic/vue'
import {
  chatbubbleEllipsesOutline,
  copyOutline,
  timeOutline,
  chevronDown,
  closeCircle,
  cloudDownloadOutline,
  ellipsisHorizontal,
  folderOpenOutline,
  heart,
  heartOutline,
  headsetOutline,
  listOutline,
  locateOutline,
  musicalNotesOutline,
  downloadOutline,
  optionsOutline,
  pause,
  play,
  playSkipBack,
  playSkipForward,
  repeat,
  shareOutline,
  shuffle,
  speedometerOutline,
  textOutline,
  trashOutline
} from 'ionicons/icons'
import { Clipboard } from '@capacitor/clipboard'
import CoverImage from '@/components/CoverImage.vue'
import { planPlayerEntry } from '@/services/playerEntry'
import LtDanmakuLayer from '@/components/LtDanmakuLayer.vue'
import AudioVisualizer from '@/components/AudioVisualizer.vue'
import TrackCommentsSheet from '@/components/TrackCommentsSheet.vue'
import LyricConverterSheet from '@/components/LyricConverterSheet.vue'
import PluginSlot from '@/components/PluginSlot.vue'
import { usePlayerStore } from '@/stores/player'
import { useLibraryStore } from '@/stores/library'
import { usePluginStore } from '@/stores/plugins'
import { useListenTogetherStore } from '@/stores/listenTogether'
import { useDownloadStore } from '@/stores/downloads'
import { useShareStore } from '@/stores/share'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useLyricExtrasStore } from '@/stores/lyricExtras'
import { currentLyricIndex, parseLyrics } from '@/services/lyrics'
import { getLyricCache, putLyricCache } from '@/services/lyricProvider'
import {
  encryptPlaylistTracks,
  exportableTracks,
  packPlaylistFile,
  parsePlaylistFile,
  playlistFileName,
  playlistFileTracks
} from '@/services/playlistFiles'
import { saveAndShareFile } from '@/services/fileExport'
import { filterLyricDocument } from '@/services/lyricInfoFilter'
import { publishCurrentLyrics } from '@/services/lyricsBridge'
import { createIdleControls } from '@/services/idleControls'
import { lyricJumpStyle } from '@/services/lyricJump'
import {
  SEEK_STAGGER_WINDOW_MS,
  isSeekJump,
  seekStaggerDelayMs
} from '@/services/lyricSeekStagger'
import { collectLyricConverters } from '@/services/lyricConverters'
import { karaokeMaskStyle } from '@/services/lyricKaraoke'
import { backgroundSupportsBeat } from '@/services/backgroundRenderers'
import { backgroundBeatStyle, createBackgroundBeatSmoother } from '@/services/backgroundBeat'
import { fourColorGradientBackground } from '@/services/backgroundGradient'
import { extractDominantColors, extractLightMainColor, type RgbColor } from '@/services/coverColor'
import { startLowFreqSampler } from '@/services/audioVisualizer'
import { useAppBackground } from '@/services/appVisibility'
import { crossfadeState } from '@/services/crossfade'
import { getQualityDisplayName } from '@/services/qualityNames'
import { createRequestGuard } from '@/services/requestGuard'
import type { LyricDocument } from '@/types/music'
import type { Track } from '@/types/music'

const player = usePlayerStore()
const listenTogether = useListenTogetherStore()
/**
 * 一起听房间内且没有控制权时，队列是只读的。
 *
 * 房间里的队列由服务端广播、房主/管理员改动；普通成员本地拖动或移除
 * 会在下一次 `queue:update` 时被覆盖回去，表现为「拖了一下又弹回」。
 * 桌面端 `PlaylistDrawer` 在这种情况直接禁用拖拽与移除。
 */
const roomReadOnly = computed(
  () => listenTogether.inRoom && !listenTogether.canControl
)
const ionRouter = useIonRouter()
const library = useLibraryStore()
const pluginStore = usePluginStore()
const downloadStore = useDownloadStore()
const shareStore = useShareStore()
const auth = useAuthStore()
const settings = useSettingsStore()
const lyricExtras = useLyricExtrasStore()

const track = computed(() => player.currentTrack)
const favorite = computed(() => (track.value ? library.isFavorite(track.value) : false))
const position = computed(() => player.positionMs / 1000)
const duration = computed(() => (player.durationMs || track.value?.durationMs || 0) / 1000)
const bgStyle = computed(() => {
  const url = track.value?.artworkUrl || ''
  return { backgroundImage: 'url("' + url + '")' }
})
const backgroundRenderer = computed(() => settings.settings.playerBackgroundRenderer)
/**
 * 桌面端 `useAppBackground` 的移动端用法：切后台时停止高开销渲染。
 * 音频继续播放（后台播放依赖系统媒体服务），这里只暂停视觉层。
 */
const { isAppBackground } = useAppBackground()
/** Desktop parity: only 网格渐变 consumes the low-frequency beat. */
const beatEnabled = computed(
  () => settings.settings.playerBackgroundBeat && backgroundSupportsBeat(backgroundRenderer.value)
)
const sourceLabel = computed(() => {
  if (!track.value) return ''
  if (track.value.localUri) return '本地文件'
  if (track.value.downloadedPath) return '已下载'
  const plugin = pluginStore.plugins.find((item) => item.key === track.value?.pluginKey)
  return plugin?.manifest.name || track.value.subtitle || '插件音源'
})
/** 桌面 moreMenu 的「音质 · 显示名」等价；未指定时显示自动。 */
const qualityLabel = computed(() =>
  settings.settings.preferredQuality ? getQualityDisplayName(settings.settings.preferredQuality) : '自动音质'
)
/**
 * 桌面 canSwitchQuality：本地曲目与直链没有可切换的服务端音质。
 * Web 平台的本地文件走相对路径字段（见 store 的 prepareSource），因此一并判断。
 */
const canChooseQuality = computed(() => {
  const item = track.value
  if (!item) return false
  return !(
    item.localUri ||
    item.localPath ||
    item.localRelativePath ||
    item.downloadedPath ||
    item.downloadedRelativePath
  )
})

const showLyrics = ref(false)
const lyricsLoading = ref(false)
const lyricsDoc = ref<LyricDocument>({ lines: [], format: 'plain' })
const lyricsContainer = ref<HTMLElement | null>(null)
const lyricConverterOpen = ref(false)
const lyricShareOpen = ref(false)
const lyricOffsetOpen = ref(false)
const currentTrackOffset = computed(() => lyricExtras.getOffset(track.value?.key))
const lyricConverters = computed(() =>
  collectLyricConverters(pluginStore.enabledPlugins, {
    runtimeInfo: pluginStore.runtimeInfo
  })
)
const queueOpen = ref(false)
const queueContentRef = ref<any>(null)
const queueFileInput = ref<HTMLInputElement | null>(null)
/** 队列文件导入/导出进行中，避免重复点击触发两次。 */
const queueFileBusy = ref(false)
const commentsOpen = ref(false)
const artSize = ref(Math.min(window.innerWidth < 900 ? 320 : 360, Math.max(220, window.innerWidth - 84)))
const lyricCache = new Map<string, LyricDocument>()
/** 歌词加载失败/为空时的提示文案；空字符串表示没有错误。 */
const lyricError = ref('')
/**
 * 歌词请求守卫：换歌后旧响应可能晚于新请求返回，若直接写入会覆盖当前歌曲的歌词。
 * 命中缓存或本地歌词是同步分支，不参与竞态。
 */
const lyricRequests = createRequestGuard()

const displayLyrics = computed(() =>
  filterLyricDocument(lyricsDoc.value, {
    filterInfo: settings.settings.lyricFilterInfo,
    strict: settings.settings.lyricStrictFilter
  })
)
const lyricPositionMs = computed(() => player.positionMs + Number(settings.settings.lyricOffsetMs || 0) + currentTrackOffset.value)
const currentLineIndex = computed(() => currentLyricIndex(displayLyrics.value.lines, lyricPositionMs.value))

const DEFAULT_LYRIC_ACCENT = 'rgba(255, 255, 255, 0.9)'
const coverAccent = ref(DEFAULT_LYRIC_ACCENT)
const coverAccentSource = ref('')
const gradientColors = ref<RgbColor[]>([])
const gradientSource = ref('')

watch(
  () => track.value?.artworkUrl || '',
  async (src) => {
    coverAccentSource.value = src
    gradientSource.value = src
    // 四色渐变 needs the same artwork sample as the accent, so one pass fills both.
    const [accent, colors] = await Promise.all([
      src ? extractLightMainColor(src) : Promise.resolve(DEFAULT_LYRIC_ACCENT),
      src ? extractDominantColors(src, 4) : Promise.resolve([])
    ])
    if (coverAccentSource.value === src) coverAccent.value = accent
    if (gradientSource.value === src) gradientColors.value = colors
  },
  { immediate: true }
)

/** Desktop 四色渐变 renderer: only the gradient layer is used, no cover pattern. */
const gradientBackground = computed(() =>
  backgroundRenderer.value === 'isolation'
    ? fourColorGradientBackground(gradientColors.value)
    : ''
)

const lyricAccent = computed(() =>
  settings.settings.lyricImmersiveColor ? coverAccent.value : 'rgba(255, 255, 255, 1)'
)

/**
 * 无感过渡的进度条标记（对齐桌面 PlayMusic.vue）：
 * 预告区间标出“可能发生过渡”的尾段，淡入区间标出交接后新歌开头的淡化段。
 * 桌面端在 DLNA 播放时不显示，移动端没有该路径，因此仅需时长可用。
 */
const crossfadeMarkVisible = computed(
  () => crossfadeState.markEnd > crossfadeState.markStart && duration.value > 0
)
const crossfadeMarkLeft = computed(() =>
  crossfadeMarkVisible.value ? (crossfadeState.markStart / duration.value) * 100 : 0
)
const crossfadeMarkWidth = computed(() =>
  crossfadeMarkVisible.value
    ? ((crossfadeState.markEnd - crossfadeState.markStart) / duration.value) * 100
    : 0
)
const crossfadeFadeInMarkVisible = computed(
  () => crossfadeState.fadeInMarkEnd > 0 && duration.value > 0
)
const crossfadeFadeInMarkWidth = computed(() =>
  crossfadeFadeInMarkVisible.value
    ? (crossfadeState.fadeInMarkEnd / duration.value) * 100
    : 0
)

const beatLevel = ref(0)
const beatSmoother = createBackgroundBeatSmoother()
let stopBeatSampler: (() => void) | null = null
const backgroundHost = ref<HTMLElement | null>(null)

/**
 * The sampler runs at 30 fps, so the smoothed level is written straight to the
 * background host's CSS variables instead of a reactive ref: a 30 fps render of
 * the whole player page would be wasted work for two numbers.
 */
function applyBeat(value: number): void {
  const host = backgroundHost.value
  if (!host) return
  beatLevel.value = beatSmoother.push(value, performance.now())
  const style = backgroundBeatStyle(beatLevel.value, true)
  for (const [name, assigned] of Object.entries(style)) host.style.setProperty(name, assigned)
}

watch(
  [beatEnabled, () => player.isPlaying, () => isAppBackground.value],
  ([enabled, playing, background]) => {
    if (stopBeatSampler) {
      stopBeatSampler()
      stopBeatSampler = null
    }
    beatSmoother.reset()
    beatLevel.value = 0
    // Clearing the variables restores the resting scale and brightness.
    const host = backgroundHost.value
    if (host) {
      host.style.removeProperty('--bg-beat-scale')
      host.style.removeProperty('--bg-beat-brightness')
    }
    if (!enabled || !playing || background) return
    stopBeatSampler = startLowFreqSampler(applyBeat)
  },
  { immediate: true }
)

function lyricLineStyle(index: number) {
  const jump =
    index === currentLineIndex.value
      ? lyricJumpStyle(displayLyrics.value.lines[index], settings.settings.lyricJump)
      : undefined
  // Apple 风格歌词只作用于当前句：按行时间推进遮罩，形成从左到右的扫过。
  const karaoke =
    index === currentLineIndex.value
      ? karaokeMaskStyle(
          displayLyrics.value.lines[index],
          lyricPositionMs.value,
          settings.settings.lyricAppleStyle
        )
      : undefined
  const delay = lyricSeekStaggering.value
    ? seekStaggerDelayMs(index, currentLineIndex.value, settings.settings.lyricSeekStagger)
    : 0
  const stagger = delay > 0 ? { transitionDelay: `${delay}ms` } : undefined
  if (!settings.settings.lyricBlur) return { ...jump, ...karaoke, ...stagger }
  const distance = Math.abs(currentLineIndex.value - index)
  if (distance === 0) return { filter: 'blur(0)', ...jump, ...karaoke, ...stagger }
  const blurPx = Math.min(1.2 + Math.pow(distance, 0.7) * 1.5, 8)
  return { filter: `blur(${blurPx.toFixed(2)}px)`, ...stagger }
}

const chromeHidden = ref(false)
// 跳转后的一小段时间里启用逐行错开，其余时间歌词同步过渡，避免拖动进度条时持续拖影。
const lyricSeekStaggering = ref(false)
let lyricSeekStaggerTimer: ReturnType<typeof setTimeout> | null = null

const chromeSuspended = computed(() => queueOpen.value || commentsOpen.value || lyricOffsetOpen.value || lyricShareOpen.value || lyricConverterOpen.value || !player.isPlaying)
const controlsIdle = createIdleControls({
  get enabled() {
    return settings.settings.autoHideControls
  },
  get suspended() {
    return chromeSuspended.value
  },
  onIdle: () => {
    chromeHidden.value = true
  },
  onActive: () => {
    chromeHidden.value = false
  }
})

watch(
  () => [settings.settings.autoHideControls, chromeSuspended.value] as const,
  ([enabled, suspended]) => {
    if (!enabled || suspended) {
      chromeHidden.value = false
      controlsIdle.deactivate()
      return
    }
    controlsIdle.poke()
  }
)

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
  const cached = getLyricCache(lyricCache, item.key)
  if (cached) {
    lyricsDoc.value = cached
    return
  }
  // 同一首歌的重复加载只认最后一次结果；换歌会作废在途请求。
  const token = lyricRequests.beginLatest(item.key)
  lyricsLoading.value = true
  // 失败或空结果都允许再次拉取，所以每次重新加载前清掉上一次的占位符。
  lyricError.value = ''
  try {
    const raw = await pluginStore.lyrics(item)
    const parsed = parseLyrics(raw)
    if (!lyricRequests.isCurrent(token, track.value?.key)) return
    // 空结果不缓存：插件「暂时取不到」时返回空文档，缓存后这首歌会一直没歌词。
    // 但空结果本身是正常状态（有些歌就是没有歌词），不该弹成错误——只是不缓存，
    // 下次进来还能重试。
    putLyricCache(lyricCache, item.key, parsed)
    lyricsDoc.value = parsed
  } catch (error) {
    if (!lyricRequests.isCurrent(token, track.value?.key)) return
    lyricsDoc.value = { lines: [], format: 'plain' }
    // 失败不进缓存，用户可以点「重试」重新拉取。
    lyricError.value = error instanceof Error ? error.message : '歌词加载失败'
  } finally {
    // 过期请求不得关闭新请求的加载态。
    if (lyricRequests.isCurrent(token, track.value?.key)) lyricsLoading.value = false
  }
}

/** 手动重试：跳过缓存直接再拉一次（失败与空结果本来就不在缓存里）。 */
function retryLyrics(): void {
  const item = track.value
  if (!item) return
  lyricCache.delete(item.key)
  void loadLyrics()
}

function toggleLyrics() {
  showLyrics.value = !showLyrics.value
  if (showLyrics.value) void loadLyrics()
}

async function chooseQuality() {
  if (!track.value) return
  const qualities = track.value.qualities
  const current = settings.settings.preferredQuality
  const sheet = await actionSheetController.create({
    header: '选择音质',
    subHeader: current ? `当前 ${getQualityDisplayName(current)}` : '当前 自动（最高）',
    buttons: [
      {
        text: '自动（最高）',
        ...(current ? {} : { role: 'selected' as const }),
        handler: () => applyPreferredQuality('')
      },
      ...qualities.map((quality) => ({
        text: getQualityDisplayName(quality),
        ...(quality === current ? { role: 'selected' as const } : {}),
        handler: () => applyPreferredQuality(quality)
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

/**
 * 桌面 switchQuality 的移动端等价：写入首选音质后按新音质重载当前歌曲，
 * 保留进度与播放状态（本地/已下载文件没有音质可选，按钮不会出现）。
 */
async function applyPreferredQuality(quality: string) {
  if (settings.settings.preferredQuality === quality) return
  settings.settings.preferredQuality = quality
  const name = quality ? getQualityDisplayName(quality) : '自动音质'
  try {
    // 正在装载另一首时 `reloadCurrentTrack` 会直接放弃（返回 false）。
    // 此时音质设置已保存、下一首生效，但当前这首歌**没有**换音源——
    // 仍然报「已切换」会让用户以为现在听到的就是新音质。
    const reloaded = await player.reloadCurrentTrack()
    await toast(reloaded ? `已切换到${name}` : `${name}将在下一首生效`)
  } catch (error) {
    await toast(error instanceof Error ? error.message : '切换音质失败', 'danger')
  }
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
  if (roomReadOnly.value) {
    event.detail.complete()
    return
  }
  const keys = player.queue.map((item) => item.key)
  const [moved] = keys.splice(event.detail.from, 1)
  keys.splice(event.detail.to, 0, moved)
  player.reorderHostTracks(keys)
  event.detail.complete()
}

function removeQueueItem(item: Track) {
  player.removeHostTracks([item.key])
}

/**
 * 把队列滚动到当前播放那行（桌面版 `handleLocateCurrentSong`）。
 *
 * 用滚动容器的几何计算而不是 `scrollIntoView`：后者会把**整个页面**一起滚，
 * 弹层里的队列会因为父级滚动而错位。
 */
function locateCurrentInQueue(): void {
  const content = queueContentRef.value
  const row = content?.querySelector('.queue-row.current') as HTMLElement | null
  if (!content || !row) return
  const top = row.offsetTop - content.clientHeight / 2 + row.clientHeight / 2
  content.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

/**
 * 当前播放队列导出为歌单文件（.cmpl），与歌单页导出的格式完全一致，
 * 因此可以直接在歌单页或桌面版导入。本地/已下载歌曲不进文件——它们只在本机。
 */
async function exportQueueFile() {
  if (queueFileBusy.value) return
  queueFileBusy.value = true
  try {
    const queue = player.queue
    if (!queue.length) throw new Error('播放队列为空')
    const exportable = exportableTracks(queue)
    if (!exportable.length) throw new Error('队列里没有可导出的在线歌曲')
    const encrypted = encryptPlaylistTracks(queue)
    const dropped = queue.length - exportable.length
    await saveAndShareFile({
      name: playlistFileName('播放队列'),
      data: packPlaylistFile(encrypted),
      mime: 'application/gzip',
      title: 'Ceru Music 播放队列'
    })
    await toast(
      dropped > 0 ? `已导出 ${exportable.length} 首（${dropped} 首本地歌曲未包含）` : `已导出 ${exportable.length} 首`
    )
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '导出失败', 'danger')
  } finally {
    queueFileBusy.value = false
  }
}

function pickQueueFile() {
  queueFileInput.value?.click()
}

/** 导入歌单文件到**当前队列**（追加，不替换正在播放的歌）。 */
async function onQueueFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || queueFileBusy.value) return
  queueFileBusy.value = true
  try {
    const songs = parsePlaylistFile(file.name, new Uint8Array(await file.arrayBuffer()))
    const tracks = playlistFileTracks(songs, pluginStore.providers)
    if (!tracks.length) throw new Error('歌单文件里没有可导入的歌曲')
    const before = player.queue.length
    // rawEntityToTrack 的元数据走 entity.metadata，不能平铺传字段。
    await player.appendHostTracks(
      tracks.map((item) => ({
        ref: item.ref,
        title: item.title,
        subtitle: item.artists.join(' / '),
        durationMs: item.durationMs,
        metadata: {
          artists: item.artists,
          album: item.album ? { title: item.album } : undefined,
          artworkUrl: item.artworkUrl,
          qualities: item.qualities
        }
      }))
    )
    const added = player.queue.length - before
    await toast(added > 0 ? `已加入 ${added} 首到播放队列` : '这些歌曲已经在队列中')
  } catch (cause) {
    await toast(cause instanceof Error ? cause.message : '导入失败', 'danger')
  } finally {
    queueFileBusy.value = false
  }
}

async function clearQueue() {
  if (roomReadOnly.value) {
    await toast('一起听房间内不能清空共享队列', 'warning')
    return
  }
  const alert = await alertController.create({
    header: '清空播放队列',
    message: '将移除队列中的全部歌曲并停止播放。',
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '清空',
        role: 'destructive',
        handler: () => {
          player.clearQueue()
          queueOpen.value = false
        }
      }
    ]
  })
  await alert.present()
}

/** 睡眠定时时长选择：与设置页同一组选项，避免两处口径不一致。 */
async function pickSleepTimer(): Promise<void> {
  const options = [
    { minutes: 15, label: '15 分钟后暂停' },
    { minutes: 30, label: '30 分钟后暂停' },
    { minutes: 60, label: '60 分钟后暂停' }
  ]
  const sheet = await actionSheetController.create({
    header: '睡眠定时',
    buttons: [
      ...options.map((option) => ({
        text: option.label,
        handler: () => {
          player.setSleepTimer(option.minutes)
          void toast(`将在 ${option.minutes} 分钟后暂停`)
        }
      })),
      { text: '取消', role: 'cancel' }
    ]
  })
  await sheet.present()
}

async function openMore() {
  if (!track.value) return
  const sheet = await actionSheetController.create({
    header: track.value.title,
    buttons: [
      {
        text: player.sleepRemainingMs ? '关闭睡眠定时' : '睡眠定时…',
        handler: () => {
          // 关闭直接生效；未开启时给几个常用时长——播放页只有「15 分钟」一个选项，
          // 想听 30/60 分钟还得绕去设置页。
          if (player.sleepRemainingMs) {
            player.setSleepTimer(null)
            void toast('已关闭睡眠定时')
            return
          }
          void pickSleepTimer()
        }
      },
      {
        text: '查看评论',
        handler: () => openComments()
      },
      {
        text: '分享 / 复制歌词',
        handler: () => {
          lyricShareOpen.value = true
        }
      },
      {
        text: currentTrackOffset.value !== 0
          ? '微调歌词时间 (' + (currentTrackOffset.value > 0 ? '+' : '') + (currentTrackOffset.value / 1000).toFixed(1) + 's)'
          : '微调歌词时间',
        handler: () => {
          lyricOffsetOpen.value = true
        }
      },
      ...pluginStore.menus
        .filter(
          (menu) =>
            menu.slot === 'player.actions' &&
            (!menu.when?.loggedIn || auth.authenticated) &&
            (!menu.when?.kinds?.length || menu.when.kinds.includes('track'))
        )
        .map((menu) => ({
          text: menu.title,
          handler: () => {
            if (!track.value) return
            void pluginStore
              .invokeAction(menu.pluginKey, menu.action, {
                track: track.value.raw,
                trackKey: track.value.key
              })
              .catch((error) =>
                toast(error instanceof Error ? error.message : '插件操作失败', 'danger')
              )
          }
        })),
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
          })
            .then(() => toast('已复制'))
            .catch(() => toast('复制失败', 'danger'))
        }
      },
      {
        // 在房间里时直接点歌给房主审批，不必先跳到一起听页面再找按钮。
        text: listenTogether.inRoom ? '点歌到房间' : '一起听',
        handler: () => {
          if (!listenTogether.inRoom) {
            ionRouter.push('/listen-together')
            return
          }
          if (listenTogether.requestTrack(track.value as any)) {
            void toast('点歌请求已发送')
          } else {
            void toast('房间连接已断开', 'warning')
          }
        }
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
  artSize.value = Math.min(window.innerWidth < 900 ? 320 : 360, Math.max(220, window.innerWidth - 84))
}

watch(
  () => track.value?.key,
  () => {
    // 换歌即作废旧请求，避免旧响应写回并覆盖新歌歌词或残留加载态。
    lyricRequests.invalidate()
    lyricsLoading.value = false
    lyricError.value = ''
    lyricsDoc.value = { lines: [], format: 'plain' }
    if (showLyrics.value) void loadLyrics()
  }
)
let currentTrackCacheKey = ''

/**
 * 歌词变化推给插件（`ctx.events.on('lyrics.changed')`）。
 *
 * 桌面版在 PluginHostBridge 里监听全局歌词状态；移动端歌词只在这个组件里，
 * 所以由这里广播。只在**文档对象换掉**时推（切歌、加载完成、清空），
 * 不跟当前行或高亮走——插件关心的是整份歌词，不是播放行号。
 */
watch(
  lyricsDoc,
  (doc) => publishCurrentLyrics(doc),
  { deep: false, flush: 'post' }
)

watch(currentLineIndex, (next, previous) => {
  if (isSeekJump(previous, next)) {
    lyricSeekStaggering.value = true
    if (lyricSeekStaggerTimer) clearTimeout(lyricSeekStaggerTimer)
    lyricSeekStaggerTimer = setTimeout(() => {
      lyricSeekStaggering.value = false
      lyricSeekStaggerTimer = null
    }, SEEK_STAGGER_WINDOW_MS)
  }
  void nextTick(() => {
    const active = lyricsContainer.value?.querySelector('.lyric-line.active')
    active?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
})

onMounted(() => {
  window.addEventListener('resize', updateArtSize)
  /* 打开播放页时的初始行为由设置决定；判定集中在 services/playerEntry.ts */
  const plan = planPlayerEntry(settings.settings, {
    hasTrack: Boolean(player.currentTrack),
    status: player.status
  })
  if (plan.expandLyrics) {
    showLyrics.value = true
    void loadLyrics()
  }
  if (plan.autoPlay) void player.resume().catch(() => undefined)
  controlsIdle.poke()
})

onBeforeUnmount(() => {
  controlsIdle.deactivate()
  lyricRequests.dispose()
  if (lyricSeekStaggerTimer) clearTimeout(lyricSeekStaggerTimer)
  if (stopBeatSampler) {
    stopBeatSampler()
    stopBeatSampler = null
  }
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
  filter: blur(44px) saturate(140%) brightness(var(--bg-beat-brightness, 1));
  transform: scale(calc(1.16 * var(--bg-beat-scale, 1)));
  opacity: 0.32;
  pointer-events: none;
}
/*
 * Beat host only carries the CSS variables. It must stay untransformed and
 * unfiltered, otherwise it would become the containing block of the fixed
 * background layers and break their full-viewport positioning.
 */
.bg-beat-host {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
/* 四色渐变 keeps no cover pattern, so the artwork layer is dropped. */
.bg-renderer-isolation .bg-layer {
  display: none;
}
.bg-gradient {
  position: fixed;
  inset: -40px;
  filter: blur(28px) saturate(150%) brightness(var(--bg-beat-brightness, 1));
  transform: scale(calc(1.12 * var(--bg-beat-scale, 1)));
  opacity: 0.5;
  pointer-events: none;
}
/* 网格渐变 softens the cover contours further than the classic renderer. */
.bg-renderer-mesh .bg-layer {
  filter: blur(58px) saturate(168%) brightness(var(--bg-beat-brightness, 1));
  opacity: 0.38;
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
.art-wrap.vinyl {
  width: var(--art-size);
  height: var(--art-size);
}
.vinyl-disc {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, #1a1a1a 0%, #0d0d0d 100%);
  box-shadow: 0 22px 46px rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.vinyl-disc.spinning {
  animation: vinyl-spin 33s linear infinite;
}
.vinyl-grooves {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    repeating-conic-gradient(
      from 0deg,
      transparent 0deg,
      rgba(255, 255, 255, 0.022) 0.5deg,
      transparent 1deg,
      rgba(255, 255, 255, 0.012) 1.5deg,
      transparent 2deg
    ),
    repeating-radial-gradient(
      circle at 50% 50%,
      transparent 0px,
      rgba(255, 255, 255, 0.03) 1px,
      transparent 2px,
      transparent 8px
    );
}
.vinyl-label {
  position: relative;
  width: 60%;
  height: 60%;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 50% 50%, rgba(40, 40, 40, 0.95), rgba(15, 15, 15, 1));
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  z-index: 2;
}
.vinyl-label :deep(.cover) {
  width: 96% !important;
  height: 96% !important;
}
.vinyl-label :deep(img) {
  filter: brightness(0.88) contrast(1.12) saturate(1.08);
}
.label-shine {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(ellipse at 25% 25%, rgba(255, 255, 255, 0.1), transparent 50%);
  pointer-events: none;
}
.vinyl-hole {
  position: absolute;
  width: 8%;
  height: 8%;
  border-radius: 50%;
  background: radial-gradient(circle, #000 0%, #111 30%, #222 70%, #333 100%);
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.9);
  z-index: 3;
}
.tonearm {
  position: absolute;
  top: -6%;
  right: 6%;
  width: 4px;
  height: 42%;
  border-radius: 3px;
  background: linear-gradient(180deg, #dfe6ee, #8f9aa6 60%, #5d6873);
  transform-origin: top center;
  transform: rotate(-24deg);
  transition: transform 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 4;
}
.tonearm::before {
  content: '';
  position: absolute;
  top: -7px;
  left: -4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #f4f8fb, #7c8794);
}
.tonearm::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: -2px;
  width: 8px;
  height: 14px;
  border-radius: 2px;
  background: #cbd5df;
}
.tonearm.playing {
  transform: rotate(-6deg);
}
@keyframes vinyl-spin {
  to {
    transform: rotate(360deg);
  }
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
.player-visualizer {
  margin-top: 10px;
  opacity: 0.75;
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
.seek-host {
  position: relative;
}
/*
 * 过渡标记覆盖在 ion-range 轨道上：轨道本身横跨整个 host，
 * 且 bar 垂直居中（(height - bar-height)/2 + bar-height/2 = height/2），
 * 因此这里按百分比定位 + 垂直居中即可与轨道对齐。
 * 层级低于 ion-range（host 为 z-index: 2），与桌面端一致：
 * 标记透过半透明的未播放轨道可见，已播放部分则由进度填充色自然盖住。
 */
.seek-marks {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
.crossfade-mark,
.crossfade-fadein-mark {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 5px;
  border-radius: 999px;
}
/* 预告区间：尾段以斜纹块提示“可能在此发生过渡” */
.crossfade-mark {
  background: repeating-linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.5),
    rgba(255, 255, 255, 0.5) 3px,
    rgba(255, 255, 255, 0.16) 3px,
    rgba(255, 255, 255, 0.16) 6px
  );
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22);
  opacity: 0.8;
  transition:
    left 0.2s linear,
    width 0.2s linear;
}
/* 新歌开头的淡入段：从左向右渐弱的条带 */
.crossfade-fadein-mark {
  left: 0;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.72),
    rgba(255, 255, 255, 0.26) 70%,
    rgba(255, 255, 255, 0)
  );
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.4);
  opacity: 0.9;
  animation: crossfade-fadein-glow 1.6s ease-out;
}
@keyframes crossfade-fadein-glow {
  0% {
    opacity: 0;
    transform: translateY(-50%) scaleX(0.6);
    transform-origin: left center;
  }
  35% {
    opacity: 1;
    transform: translateY(-50%) scaleX(1);
  }
  100% {
    opacity: 0.9;
    transform: translateY(-50%) scaleX(1);
  }
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
/* 无感过渡进行中的浮层提示（对齐桌面 CrossfadeHint.vue） */
.crossfade-hint {
  position: absolute;
  left: 50%;
  bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  backdrop-filter: blur(20px);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  user-select: none;
}
.cf-wave {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 14px;
}
.cf-wave span {
  display: inline-block;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: currentColor;
  transform-origin: center;
  animation: crossfade-wave 1s ease-in-out infinite;
}
.cf-text {
  letter-spacing: 0.3px;
}
@keyframes crossfade-wave {
  0%,
  100% {
    transform: scaleY(0.4);
  }
  50% {
    transform: scaleY(1);
  }
}
.crossfade-hint-enter-active,
.crossfade-hint-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.crossfade-hint-enter-from,
.crossfade-hint-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
.crossfade-hint-enter-to,
.crossfade-hint-leave-from {
  opacity: 1;
  transform: translate(-50%, 0);
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
.controls,
.bottom-actions {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.chrome-idle {
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
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
.lyrics-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 8px 8px;
}
.lyrics-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lyrics-head-left span {
  color: rgba(245, 248, 251, 0.55);
  font-size: 11px;
  font-weight: 650;
}
.offset-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-family: monospace;
  background: rgba(0, 218, 192, 0.2);
  color: var(--ion-color-primary, #00dac0);
  border: 1px solid rgba(0, 218, 192, 0.35);
  cursor: pointer;
}
.lyrics-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.lyric-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(245, 248, 251, 0.14);
  border-radius: 999px;
  background: rgba(245, 248, 251, 0.06);
  color: rgba(245, 248, 251, 0.78);
  font-size: 11px;
  font-weight: 650;
  padding: 4px 9px;
  cursor: pointer;
}
.lyric-btn ion-icon {
  font-size: 12px;
}
.lyric-export {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(245, 248, 251, 0.14);
  border-radius: 999px;
  background: rgba(245, 248, 251, 0.06);
  color: rgba(245, 248, 251, 0.78);
  font-size: 11px;
  font-weight: 650;
  padding: 5px 10px;
}
.lyric-export ion-icon {
  font-size: 13px;
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
  font-weight: var(--lyric-weight, 400);
  margin: 0;
  padding: 10px 6px;
  color: rgba(245, 248, 251, 0.28);
  line-height: 1.45;
  transition: color 0.25s ease, transform 0.25s ease, filter 0.3s ease;
}
.lyric-line.active {
  color: var(--lyric-accent, #f5f8fb);
  transform: scale(1.035);
  font-weight: 650;
  filter: none;
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
/*
 * 跳动歌词：与桌面版 LyricAdapter 一致，先起跳再物理回弹，行越长幅度越大。
 * 只覆盖 animation 长属性，保留「歌词动效」提供的光晕。
 */
.lyric-jump .lyric-line.active .lyric-text {
  display: inline-block;
  animation-name: lyric-jump;
  animation-duration: var(--lyric-jump-duration, 1.1s);
  animation-iteration-count: 1;
  animation-fill-mode: both;
  animation-timing-function: linear;
}
@keyframes lyric-jump {
  0% {
    transform: translateY(var(--lyric-jump-drop, 0.16em)) scale(1);
    animation-timing-function: ease-out;
  }
  80% {
    transform: translateY(calc(-1 * var(--lyric-jump-lift, 0em))) scale(var(--lyric-jump-scale, 1.02));
    animation-timing-function: cubic-bezier(0.34, 1.3, 0.64, 1);
  }
  100% {
    transform: translateY(0) scale(1);
  }
}
.lyric-text {
  display: block;
}
/*
 * Apple 风格歌词：当前句用亮暗渐变遮罩按行时间推进，未唱部分变暗、已唱部分变亮，
 * 形成从左到右的扫过效果；遮罩参数与桌面版 LyricAdapter 的 YRC 完全一致。
 */
.lyric-apple .lyric-line.active .lyric-text {
  display: inline-block;
  mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 1) 45.4545%,
    rgba(0, 0, 0, 0.3) 54.5455%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 1) 45.4545%,
    rgba(0, 0, 0, 0.3) 54.5455%
  );
  mask-size: 220% 100%;
  -webkit-mask-size: 220% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  mask-position: var(--karaoke-mask-x, 0%) 0;
  -webkit-mask-position: var(--karaoke-mask-x, 0%) 0;
  transition: mask-position 0.25s linear;
  -webkit-transition: -webkit-mask-position 0.25s linear;
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
.lyric-retry {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 10px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  line-height: 1.6;
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
.queue-head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.queue-room-notice {
  margin: 0;
  padding: 8px 16px 2px;
  color: var(--ceru-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.queue-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--ceru-danger, #ff5a5f);
  font-size: 12px;
  padding: 4px 2px;
}
.queue-clear ion-icon {
  font-size: 14px;
}
.queue-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--ceru-accent, #00dac0);
  font-size: 12px;
  padding: 4px 2px;
}
.queue-action:disabled {
  opacity: 0.5;
}
.queue-action ion-icon {
  font-size: 14px;
}
.queue-file-input {
  display: none;
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
.queue-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--ceru-text-secondary);
  flex: none;
}
.queue-remove ion-icon {
  font-size: 20px;
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
.background-animated .bg-gradient {
  animation: background-breathe-gradient 15s ease-in-out infinite alternate;
}
/* The keyframes keep --bg-beat-scale so the beat effect survives the breathing animation. */
@keyframes background-breathe {
  from { transform: scale(calc(1.05 * var(--bg-beat-scale, 1))); opacity: 0.42; }
  to { transform: scale(calc(1.16 * var(--bg-beat-scale, 1))); opacity: 0.62; }
}
@keyframes background-breathe-gradient {
  from { transform: scale(calc(1.04 * var(--bg-beat-scale, 1))); opacity: 0.46; }
  to { transform: scale(calc(1.14 * var(--bg-beat-scale, 1))); opacity: 0.62; }
}
</style>
