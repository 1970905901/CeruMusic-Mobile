import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { MediaSession } from '@capgo/capacitor-media-session'
import type { RepeatMode } from '@/stores/settings'
import type { PlaybackStatus, Track } from '@/types/music'
import { usePluginStore } from '@/stores/plugins'
import { useLibraryStore } from '@/stores/library'
import { useSettingsStore } from '@/stores/settings'
import { cacheAudio, getCachedAudio, isTrackCacheable } from '@/services/mediaCache'
import { isAudioContentType, notAudioMessage } from '@/services/downloadContentType'
import {
  bindAudioPipelineElement,
  isAudioEffectsActive,
  peekEnvelopeAnalyser,
  setAudioVisualizerEnabled
} from '@/services/audioEffects'
import { cancelVolumeTransition, transitionVolume } from '@/services/volumeTransition'
import { isListenTogetherPlaybackActive } from '@/services/playbackContext'
import { SYSTEM_OUTPUT_ID, applyAudioOutput } from '@/services/audioOutput'
import { backgroundSupportsBeat } from '@/services/backgroundRenderers'
import { timeDomainRms } from '@/services/crossfadeCurve'
import {
  buildShuffleOrder,
  isShuffleOrderValid,
  nextShuffleKey,
  previousShuffleKey
} from '@/services/shuffleOrder'
import { displayMinutes, planSleepTimer, resumeSleepTimer } from '@/services/sleepTimer'
import {
  type CrossfadeElement,
  cancelCrossfade,
  initCrossfade,
  notifyCrossfadeTimeUpdate
} from '@/services/crossfade'

function rawEntityToTrack(entity: any, pluginKey?: string): Track {
  const ref = entity?.ref ?? {}
  const metadata = entity?.metadata ?? {}
  const artists = Array.isArray(metadata.artists)
    ? metadata.artists.map(String)
    : String(entity?.subtitle ?? '')
        .split(/[\/,，、]/)
        .map((item: string) => item.trim())
        .filter(Boolean)
  return {
    key: `${pluginKey ?? ref.providerId}:${ref.providerId}:${ref.id}`,
    pluginKey,
    ref,
    title: String(entity?.title ?? '未知歌曲'),
    subtitle: entity?.subtitle,
    artists,
    album: metadata.album?.title,
    durationMs: Number(entity?.durationMs ?? metadata.durationMs ?? 0) || undefined,
    artworkUrl: metadata.artworkUrl,
    qualities: Array.isArray(metadata.qualities) ? metadata.qualities : [],
    // 音质档位对应的大小会在播放页音质面板与云端歌单里展示；
    // 丢掉它之后，从队列/歌单文件导入的歌在音质列表里只剩档位名、没有大小。
    ...(metadata.qualitySizes && typeof metadata.qualitySizes === 'object'
      ? { qualitySizes: { ...(metadata.qualitySizes as Record<string, number>) } }
      : {}),
    playable: entity?.playable !== false,
    raw: JSON.parse(JSON.stringify(entity)),
    source: 'plugin'
  }
}

const PLAYER_STORAGE_KEY = 'ceru-player-state-v1'

