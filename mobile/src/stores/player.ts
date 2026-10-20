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
import {
  bindAudioPipelineElement,
  isAudioEffectsActive,
  setAudioVisualizerEnabled
} from '@/services/audioEffects'
import { cancelVolumeTransition, transitionVolume } from '@/services/volumeTransition'
import { isListenTogetherPlaybackActive } from '@/services/playbackContext'

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
  const shuffleOrder = ref<number[]>([])
  const error = ref<string | null>(null)
  const loading = computed(() => status.value === 'loading')
  const currentTrack = computed(() => queue.value[currentIndex.value] ?? null)
  const hasNext = computed(() => {
    if (!queue.value.length) return false
    if (repeat.value === 'all') return true
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
      shuffle: shuffle.value
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
      if (Array.isArray(saved.queue)) queue.value = saved.queue
      currentIndex.value = Number.isFinite(saved.currentIndex) ? saved.currentIndex : queue.value.length ? 0 : -1
      if (currentIndex.value >= queue.value.length) currentIndex.value = queue.value.length - 1
      restorePositionMs = Number(saved.positionMs) || 0
      volume.value = Number.isFinite(saved.volume) ? saved.volume : 0.8
      muted.value = !!saved.muted
      playbackRate.value = Math.max(0.5, Math.min(3, Number(saved.playbackRate) || 1))
      repeat.value = saved.repeat === 'one' || saved.repeat === 'all' ? saved.repeat : 'off'
      shuffle.value = !!saved.shuffle
      audio.volume = volume.value
      audio.muted = muted.value
    } catch {
      // Ignore malformed state from an older build.
    }
  }

  function cleanupObjectUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
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

  function publishQueue() {
    pluginStore.publishQueue({
      items: queue.value.map((track) => track.raw),
      currentIndex: currentIndex.value,
      revision: String(Date.now())
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
          const blob = await responseToBlob(response.data, String(mime))
          cleanupObjectUrl()
          objectUrl = URL.createObjectURL(blob)
          return objectUrl
        }
        const response = await fetch(resolved.url, { headers: resolved.requestHeaders })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
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

  async function loadTrack(track: Track, autoplay = true): Promise<void> {
    if (resolving) return
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
      positionMs.value = 0
      await applyMetadata(track)
      if (autoplay) {
        await audio.play()
        setStatus('playing')
      } else {
        setStatus('paused')
      }
      void library.recordHistory(track)
    persistState()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      setStatus('error')
      throw cause
    } finally {
      resolving = false
    }
  }

  async function playTrack(track: Track, nextQueue?: Track[]): Promise<void> {
    library.upsertTrack(track)
    if (nextQueue?.length) {
      const index = nextQueue.findIndex((item) => item.key === track.key)
      queue.value = nextQueue
      currentIndex.value = index >= 0 ? index : 0
      shuffleOrder.value = nextQueue.map((_, i) => i)
      publishQueue()
    } else if (!queue.value.some((item) => item.key === track.key)) {
      queue.value = [track, ...queue.value]
      currentIndex.value = 0
      shuffleOrder.value = queue.value.map((_, i) => i)
      publishQueue()
    } else {
      currentIndex.value = queue.value.findIndex((item) => item.key === track.key)
    }
    await loadTrack(track, true)
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

  function setPlaybackRate(value: number): void {
    if (!Number.isFinite(value)) return
    playbackRate.value = Math.max(0.5, Math.min(3, Math.round(value * 100) / 100))
    audio.playbackRate = playbackRate.value
    persistState()
    publishState()
    void updateNativePosition()
  }

  function nextIndex(): number {
    if (!queue.value.length) return -1
    if (shuffle.value && queue.value.length > 1) {
      const candidates = shuffleOrder.value.filter((index) => index !== currentIndex.value)
      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]
        return pick
      }
    }
    if (currentIndex.value < queue.value.length - 1) return currentIndex.value + 1
    return repeat.value === 'all' ? 0 : -1
  }

  async function next(): Promise<void> {
    const index = nextIndex()
    if (index < 0) return
    currentIndex.value = index
    publishQueue()
    await loadTrack(queue.value[index], true)
  }

  async function previous(): Promise<void> {
    if (positionMs.value > 3000) {
      seek(0)
      return
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
    if (shuffle.value) {
      shuffleOrder.value = queue.value.map((_, index) => index).sort(() => Math.random() - 0.5)
    }
    publishState()
  }

  function cycleRepeat(): void {
    repeat.value = repeat.value === 'off' ? 'all' : repeat.value === 'all' ? 'one' : 'off'
    publishState()
  }

  function setMode(mode: { repeat?: RepeatMode; shuffle?: boolean } | undefined): void {
    if (!mode) return
    if (mode.repeat) repeat.value = mode.repeat
    if (typeof mode.shuffle === 'boolean') {
      shuffle.value = mode.shuffle
      if (mode.shuffle) {
        shuffleOrder.value = queue.value.map((_, index) => index).sort(() => Math.random() - 0.5)
      }
    }
    publishState()
  }

  function setSleepTimer(minutes: number | null): void {
    if (sleepTimer) clearTimeout(sleepTimer)
    if (sleepInterval) clearInterval(sleepInterval)
    sleepTimer = null
    sleepInterval = null
    sleepRemainingMs.value = null
    settings.settings.sleepTimerMinutes = minutes
    if (!minutes || minutes <= 0) return
    sleepDeadline = Date.now() + minutes * 60_000
    sleepTimer = setTimeout(() => {
      pause()
      setSleepTimer(null)
    }, minutes * 60_000)
    sleepInterval = setInterval(() => {
      sleepRemainingMs.value = Math.max(0, sleepDeadline - Date.now())
    }, 1000)
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
    if (existing >= 0) queue.value.splice(existing, 1)
    const insertAt = Math.max(0, currentIndex.value + 1)
    queue.value.splice(insertAt, 0, track)
    shuffleOrder.value = queue.value.map((_, index) => index)
    publishQueue()
  }

  function insertTracksNext(tracks: Track[]): void {
    if (!tracks.length) return
    tracks.forEach((track) => library.upsertTrack(track))
    if (!queue.value.length) {
      queue.value = [...tracks]
      currentIndex.value = 0
      shuffleOrder.value = queue.value.map((_, index) => index)
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
    shuffleOrder.value = queue.value.map((_, index) => index)
    publishQueue()
  }

  watch(
    () => [queue.value, currentIndex.value, repeat.value, shuffle.value, volume.value, muted.value, playbackRate.value],
    () => persistState(),
    { deep: true }
  )

  watch(
    () => settings.settings.audioVisualizer,
    (enabled) => setAudioVisualizerEnabled(enabled),
    { immediate: true }
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
      revision: String(queue.value.length + currentIndex.value)
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
    shuffleOrder.value = next.map((_, index) => index)
    publishQueue()
  }

  async function replaceHostQueue(entities: any[]): Promise<void> {
    queue.value = entities.map((entity) => {
      const source = entity.ref?.providerId
      const provider = source ? pluginStore.selectedProvider(source) : undefined
      return rawEntityToTrack(entity, provider?.pluginKey)
    })
    currentIndex.value = 0
    shuffleOrder.value = queue.value.map((_, index) => index)
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
    shuffleOrder.value = queue.value.map((_, index) => index)
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

  function reorderHostTracks(keys: string[]): void {
    const currentKey = currentTrack.value?.key
    const map = new Map(queue.value.map((track) => [track.key, track]))
    queue.value = keys.map((key) => map.get(key)).filter((track): track is Track => !!track)
    const nextIndex = currentKey ? queue.value.findIndex((track) => track.key === currentKey) : -1
    currentIndex.value = nextIndex >= 0 ? nextIndex : Math.min(currentIndex.value, queue.value.length - 1)
    publishQueue()
  }

  function resetAudio(): void {
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
    publishQueue()
  }

  function initMediaSession() {
    const attach = (action: any, handler: () => void) => {
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
    attach('seekto', () => undefined)
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
    toggle,
    pause,
    resume,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
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