export const usePlayerStore = defineStore('player', () => {
  const pluginStore = usePluginStore()
  const library = useLibraryStore()
  const settings = useSettingsStore()

  const audio = new Audio()
  audio.preload = 'metadata'
  audio.setAttribute('playsinline', 'true')
  bindAudioPipelineElement(audio)

  const queue = ref<Track[]>([])
  const currentIndex = ref(-1)
  const status = ref<PlaybackStatus>('idle')
  const positionMs = ref(0)
  const durationMs = ref(0)
  const volume = ref(0.8)
  const muted = ref(false)
  const playbackRate = ref(1)
  const repeat = ref<RepeatMode>('off')
  const shuffle = ref(false)
  /** 洗牌顺序存的是歌曲 key，不是下标：队列增删后下标会指向别的歌。 */
  const shuffleOrder = ref<string[]>([])
  const error = ref<string | null>(null)
  const loading = computed(() => status.value === 'loading')
  const currentTrack = computed(() => queue.value[currentIndex.value] ?? null)
  const hasNext = computed(() => {
    if (!queue.value.length) return false
    if (repeat.value === 'all') return true
    // 随机模式下队列下标说明不了还有没有下一首——顺序是打乱的。
    if (shuffle.value) return queue.value.length > 1
    return currentIndex.value < queue.value.length - 1
  })
  const hasPrevious = computed(() => currentIndex.value > 0 || positionMs.value > 3000)
  const isPlaying = computed(() => status.value === 'playing')
  const progress = computed(() => (durationMs.value > 0 ? positionMs.value / durationMs.value : 0))

  let objectUrl: string | null = null
  let resolvedUrl: string | null = null
  let resolvedExpiresAt = 0
  let resolving = false
  let sleepTimer: ReturnType<typeof setTimeout> | null = null
  let sleepDeadline = 0
  let publishTimer: ReturnType<typeof setTimeout> | null = null
  const sleepRemainingMs = ref<number | null>(null)
  let sleepInterval: ReturnType<typeof setInterval> | null = null
  let restorePositionMs = 0
  let lastPersistAt = 0
  let transitionToken = 0
  /** 无感过渡保留的旧歌音源（blob URL），过渡收尾时才回收。 */
  let outgoingRetained: string | null = null
  /** RMS 观察复用的时域帧缓冲。 */
  let rmsFrame = new Uint8Array(new ArrayBuffer(0))

  audio.volume = volume.value
  audio.playbackRate = playbackRate.value

  function persistedSnapshot() {
    return {
      queue: queue.value,
      currentIndex: currentIndex.value,
      positionMs: positionMs.value,
      volume: volume.value,
      muted: muted.value,
      playbackRate: playbackRate.value,
      repeat: repeat.value,
      shuffle: shuffle.value,
      // 洗牌顺序一起持久化：否则重启后顺序丢失，用户正在听的一轮会被重洗。
      shuffleOrder: shuffleOrder.value,
      // 睡眠定时存绝对截止时间，重启后才能按原计划结束而不是重新计时。
      sleepDeadline: sleepDeadline || null
    }
  }

  function persistState() {
    try {
      localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(persistedSnapshot()))
    } catch {
      // Storage may be unavailable in private contexts.
    }
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(PLAYER_STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      // 只接受结构完好的条目：存档可能来自更早的版本，或被写到一半。
      // 一条没有 key/ref 的记录会让队列渲染、恢复播放和洗牌顺序全部出错。
      if (Array.isArray(saved.queue)) {
        queue.value = saved.queue.filter(
          (item: any) =>
            item &&
            typeof item === 'object' &&
            typeof item.key === 'string' &&
            item.key &&
            item.ref &&
            typeof item.ref === 'object' &&
            typeof item.ref.id === 'string'
        )
      }
      currentIndex.value = Number.isFinite(saved.currentIndex) ? saved.currentIndex : queue.value.length ? 0 : -1
      if (currentIndex.value >= queue.value.length) currentIndex.value = queue.value.length - 1
      restorePositionMs = Number(saved.positionMs) || 0
      volume.value = Number.isFinite(saved.volume) ? saved.volume : 0.8
      muted.value = !!saved.muted
      playbackRate.value = Math.max(0.5, Math.min(3, Number(saved.playbackRate) || 1))
      repeat.value = saved.repeat === 'one' || saved.repeat === 'all' ? saved.repeat : 'off'
      shuffle.value = !!saved.shuffle
      // 旧版本没有这个字段，且队列可能变过——只接受仍然对得上的顺序，
      // 否则丢弃，由 ensureShuffleOrder 重洗。
      const savedOrder = Array.isArray(saved.shuffleOrder) ? saved.shuffleOrder.map(String) : []
      shuffleOrder.value = isShuffleOrderValid(savedOrder, queueKeys()) ? savedOrder : []
      // 恢复睡眠定时：只认仍然有效的截止时间；已过期的直接丢弃（不暂停当前播放，
      // 因为此时音频还没就绪）。
      const resumed = resumeSleepTimer(saved.sleepDeadline, Date.now())
      if (resumed.active) {
        armSleepTimer(resumed.deadline, displayMinutes(resumed.remainingMs))
      } else if (settings.settings.sleepTimerMinutes) {
        // 旧版本只留下分钟数、没有截止时间，或定时早已到期——无法判断还剩多久，
        // 清掉避免界面显示一个并不存在的倒计时。
        settings.settings.sleepTimerMinutes = null
      }
      audio.volume = volume.value
      audio.muted = muted.value
    } catch {
      // Ignore malformed state from an older build.
    }
  }

  function cleanupObjectUrl() {
    // 无感过渡期间旧歌的 blob 由尾巴元素继续使用，不能在这里撤销。
    if (objectUrl && objectUrl !== outgoingRetained) {
      URL.revokeObjectURL(objectUrl)
    }
    objectUrl = null
  }

  function queueKeys(): string[] {
    return queue.value.map((item) => item.key)
  }

  /**
   * 队列变化后同步洗牌顺序。
   *
   * 只在顺序确实失效时重建：用户点了一首歌、往队列里插了歌，都不该把已经
   * 洗好的顺序打乱重来——原实现每次都重置成递增序列，于是打开随机播放后
   * 点任意一首歌，随机就静默失效了。
   */
  function ensureShuffleOrder(rebuild = false): void {
    if (!shuffle.value) {
      shuffleOrder.value = []
      return
    }
    const keys = queueKeys()
    if (rebuild || !isShuffleOrderValid(shuffleOrder.value, keys)) {
      shuffleOrder.value = buildShuffleOrder(keys)
    }
  }

  function setStatus(value: PlaybackStatus) {
    status.value = value
    publishState()
  }

  function publishState() {
    if (publishTimer) return
    publishTimer = setTimeout(() => {
      publishTimer = null
      const track = currentTrack.value
      pluginStore.publishPlayerState({
        status: status.value,
        track: track?.raw ?? null,
        positionMs: Math.round(positionMs.value),
        durationMs: Math.round(durationMs.value || track?.durationMs || 0),
        volume: muted.value ? 0 : volume.value,
        muted: muted.value,
        playbackRate: playbackRate.value,
        repeat: repeat.value,
        shuffle: shuffle.value
      })
    }, 600)
  }

  /**
   * 队列版本号：任何会改变队列内容或顺序的操作都 +1。
   *
   * 此前 `hostQueue()` 用「长度 + 当前索引」拼 revision，拖动排序后两者都不变，
   * 插件轮询 `queue.get` 会永远发现不了变化；而推送用的 `Date.now()` 又可能在
   * 同一毫秒内产生相同值。改成一个只增不减的计数器，两条路径共用同一个值。
   */
  let queueRevision = 0
  function bumpQueueRevision(): string {
    queueRevision += 1
    return String(queueRevision)
  }

  function publishQueue() {
    pluginStore.publishQueue({
      items: queue.value.map((track) => track.raw),
      currentIndex: currentIndex.value,
      revision: bumpQueueRevision()
    })
  }

  function buildCoverUrl(track: Track): string | undefined {
    return track.artworkUrl || track.raw?.metadata?.artworkUrl || undefined
  }

  /** 快速切歌时防止旧的高清封面结果覆盖新歌曲的元数据。 */
  let metadataRevision = 0

  async function pushMetadata(track: Track, artwork: string | undefined) {
    const artists = track.artists.join(' / ')
    if (Capacitor.isNativePlatform()) {
      await MediaSession.setMetadata({
        title: track.title,
        artist: artists,
        album: track.album || '',
        artwork: artwork ? [{ src: artwork, sizes: '512x512', type: 'image/jpeg' }] : []
      }).catch(() => undefined)
      await MediaSession.setPlaybackState({
        playbackState: status.value === 'playing' ? 'playing' : 'paused'
      }).catch(() => undefined)
      await MediaSession.setPositionState({
        duration: (durationMs.value || track.durationMs || 0) / 1000,
        position: positionMs.value / 1000,
        playbackRate: playbackRate.value
      }).catch(() => undefined)
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: artists,
          album: track.album || '',
          artwork: artwork ? [{ src: artwork, sizes: '512x512' }] : []
        })
      } catch {
        // MediaMetadata is unavailable on older WebViews.
      }
    }
  }

  /**
   * 先同步写入原封面，再按需异步换成高清封面。
   * 桌面版同样是「同步先行，异步增强」——高清取图不能拖住整条元数据推送，
   * 否则后台节流或取图超时会让系统卡片停留在上一首歌。
   */
  async function applyMetadata(track: Track | null) {
    const revision = ++metadataRevision
    if (!track) {
      if (Capacitor.isNativePlatform()) {
        await MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => undefined)
      }
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
      return
    }
    await pushMetadata(track, buildCoverUrl(track))
    if (!settings.settings.smtcHiresCover) return
    // 高清取图不阻塞起播：拿到且仍是最新提交时再覆盖一次元数据。
    void pluginStore
      .hiresArtwork(track)
      .then((hires) => {
        if (!hires || revision !== metadataRevision) return
        return pushMetadata(track, hires)
      })
      .catch(() => undefined)
  }

  async function updateNativePosition() {
    if (!Capacitor.isNativePlatform()) return
    const duration = (durationMs.value || currentTrack.value?.durationMs || 0) / 1000
    if (!Number.isFinite(duration) || duration <= 0) return
    await MediaSession.setPositionState({
      duration,
      position: Math.min(positionMs.value / 1000, duration),
      playbackRate: playbackRate.value
    }).catch(() => undefined)
  }

  let positionPublishAt = 0
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      durationMs.value = Math.round(audio.duration * 1000)
    }
    void applyMetadata(currentTrack.value)
  })
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      durationMs.value = Math.round(audio.duration * 1000)
    }
  })
  audio.addEventListener('play', () => {
    setStatus('playing')
    void applyMetadata(currentTrack.value)
  })
  audio.addEventListener('pause', () => {
    if (status.value !== 'ended') setStatus('paused')
  })
  audio.addEventListener('waiting', () => {
    if (status.value === 'playing') setStatus('loading')
  })
  audio.addEventListener('playing', () => setStatus('playing'))
  audio.addEventListener('timeupdate', () => {
    positionMs.value = Math.round(audio.currentTime * 1000)
    notifyCrossfadeTimeUpdate()
    const now = Date.now()
    if (now - lastPersistAt > 2000) {
      lastPersistAt = now
      persistState()
    }
    if (now - positionPublishAt > 700) {
      positionPublishAt = now
      publishState()
      void updateNativePosition()
    }
  })
  audio.addEventListener('ended', () => {
    setStatus('ended')
    void handleEnded()
  })
  audio.addEventListener('error', () => {
    const message = audio.error?.message || '音频播放失败'
    error.value = message
    setStatus('error')
  })

  async function responseToBlob(data: any, mime: string): Promise<Blob> {
    if (data instanceof Blob) return data
    if (data instanceof ArrayBuffer) return new Blob([data], { type: mime })
    if (ArrayBuffer.isView(data)) {
      return new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: mime })
    }
    if (typeof data === 'string') {
      const base64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new Blob([bytes], { type: mime })
    }
    throw new Error('无法读取音频响应')
  }

  async function fileToObjectUrl(relativePath: string, mime = 'audio/mpeg'): Promise<string> {
    const file = await Filesystem.readFile({ path: relativePath, directory: Directory.Data })
    const base64 = typeof file.data === 'string' ? file.data : ''
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    cleanupObjectUrl()
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
    return objectUrl
  }

  async function prepareSource(track: Track): Promise<string> {
    if (Capacitor.getPlatform() === 'web') {
      if (track.localRelativePath) return fileToObjectUrl(track.localRelativePath, 'audio/wav')
      if (track.downloadedRelativePath) return fileToObjectUrl(track.downloadedRelativePath)
    }
    if (track.localPath) return Capacitor.convertFileSrc(track.localPath)
    if (track.localUri) return track.localUri
    if (track.downloadedPath) return Capacitor.convertFileSrc(track.downloadedPath)
    const now = Date.now()
    if (resolvedUrl && resolvedExpiresAt > now && queue.value[currentIndex.value]?.key === track.key) {
      return resolvedUrl
    }
    const cacheQuality =
      settings.settings.preferredQuality ||
      track.qualities[track.qualities.length - 1] ||
      ''
    if (settings.settings.audioCacheEnabled && isTrackCacheable(track)) {
      try {
        const cached = await getCachedAudio(track, cacheQuality, track.qualities)
        if (cached) {
          cleanupObjectUrl()
          objectUrl = cached.url
          return cached.url
        }
      } catch (cause) {
        console.warn('读取音频缓存失败', cause)
      }
    }
    const resolved = await pluginStore.resolve(track, settings.settings.preferredQuality || undefined)
    resolvedUrl = resolved.url
    resolvedExpiresAt = resolved.expiresAt ?? now + 5 * 60 * 1000
    if (settings.settings.audioCacheEnabled && isTrackCacheable(track)) {
      try {
        const cached = await cacheAudio({
          track,
          requestedQuality: cacheQuality,
          url: resolved.url,
          headers: resolved.requestHeaders,
          maxBytes: settings.settings.audioCacheMaxBytes,
          maxQuality: settings.settings.audioCacheMaxQuality
        })
        if (cached) {
          cleanupObjectUrl()
          objectUrl = cached.url
          return cached.url
        }
      } catch (cause) {
        console.warn('写入音频缓存失败', cause)
      }
    }
    const needsBlob =
      (resolved.requestHeaders && Object.keys(resolved.requestHeaders).length > 0) ||
      isAudioEffectsActive()
    if (needsBlob) {
      try {
        if (Capacitor.isNativePlatform()) {
          const response = await CapacitorHttp.request({
            url: resolved.url,
            method: 'GET',
            headers: resolved.requestHeaders || {},
            responseType: 'blob',
            connectTimeout: 30000,
            readTimeout: 120000
          })
          if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`)
          const mime =
            (response.headers && (response.headers['content-type'] || response.headers['Content-Type'])) ||
            'audio/mpeg'
          // 与下载 / 缓存同口径：200 但不是音频（鉴权失效的登录页、JSON 报错）
          // 不能当音频塞给播放器，否则只得到一句笼统的「音频播放失败」。
          if (!isAudioContentType(String(mime))) throw new Error(notAudioMessage(String(mime)))
          const blob = await responseToBlob(response.data, String(mime))
          cleanupObjectUrl()
          objectUrl = URL.createObjectURL(blob)
          return objectUrl
        }
        const response = await fetch(resolved.url, { headers: resolved.requestHeaders })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const mime = response.headers.get('content-type') || ''
        if (!isAudioContentType(mime)) throw new Error(notAudioMessage(mime))
        const blob = await response.blob()
        cleanupObjectUrl()
        objectUrl = URL.createObjectURL(blob)
        return objectUrl
      } catch (cause) {
        console.warn('带请求头的音频代理失败，尝试直链', cause)
      }
    }
    return resolved.url
  }

  async function loadTrack(
    track: Track,
    autoplay = true,
    options?: { skipFadeIn?: boolean; startPositionMs?: number }
  ): Promise<boolean> {
    if (resolving) return false
    resolving = true
    error.value = null
    setStatus('loading')
    try {
      cleanupObjectUrl()
      const source = await prepareSource(track)
      audio.src = source
      audio.playbackRate = playbackRate.value
      audio.load()
      durationMs.value = track.durationMs ?? 0
      const startMs = Math.max(0, Math.round(options?.startPositionMs ?? 0))
      positionMs.value = startMs
      if (startMs > 0) {
        // 切换音质要接着原进度播放；load() 之后必须等元数据就绪才能 seek。
        audio.addEventListener(
          'loadedmetadata',
          () => {
            const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0
            audio.currentTime = total ? Math.min(startMs / 1000, total) : startMs / 1000
          },
          { once: true }
        )
      }
      await applyMetadata(track)
      if (autoplay) {
        // 无感过渡由包络负责整段淡入，这里不能先满音量起播。
        if (options?.skipFadeIn) audio.volume = 0
        await audio.play()
        setStatus('playing')
      } else {
        setStatus('paused')
      }
      void library.recordHistory(track)
    persistState()
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      setStatus('error')
      throw cause
    } finally {
      resolving = false
    }
  }

  async function playTrack(track: Track, nextQueue?: Track[]): Promise<void> {
    cancelCrossfade()
    library.upsertTrack(track)
    if (nextQueue?.length) {
      const index = nextQueue.findIndex((item) => item.key === track.key)
      queue.value = nextQueue
      currentIndex.value = index >= 0 ? index : 0
      // 换成新的播放上下文时才重新洗牌；同一队列里点歌不应打乱。
      ensureShuffleOrder(true)
      publishQueue()
    } else if (!queue.value.some((item) => item.key === track.key)) {
      queue.value = [track, ...queue.value]
      currentIndex.value = 0
      ensureShuffleOrder()
      publishQueue()
    } else {
      currentIndex.value = queue.value.findIndex((item) => item.key === track.key)
    }
    await loadTrack(track, true)
  }

  /**
   * 切换音质后重载当前歌曲并保留播放进度与播放状态（桌面 switchQuality 的移动端等价）。
   *
   * 必须先失效已解析的播放地址缓存，否则 `prepareSource` 会直接复用旧音质的 URL，
   * 表现为「选了新音质但声音没变」。
   */
  async function reloadCurrentTrack(): Promise<boolean> {
    const track = currentTrack.value
    if (!track || resolving) return false
    const wasPlaying = status.value === 'playing' || status.value === 'loading'
    const resumeMs = wasPlaying || status.value === 'paused' ? positionMs.value : 0
    cancelCrossfade()
    cancelVolumeTransition()
    audio.volume = volume.value
    resolvedUrl = null
    resolvedExpiresAt = 0
    return loadTrack(track, wasPlaying, { startPositionMs: resumeMs })
  }

  async function toggle(): Promise<void> {
    if (!currentTrack.value) return
    if (status.value === 'playing' || status.value === 'loading') {
      await stopWithTransition()
      return
    }
    if (audio.src) {
      await startWithTransition()
      return
    }
    await loadTrack(currentTrack.value, true)
  }

  function pause(): void {
    void stopWithTransition()
  }

  async function resume(): Promise<void> {
    if (!currentTrack.value) return
    if (audio.src) {
      await startWithTransition()
    } else {
      await loadTrack(currentTrack.value, true)
    }
  }

  async function startWithTransition(): Promise<void> {
    const token = ++transitionToken
    cancelVolumeTransition()
    cancelCrossfade()
    const target = volume.value
    if (!settings.settings.pauseTransition || isListenTogetherPlaybackActive()) {
      audio.volume = target
      await audio.play()
      setStatus('playing')
      return
    }
    audio.volume = 0
    try {
      await audio.play()
      setStatus('playing')
      await transitionVolume(audio, target, true, true)
    } catch (cause) {
      if (token === transitionToken) audio.volume = target
      throw cause
    }
  }

  async function stopWithTransition(): Promise<void> {
    const token = ++transitionToken
    cancelVolumeTransition()
    // 取消过渡时保留当前音量，交给下面的暂停淡出接着做，避免先跳回满值。
    cancelCrossfade({ keepVolume: true })
    if (!settings.settings.pauseTransition || isListenTogetherPlaybackActive()) {
      audio.pause()
      audio.volume = volume.value
      setStatus('paused')
      return
    }
    setStatus('paused')
    await transitionVolume(audio, volume.value, false, true)
    if (token !== transitionToken) return
    audio.pause()
  }

  function seek(ms: number): void {
    if (!Number.isFinite(ms)) return
    const next = Math.max(0, Math.min(ms, durationMs.value || ms))
    audio.currentTime = next / 1000
    positionMs.value = Math.round(next)
    publishState()
    void updateNativePosition()
  }

  function setVolume(value: number): void {
    volume.value = Math.max(0, Math.min(1, value))
    audio.volume = volume.value
    muted.value = volume.value === 0
    publishState()
  }

  function toggleMute(): void {
    muted.value = !muted.value
    audio.muted = muted.value
    publishState()
  }

  /* ---------------- 音频输出设备 ---------------- */

  /** 供设置页做输出设备枚举/切换；移动端多数 WebView 不支持 sink 选择。 */
  function audioElement(): HTMLAudioElement {
    return audio
  }

  /** 浏览器是否实现了输出设备选择能力。 */
  function canSelectOutput(): boolean {
    return typeof (audio as { setSinkId?: unknown }).setSinkId === 'function'
  }

  /**
   * 应用输出设备。返回 false 表示当前环境不支持，调用方应提示「跟随系统输出」。
   * 切换失败时保持原设备不变，不静默吞掉错误。
   */
  async function applyOutputDevice(deviceId: string): Promise<boolean> {
    return applyAudioOutput(audio, deviceId)
  }

  /**
   * 启动时恢复用户选过的输出设备。
   *
   * 此前只有打开设置页并触发 `refreshOutputDevices` 才会调用 `setSinkId`：
   * 用户昨天选了蓝牙音箱，今天启动时音频仍从扬声器出来，直到他再进一次
   * 设置页。桌面版在音频输出 store 初始化时就应用了已保存的设备。
   */
  async function applyStoredOutputDevice(): Promise<boolean> {
    const stored = String(settings.settings.audioOutputDeviceId || '').trim()
    if (!stored || stored === SYSTEM_OUTPUT_ID) return false
    if (!canSelectOutput()) return false
    try {
      return await applyAudioOutput(audio, stored)
    } catch {
      // 设备已拔出/断开时保持系统默认，不阻塞启动。
      return false
    }
  }

  function setPlaybackRate(value: number): void {
    if (!Number.isFinite(value)) return
    playbackRate.value = Math.max(0.5, Math.min(3, Math.round(value * 100) / 100))
    audio.playbackRate = playbackRate.value
    persistState()
    publishState()
    void updateNativePosition()
  }

  /**
   * 无感过渡的宿主实现：时序与判定都在 `services/crossfade.ts`，
   * 这里只提供“读写当前播放链路”的能力，store 仍是播放状态的唯一权威。
   */
  function crossfadeNextTrack(): Track | null {
    // 单曲循环与列表末尾都不做过渡（桌面同样返回 null）。
    if (repeat.value === 'one') return null
    const index = nextIndex()
    return index >= 0 ? queue.value[index] ?? null : null
  }

  /** 保留旧歌音源给尾巴元素：blob URL 在过渡收尾前不能撤销。 */
  function retainOutgoingSource(): { source: string; positionSec: number } | null {
    const source = audio.currentSrc || audio.src
    if (!source) return null
    if (objectUrl && source === objectUrl) outgoingRetained = objectUrl
    return {
      source,
      positionSec: Number.isFinite(audio.currentTime) ? audio.currentTime : 0
    }
  }

  function releaseOutgoingSource(): void {
    if (!outgoingRetained) return
    // 交接已经发生，旧歌只在尾巴元素上，可以安全回收。
    try {
      URL.revokeObjectURL(outgoingRetained)
    } catch {
      // 已被回收时忽略。
    }
    outgoingRetained = null
  }

  /**
   * 过渡回滚：主元素通常仍在播放这个音源，因此默认不能撤销。
   * 只有当主元素已经改指别处（装载失败但已换过 src）时才回收，避免泄漏。
   */
  function restoreOutgoingSource(): void {
    const retained = outgoingRetained
    outgoingRetained = null
    if (!retained) return
    const currentSource = audio.currentSrc || audio.src
    if (currentSource && currentSource === retained) return
    try {
      URL.revokeObjectURL(retained)
    } catch {
      // 已被回收时忽略。
    }
  }

  /** 过渡触发时装载下一首；成功返回 true，失败由上层的回退逻辑收尾。 */
  async function advanceForCrossfade(track: Track): Promise<boolean> {
    const index = queue.value.findIndex((item) => item.key === track.key)
    if (index < 0) return false
    currentIndex.value = index
    publishQueue()
    try {
      // 过渡路径不需要淡入，音量完全交给包络控制。
      return await loadTrack(track, true, { skipFadeIn: true })
    } catch {
      // loadTrack 已经把错误写进 error/status，这里只需报告失败以便回退。
      return false
    }
  }

  function readCrossfadeRms(): number {
    const analyser = peekEnvelopeAnalyser()
    if (!analyser) return Number.POSITIVE_INFINITY
    if (rmsFrame.length !== analyser.fftSize) {
      rmsFrame = new Uint8Array(new ArrayBuffer(analyser.fftSize))
    }
    analyser.getByteTimeDomainData(rmsFrame)
    return timeDomainRms(rmsFrame)
  }

  initCrossfade({
    getElement: () => audio as unknown as CrossfadeElement,
    getVolume: () => (muted.value ? 0 : volume.value),
    getPlaybackRate: () => playbackRate.value,
    isEnabled: () =>
      settings.settings.seamlessTransition && !isListenTogetherPlaybackActive(),
    peekNext: crossfadeNextTrack,
    advanceToNext: advanceForCrossfade,
    retainOutgoing: retainOutgoingSource,
    releaseOutgoing: releaseOutgoingSource,
    restoreOutgoing: restoreOutgoingSource,
    readAverageRms: readCrossfadeRms,
    createTailElement: () => {
      const tail = new Audio()
      tail.preload = 'auto'
      tail.setAttribute('playsinline', 'true')
      // 尾巴元素负责旧歌的尾段：不跟随主元素的输出设备时，无感过渡期间
      // 声音会突然从另一台设备（通常是扬声器）冒出来。
      const stored = String(settings.settings.audioOutputDeviceId || '').trim()
      if (stored && stored !== SYSTEM_OUTPUT_ID) {
        void applyAudioOutput(tail, stored).catch(() => false)
      }
      return tail as unknown as CrossfadeElement
    }
  })

  /**
   * 下一首的下标。
   *
   * 随机模式下沿洗牌顺序推进游标（桌面版 `resolveNextSong` 的语义），
   * 而不是从剩余项里再抽一次：逐个抽样会重复唱同一首，游标推进才能在一轮内
   * 把队列听完。循环模式走到末尾时重洗，单曲循环不经过这里（由 `handleEnded` 处理）。
   */
  function nextIndex(): number {
    if (!queue.value.length) return -1
    if (shuffle.value && queue.value.length > 1) {
      ensureShuffleOrder()
      const step = nextShuffleKey(shuffleOrder.value, currentTrack.value?.key, {
        wrap: repeat.value === 'all'
      })
      shuffleOrder.value = step.order
      if (step.key) {
        const index = queue.value.findIndex((item) => item.key === step.key)
        if (index >= 0) return index
      }
      return -1
    }
    if (currentIndex.value < queue.value.length - 1) return currentIndex.value + 1
    return repeat.value === 'all' ? 0 : -1
  }

  async function next(): Promise<void> {
    const index = nextIndex()
    if (index < 0) return
    cancelCrossfade()
    currentIndex.value = index
    publishQueue()
    await loadTrack(queue.value[index], true)
  }

  async function previous(): Promise<void> {
    cancelCrossfade()
    if (positionMs.value > 3000) {
      seek(0)
      return
    }
    if (shuffle.value && queue.value.length > 1) {
      // 随机模式下「上一首」沿洗牌顺序回退，而不是按队列下标倒退。
      ensureShuffleOrder()
      const key = previousShuffleKey(shuffleOrder.value, currentTrack.value?.key)
      if (key) {
        const index = queue.value.findIndex((item) => item.key === key)
        if (index >= 0) {
          currentIndex.value = index
          publishQueue()
          await loadTrack(queue.value[index], true)
          return
        }
      }
    }
    if (currentIndex.value <= 0) {
      if (repeat.value === 'all' && queue.value.length) {
        currentIndex.value = queue.value.length - 1
        await loadTrack(queue.value[currentIndex.value], true)
      }
      return
    }
    currentIndex.value -= 1
    publishQueue()
    await loadTrack(queue.value[currentIndex.value], true)
  }

  async function handleEnded(): Promise<void> {
    cancelCrossfade()
    if (repeat.value === 'one' && currentTrack.value) {
      seek(0)
      await loadTrack(currentTrack.value, true)
      return
    }
    const index = nextIndex()
    if (index >= 0) {
      currentIndex.value = index
      publishQueue()
      await loadTrack(queue.value[index], true)
    } else {
      setStatus('ended')
    }
  }

  function toggleShuffle(): void {
    shuffle.value = !shuffle.value
    ensureShuffleOrder(true)
    publishState()
  }

  function cycleRepeat(): void {
    repeat.value = repeat.value === 'off' ? 'all' : repeat.value === 'all' ? 'one' : 'off'
    publishState()
  }

  function setMode(mode: { repeat?: RepeatMode; shuffle?: boolean } | undefined): void {
    if (!mode || typeof mode !== 'object') return
    // 只接受三个合法取值：插件传别的字符串会把状态写坏，
    // 界面上的循环按钮与「播完自动下一首」的判定都会失效。
    if (mode.repeat === 'off' || mode.repeat === 'all' || mode.repeat === 'one') {
      repeat.value = mode.repeat
    }
    if (typeof mode.shuffle === 'boolean') {
      const changed = shuffle.value !== mode.shuffle
      shuffle.value = mode.shuffle
      ensureShuffleOrder(changed)
    }
    publishState()
  }

  /**
   * 睡眠定时内部实现，接收一个绝对截止时间。
   *
   * 存绝对时间而不是「还剩多少分钟」：应用被切后台再回来、或进程被系统回收后
   * 重建，按剩余时长重新计时会把截止时间越推越晚。
   */
  function armSleepTimer(deadline: number, minutes: number | null): void {
    if (sleepTimer) clearTimeout(sleepTimer)
    if (sleepInterval) clearInterval(sleepInterval)
    sleepTimer = null
    sleepInterval = null
    sleepRemainingMs.value = null
    settings.settings.sleepTimerMinutes = minutes
    sleepDeadline = deadline
    if (!minutes || minutes <= 0) {
      sleepDeadline = 0
      return
    }
    const remaining = Math.max(0, deadline - Date.now())
    if (remaining <= 0) {
      // 到期了就直接暂停，不要挂一个立即触发的定时器。
      sleepDeadline = 0
      settings.settings.sleepTimerMinutes = null
      pause()
      return
    }
    sleepTimer = setTimeout(() => {
      pause()
      setSleepTimer(null)
    }, remaining)
    sleepRemainingMs.value = remaining
    sleepInterval = setInterval(() => {
      sleepRemainingMs.value = Math.max(0, sleepDeadline - Date.now())
    }, 1000)
  }

  function setSleepTimer(minutes: number | null): void {
    const plan = planSleepTimer(minutes, Date.now())
    if (!plan.deadline) {
      armSleepTimer(0, null)
      return
    }
    armSleepTimer(plan.deadline, minutes)
  }

  async function restoreIfAvailable(): Promise<void> {
    if (!queue.value.length) return
    const track = currentTrack.value ?? queue.value[0]
    currentIndex.value = queue.value.findIndex((item) => item.key === track.key)
    if (!track) return
    try {
      setStatus('loading')
      const source = await prepareSource(track)
      audio.src = source
      audio.playbackRate = playbackRate.value
      audio.load()
      positionMs.value = restorePositionMs
      durationMs.value = track.durationMs ?? 0
      setStatus('paused')
      await applyMetadata(track)
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (restorePositionMs > 0) {
            audio.currentTime = Math.min(restorePositionMs / 1000, durationMs.value / 1000 || restorePositionMs / 1000)
          }
        },
        { once: true }
      )
    } catch {
      setStatus('idle')
    }
  }

  function insertNext(track: Track): void {
    library.upsertTrack(track)
    const existing = queue.value.findIndex((item) => item.key === track.key)
    // 被移动的歌原本排在当前曲之前时，移除它会让当前曲的下标前移一位；
    // 不同步 currentIndex 的话，「下一首」会插到当前曲**后面两格**。
    const beforeCurrent = existing >= 0 && existing < currentIndex.value
    if (existing >= 0) queue.value.splice(existing, 1)
    if (beforeCurrent) currentIndex.value -= 1
    const insertAt = Math.max(0, currentIndex.value + 1)
    queue.value.splice(insertAt, 0, track)
    ensureShuffleOrder()
    publishQueue()
  }

  function insertTracksNext(tracks: Track[]): void {
    if (!tracks.length) return
    tracks.forEach((track) => library.upsertTrack(track))
    if (!queue.value.length) {
      queue.value = [...tracks]
      currentIndex.value = 0
      ensureShuffleOrder()
      publishQueue()
      return
    }
    const currentKey = currentTrack.value?.key
    const keySet = new Set(tracks.map((t) => t.key))
    queue.value = queue.value.filter((item) => !keySet.has(item.key) || item.key === currentKey)
    const curIdx = currentKey ? queue.value.findIndex((t) => t.key === currentKey) : 0
    currentIndex.value = curIdx >= 0 ? curIdx : 0
    const insertAt = currentIndex.value + 1
    const tracksToInsert = tracks.filter((t) => t.key !== currentKey)
    queue.value.splice(insertAt, 0, ...tracksToInsert)
    ensureShuffleOrder()
    publishQueue()
  }

  watch(
    () => [queue.value, currentIndex.value, repeat.value, shuffle.value, volume.value, muted.value, playbackRate.value],
    () => persistState(),
    { deep: true }
  )

  watch(
    // The background beat taps the same analyser, so it keeps the pipeline on.
    () =>
      settings.settings.audioVisualizer ||
      (settings.settings.playerBackgroundBeat &&
        backgroundSupportsBeat(settings.settings.playerBackgroundRenderer)),
    (enabled) => setAudioVisualizerEnabled(enabled),
    { immediate: true }
  )

  watch(
    () => settings.settings.seamlessTransition,
    (enabled) => {
      if (!enabled) cancelCrossfade()
    }
  )

  function hostState() {
    return {
      status: status.value === 'ended' ? 'ended' : status.value,
      track: currentTrack.value?.raw ?? null,
      positionMs: Math.round(positionMs.value),
      durationMs: Math.round(durationMs.value),
      volume: muted.value ? 0 : volume.value,
      muted: muted.value,
      playbackRate: playbackRate.value,
      repeat: repeat.value === 'one' ? 'one' : repeat.value === 'all' ? 'all' : 'off',
      shuffle: shuffle.value
    }
  }

  function hostQueue() {
    return {
      items: queue.value.map((track) => track.raw),
      currentIndex: currentIndex.value,
      // 与推送共用同一个计数器：`queue.get` 与 `queue.changed` 的版本号必须一致，
      // 否则插件按「revision 变了才刷新」判断时会漏掉变化。
      revision: String(queueRevision)
    }
  }

  async function hostPlay(entity: any): Promise<void> {
    if (!entity) return
    const source = entity.ref?.providerId
    const provider = source ? pluginStore.selectedProvider(source) : undefined
    const track = rawEntityToTrack(entity, provider?.pluginKey)
    await playTrack(track)
  }

  async function appendHostTracks(entities: any[]): Promise<void> {
    const next = [...queue.value]
    for (const entity of entities) {
      const source = entity.ref?.providerId
      const provider = source ? pluginStore.selectedProvider(source) : undefined
      const track = rawEntityToTrack(entity, provider?.pluginKey)
      if (!next.some((item) => item.key === track.key)) next.push(track)
    }
    queue.value = next
    ensureShuffleOrder()
    publishQueue()
  }

  async function replaceHostQueue(entities: any[]): Promise<void> {
    queue.value = entities.map((entity) => {
      const source = entity.ref?.providerId
      const provider = source ? pluginStore.selectedProvider(source) : undefined
      return rawEntityToTrack(entity, provider?.pluginKey)
    })
    currentIndex.value = 0
    ensureShuffleOrder()
    publishQueue()
  }

  function removeHostTracks(keys: string[]): void {
    if (!keys.length || !queue.value.length) return
    const removing = new Set(keys)
    const currentKey = currentTrack.value?.key
    const removingCurrent = !!currentKey && removing.has(currentKey)
    const wasActive = status.value === 'playing' || status.value === 'loading'
    const previousIndex = currentIndex.value
    queue.value = queue.value.filter((track) => !removing.has(track.key))
    ensureShuffleOrder()
    if (!queue.value.length) {
      currentIndex.value = -1
      if (removingCurrent) resetAudio()
      publishQueue()
      return
    }
    if (removingCurrent) {
      const nextIndex = Math.min(previousIndex, queue.value.length - 1)
      currentIndex.value = nextIndex
      publishQueue()
      void loadTrack(queue.value[nextIndex], wasActive)
      return
    }
    const nextIndex = currentKey
      ? queue.value.findIndex((track) => track.key === currentKey)
      : -1
    currentIndex.value = nextIndex >= 0 ? nextIndex : Math.min(previousIndex, queue.value.length - 1)
    publishQueue()
  }

  /**
   * 按 key 顺序重排队列。
   *
   * 调用方（拖动排序或插件的 `queue.reorder`）必须给出**完整**的 key 列表：
   * 此前直接按 keys 重建队列，少于当前队列长度时会把剩下的歌**静默丢弃**——
   * 插件少传一个 id，用户就少了一首歌，而且没有任何提示。
   */
  function reorderHostTracks(keys: string[]): void {
    const currentKey = currentTrack.value?.key
    const map = new Map(queue.value.map((track) => [track.key, track]))
    const next = keys.map((key) => map.get(key)).filter((track): track is Track => !!track)
    if (next.length !== queue.value.length) {
      // 与现有队列对不上（缺 key、重复 key 或含未知 key）时保持原样。
      return
    }
    queue.value = next
    const nextIndex = currentKey ? queue.value.findIndex((track) => track.key === currentKey) : -1
    currentIndex.value = nextIndex >= 0 ? nextIndex : Math.min(currentIndex.value, queue.value.length - 1)
    // 拖动排序只改队列展现顺序；洗牌顺序是独立的，成员没变就不该重洗，
    // 但要确保它与新队列仍然对得上（例如队列被截断）。
    ensureShuffleOrder()
    publishQueue()
  }

  function resetAudio(): void {
    cancelCrossfade()
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    cleanupObjectUrl()
    positionMs.value = 0
    durationMs.value = 0
    setStatus('idle')
  }

  function clearQueue(): void {
    resetAudio()
    queue.value = []
    currentIndex.value = -1
    // 队列清空后旧洗牌顺序全是失效 key，留着会让下一次播放拿到不存在的歌。
    ensureShuffleOrder()
    publishQueue()
  }

  function initMediaSession() {
    const attach = (action: any, handler: (details?: { seekTime?: number | null }) => void) => {
      if (Capacitor.isNativePlatform()) {
        void MediaSession.setActionHandler({ action }, handler).catch(() => undefined)
      }
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler(action, handler)
        } catch {
          // Unsupported action on this WebView.
        }
      }
    }
    attach('play', () => void resume())
    attach('pause', () => pause())
    attach('previoustrack', () => void previous())
    attach('nexttrack', () => void next())
    attach('stop', () => pause())
    attach('seekbackward', () => seek(positionMs.value - 10_000))
    attach('seekforward', () => seek(positionMs.value + 10_000))
    // 挂一个空处理器等于**吞掉**系统发来的跳转：车机、耳机线控、
    // 通知栏进度条的拖动都会静默无效。这里按系统给的 seekTime 落位。
    attach('seekto', (details?: { seekTime?: number | null }) => {
      const time = Number(details?.seekTime)
      if (!Number.isFinite(time) || time < 0) return
      seek(time * 1000)
    })
  }

  initMediaSession()

  return {
    getAudioElement: () => audio,
    queue,
    currentIndex,
    status,
    positionMs,
    durationMs,
    volume,
    muted,
    playbackRate,
    repeat,
    shuffle,
    error,
    loading,
    currentTrack,
    hasNext,
    hasPrevious,
    isPlaying,
    progress,
    sleepRemainingMs,
    playTrack,
    reloadCurrentTrack,
    toggle,
    pause,
    resume,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    audioElement,
    canSelectOutput,
    applyOutputDevice,
    applyStoredOutputDevice,
    next,
    previous,
    toggleShuffle,
    cycleRepeat,
    setMode,
    setSleepTimer,
    insertNext,
    insertTracksNext,
    loadPersisted,
    persistState,
    restoreIfAvailable,
    hostState,
    hostQueue,
    hostPlay,
    appendHostTracks,
    replaceHostQueue,
    removeHostTracks,
    reorderHostTracks,
    clearQueue
  }
})

