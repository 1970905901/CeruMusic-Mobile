import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { Playlist, FavoriteEntry, HistoryEntry, Track } from '@/types/music'
import type { LocalTrackRecord } from '@/types/download'
import { getDb, toPlain } from '@/services/db'
import { useSettingsStore } from '@/stores/settings'
import { usePluginStore } from '@/stores/plugins'
import { lyricValueToLrc } from '@/services/lyrics'
import { base64ToArrayBuffer, isFlacFile, isMp3File, writeFlacTagsToBase64, writeMp3TagsToBase64 } from '@/services/audioTags'
import { isM4aFile, writeM4aTagsToBase64 } from '@/services/mp4Tags'
import { cloudSongListApi, playlistTracksToCloud } from '@/services/cloudSongList'
import { playlistKeyCandidates, playlistKeyMatches } from '@/services/playlistKeys'
import { paginate } from '@/services/plugin/paging'
import { blobToDataUrl } from '@/services/imageUtils'

/** 播放历史上限，与桌面版 GlobalPlayStatus 保持一致。 */
export const HISTORY_LIMIT = 200

/**
 * 单个本地音频文件的导入上限。
 *
 * 导入路径会把整个文件读进内存、再转成 base64 写进 IndexedDB，峰值内存约是
 * 文件大小的 2–3 倍。没有上限时，误选一个几百 MB 的无损文件就能让 WebView
 * 直接因内存不足崩溃，且没有任何提示。200 MB 已覆盖绝大多数无损单曲。
 */
export const MAX_LOCAL_IMPORT_BYTES = 200 * 1024 * 1024
/** 插件导入器单次导入的页数上限（每页 100 首，够导入一万首）。 */
export const MAX_IMPORT_PAGES = 200

/**
 * 把新记录并入历史：同 key 只保留最新一条，并裁剪到上限。
 * 抽成纯函数，是为了让「去重 + 上限」这条规则可以被断言，而不是埋在 store 里。
 */
export function mergeHistoryEntry<T extends { id: string; track: { key: string } }>(
  current: readonly T[],
  entry: T,
  limit: number = HISTORY_LIMIT
): T[] {
  const rest = current.filter((item) => item.track.key !== entry.track.key)
  return [entry, ...rest].slice(0, Math.max(1, limit))
}

/**
 * 找出应删除的历史记录 id：同一首歌除最新一条外都要清掉。
 * existing 的顺序即写入顺序，保留最后一个。
 */
export function planHistoryCleanup<T extends { id: string; track: { key: string } }>(
  existing: readonly T[],
  key: string
): string[] {
  const matches = existing.filter((item) => item.track.key === key)
  if (matches.length <= 1) return []
  return matches.slice(0, matches.length - 1).map((item) => item.id)
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(blob)
  })
}

function extFromName(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : 'bin'
}

export interface UpdatePlaylistOptions {
  name?: string
  description?: string
  cover?: string | null
}

export interface ScanLocalOptions {
  minSizeKb?: number
  minDurationSec?: number
}

export interface ScanLocalResult extends Array<LocalTrackRecord> {
  imported: LocalTrackRecord[]
  skippedCount: number
  filteredSizeCount: number
  filteredDurationCount: number
}

export interface ImportLocalOptions {
  sourcePath?: string
  minSizeKb?: number
  minDurationSec?: number
  preParsed?: {
    title?: string
    artist?: string
    album?: string
    year?: number
    genre?: string
    durationMs?: number
    cover?: string
  }
}

function localTrackToTrack(record: LocalTrackRecord): Track {
  return {
    key: record.key,
    ref: { providerId: 'local', kind: 'track', id: record.key, scope: 'provider' },
    title: record.title,
    subtitle: record.artist,
    artists: record.artist ? record.artist.split(/\s*\/\s*/).filter(Boolean) : ['未知艺术家'],
    album: record.album,
    durationMs: record.durationMs,
    artworkUrl: record.cover,
    qualities: [],
    playable: true,
    raw: {
      local: true,
      lrc: record.lyrics || null,
      year: record.year,
      genre: record.genre
    },
    localUri: Capacitor.convertFileSrc(record.path),
    localPath: record.path,
    localRelativePath: record.relativePath,
    source: 'local'
  }
}


export const useLibraryStore = defineStore('library', () => {
  const pluginStore = usePluginStore()
  const settingsStore = useSettingsStore()
  const favorites = ref<FavoriteEntry[]>([])
  const playlists = ref<Playlist[]>([])
  const history = ref<HistoryEntry[]>([])
  const localRecords = ref<LocalTrackRecord[]>([])
  const tracks = ref<Record<string, Track>>({})
  const initialized = ref(false)
  const importingLocal = ref(false)

  const favoriteKeys = computed(() => new Set(favorites.value.map((item) => item.key)))
  const recentTracks = computed(() => history.value.map((item) => item.track))
  const localTracks = computed(() => localRecords.value.map(localTrackToTrack))

  async function init(): Promise<void> {
    if (initialized.value) return
    const db = await getDb()
    const [favoriteRows, playlistRows, historyRows, localRows, trackRows] = await Promise.all([
      db.getAll('favorites'),
      db.getAll('playlists'),
      db.getAll('history'),
      db.getAll('localTracks'),
      db.getAll('tracks')
    ])
    favorites.value = favoriteRows.sort((a, b) => b.createdAt - a.createdAt)
    playlists.value = playlistRows.sort((a, b) => b.updatedAt - a.updatedAt)
    // 历史上限与写入路径共用 HISTORY_LIMIT：此前初始化读 300 条、写入只留 200 条，
    // 重启后多出来的 100 条旧记录会短暂出现在「最近」里，再被下一次播放挤掉。
    history.value = historyRows.sort((a, b) => b.playedAt - a.playedAt).slice(0, HISTORY_LIMIT)
    localRecords.value = localRows.sort((a, b) => b.createdAt - a.createdAt)
    for (const track of trackRows) tracks.value[track.key] = track
    for (const favorite of favorites.value) tracks.value[favorite.track.key] = favorite.track
    for (const entry of history.value) tracks.value[entry.track.key] = entry.track
    for (const record of localRecords.value) tracks.value[record.key] = localTrackToTrack(record)
    initialized.value = true
  }

  function upsertTrack(track: Track): Track {
    tracks.value = { ...tracks.value, [track.key]: track }
    return track
  }

  function getTrack(key: string): Track | undefined {
    const existing = tracks.value[key]
    if (existing) return existing
    const record = localRecords.value.find((item) => item.key === key)
    return record ? localTrackToTrack(record) : undefined
  }

  /**
   * 是否已收藏。参数既可能是完整 Track（带 key），也可能是插件传来的 ref。
   *
   * 私有资源的 Track key 是 `pluginId:providerId:id`，而 ref 里只有
   * `providerId`/`id` 时拼出来的是 `providerId:id`——只认一种形状会让
   * 插件对私有歌曲的 `favorites.contains` 永远返回 false，进而重复收藏。
   */
  function isFavorite(trackOrRef: Track | any): boolean {
    const explicitKey = typeof trackOrRef?.key === 'string' ? trackOrRef.key : undefined
    const candidates = playlistKeyCandidates(
      trackOrRef?.ref ?? trackOrRef,
      explicitKey
    )
    if (!candidates.length) return false
    return candidates.some((key) => favoriteKeys.value.has(key))
  }

  async function toggleFavorite(track: Track): Promise<boolean> {
    upsertTrack(track)
    const db = await getDb()
    // 收藏可能以另一种 key 形态存着（插件私有资源 vs 公共 provider 资源），
    // 判定用是候选集合，删除也必须按同一集合来，否则会出现
    // 「判定为已收藏 → 删不到 → 告诉调用方已取消，列表却没变」。
    const stored = favorites.value.filter((item) =>
      playlistKeyMatches(item.key, track.ref, track.key)
    )
    if (stored.length) {
      for (const item of stored) await db.delete('favorites', item.key)
      const removed = new Set(stored.map((item) => item.key))
      favorites.value = favorites.value.filter((item) => !removed.has(item.key))
      return false
    }
    const entry: FavoriteEntry = { key: track.key, track, createdAt: Date.now() }
    await db.put('favorites', toPlain(entry))
    favorites.value = [entry, ...favorites.value]
    return true
  }

  async function addFavorite(track: Track): Promise<void> {
    if (!isFavorite(track)) await toggleFavorite(track)
  }

  async function removeFavorite(track: Track): Promise<void> {
    if (isFavorite(track)) await toggleFavorite(track)
  }

  function createPlaylist(name: string, description = ''): Playlist {
    const playlist: Playlist = {
      id: uid('playlist'),
      name: name.trim() || '新建歌单',
      description,
      trackKeys: [],
      source: 'local',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    playlists.value = [playlist, ...playlists.value]
    void getDb().then((db) => db.put('playlists', toPlain(playlist)))
    return playlist
  }

  function getPlaylistCover(playlistOrId: Playlist | string): string | undefined {
    const playlist =
      typeof playlistOrId === 'string'
        ? playlists.value.find((item) => item.id === playlistOrId)
        : playlistOrId
    if (!playlist) return undefined
    if (playlist.cover) return playlist.cover
    const pTracks = playlistTracks(playlist.id)
    return pTracks.find((item) => item.artworkUrl)?.artworkUrl
  }

  async function updatePlaylist(
    id: string,
    updates: UpdatePlaylistOptions
  ): Promise<Playlist | null> {
    const playlist = playlists.value.find((item) => item.id === id)
    if (!playlist) return null

    let changed = false
    if (typeof updates.name === 'string') {
      const trimmed = updates.name.trim()
      if (trimmed && trimmed !== playlist.name) {
        playlist.name = trimmed
        changed = true
      }
    }
    if (updates.description !== undefined) {
      const trimmedDesc = updates.description.trim()
      if (trimmedDesc !== (playlist.description || '')) {
        playlist.description = trimmedDesc
        changed = true
      }
    }
    if (updates.cover !== undefined) {
      const nextCover = updates.cover?.trim() || undefined
      if (nextCover !== playlist.cover) {
        playlist.cover = nextCover
        changed = true
      }
    }

    if (changed) {
      playlist.updatedAt = Date.now()
      const db = await getDb()
      await db.put('playlists', toPlain(playlist))
      pluginStore.publishLibrary({ id: playlist.id, location: 'local' }, 'updated')

      if (playlist.cloudId) {
        try {
          const fullTracks = playlistTracks(playlist.id)
          const songlist = playlistTracksToCloud(fullTracks)
          const effectiveCover = playlist.cover || fullTracks.find((t) => t.artworkUrl)?.artworkUrl
          await cloudSongListApi.updateUserSongList({
            listId: playlist.cloudId,
            name: playlist.name,
            describe: playlist.description || '',
            cover: effectiveCover,
            songlist
          })
        } catch (err) {
          console.warn('同步更新云端歌单失败:', err)
        }
      }
    }

    return playlist
  }

  async function renamePlaylist(id: string, name: string): Promise<void> {
    await updatePlaylist(id, { name })
  }

  async function deletePlaylist(id: string): Promise<void> {
    const db = await getDb()
    await db.delete('playlists', id)
    playlists.value = playlists.value.filter((item) => item.id !== id)
  }

  async function addTrackToPlaylist(playlistId: string, track: Track): Promise<void> {
    const playlist = playlists.value.find((item) => item.id === playlistId)
    if (!playlist) return
    upsertTrack(track)
    if (!playlist.trackKeys.includes(track.key)) playlist.trackKeys.push(track.key)
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
    pluginStore.publishLibrary({ id: playlist.id, location: 'local' }, 'updated')
  }

  async function addTracksToPlaylist(playlistId: string, tracksToAdd: Track[]): Promise<number> {
    const playlist = playlists.value.find((item) => item.id === playlistId)
    if (!playlist || !tracksToAdd.length) return 0
    let added = 0
    for (const track of tracksToAdd) {
      upsertTrack(track)
      if (!playlist.trackKeys.includes(track.key)) {
        playlist.trackKeys.push(track.key)
        added++
      }
    }
    if (added > 0) {
      playlist.updatedAt = Date.now()
      const db = await getDb()
      await db.put('playlists', toPlain(playlist))
      pluginStore.publishLibrary({ id: playlist.id, location: 'local' }, 'updated')
    }
    return added
  }

  async function removeTracksFromPlaylist(playlistId: string, trackKeys: string[]): Promise<number> {
    const playlist = playlists.value.find((item) => item.id === playlistId)
    if (!playlist || !trackKeys.length) return 0
    const keySet = new Set(trackKeys)
    const initialLen = playlist.trackKeys.length
    playlist.trackKeys = playlist.trackKeys.filter((key) => !keySet.has(key))
    const removed = initialLen - playlist.trackKeys.length
    if (removed > 0) {
      playlist.updatedAt = Date.now()
      const db = await getDb()
      await db.put('playlists', toPlain(playlist))
      pluginStore.publishLibrary({ id: playlist.id, location: 'local' }, 'updated')
    }
    return removed
  }

  async function removeTrackFromPlaylist(playlistId: string, trackKey: string): Promise<void> {
    const playlist = playlists.value.find((item) => item.id === playlistId)
    if (!playlist) return
    playlist.trackKeys = playlist.trackKeys.filter((key) => key !== trackKey)
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
    pluginStore.publishLibrary({ id: playlist.id, location: 'local' }, 'updated')
  }

  async function reorderPlaylist(playlistId: string, keys: string[]): Promise<void> {
    const playlist = playlists.value.find((item) => item.id === playlistId)
    if (!playlist) return
    playlist.trackKeys = keys.filter((key) => playlist.trackKeys.includes(key))
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
  }

  function playlistTracks(playlistId: string): Track[] {
    const playlist = playlists.value.find((item) => item.id === playlistId)
    if (!playlist) return []
    return playlist.trackKeys.map((key) => getTrack(key)).filter((item): item is Track => !!item)
  }

  async function recordHistory(track: Track): Promise<void> {
    upsertTrack(track)
    const entry: HistoryEntry = {
      id: `${track.key}:${Date.now()}`,
      track,
      playedAt: Date.now()
    }
    const db = await getDb()
    const existing = await db.getAll('history')
    // 历史只保留每首歌最新一条（与桌面版 GlobalPlayStatus 同口径），多余记录一并清理，
    // 避免旧实现「先删 3 条再按 key 去重」两套规则互相矛盾。
    const stale = planHistoryCleanup(existing, track.key)
    for (const id of stale) await db.delete('history', id)
    await db.put('history', toPlain(entry))
    history.value = mergeHistoryEntry(history.value, entry) as HistoryEntry[]
  }

  async function clearHistory(): Promise<void> {
    const db = await getDb()
    await db.clear('history')
    history.value = []
  }

  async function removeFromHistory(keyOrId: string): Promise<void> {
    const db = await getDb()
    const existing = await db.getAll('history')
    const matches = existing.filter((item) => item.id === keyOrId || item.track.key === keyOrId)
    for (const item of matches) await db.delete('history', item.id)
    history.value = history.value.filter(
      (item) => item.id !== keyOrId && item.track.key !== keyOrId
    )
  }

  const AUDIO_EXTENSIONS = new Set([
    'mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'webm', 'wma', 'aiff', 'aif', 'alac'
  ])

  function isAudioFileName(name: string): boolean {
    const ext = extFromName(name)
    return AUDIO_EXTENSIONS.has(ext)
  }

  function mimeForAudio(name: string): string {
    const ext = extFromName(name)
    const values: Record<string, string> = {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      flac: 'audio/flac',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      opus: 'audio/opus',
      webm: 'audio/webm',
      wma: 'audio/x-ms-wma',
      aiff: 'audio/aiff',
      aif: 'audio/aiff',
      alac: 'audio/mp4'
    }
    return values[ext] || 'audio/mpeg'
  }

  /**
   * 导入单个本地文件，并说明「没导入」的原因。
   *
   * `importLocalFile` 历史上只返回 null，调用方分不清「重复」与「被时长过滤」，
   * 于是 SAF 导入只能笼统报「跳过/过滤」。需要区分的调用方用这个版本。
   */
  async function importLocalFileWithReason(
    file: File,
    options: ImportLocalOptions = {}
  ): Promise<{ record: LocalTrackRecord | null; reason?: 'size' | 'duration' | 'duplicate' }> {
    return importLocalFileCore(file, options)
  }

  async function importLocalFile(
    file: File,
    options: ImportLocalOptions = {}
  ): Promise<LocalTrackRecord | null> {
    return (await importLocalFileCore(file, options)).record
  }

  async function importLocalFileCore(
    file: File,
    options: ImportLocalOptions = {}
  ): Promise<{ record: LocalTrackRecord | null; reason?: 'size' | 'duration' | 'duplicate' }> {
    if (options.minSizeKb && options.minSizeKb > 0 && file.size > 0 && file.size < options.minSizeKb * 1024) {
      return { record: null, reason: 'size' }
    }
    if (file.size > MAX_LOCAL_IMPORT_BYTES) {
      throw new Error(
        `文件超过 ${Math.round(MAX_LOCAL_IMPORT_BYTES / 1024 / 1024)} MB，请压缩后再导入`
      )
    }
    const existing = options.sourcePath
      ? localRecords.value.find((item) => item.sourcePath === options.sourcePath)
      : undefined
    if (existing && existing.size === file.size && file.size > 0) {
      return { record: null, reason: 'duplicate' }
    }

    let title = options.preParsed?.title || file.name.replace(/\.[^.]+$/, '')
    let artist = options.preParsed?.artist || '未知艺术家'
    let album: string | undefined = options.preParsed?.album
    let year: number | undefined = options.preParsed?.year
    let genre: string | undefined = options.preParsed?.genre
    let durationMs: number | undefined = options.preParsed?.durationMs
    let cover: string | undefined = options.preParsed?.cover

    if (!options.preParsed) {
      try {
        const { parseBlob } = await import('music-metadata-browser')
        const metadata = await parseBlob(file, { skipCovers: false })
        title = metadata.common.title || title
        artist = metadata.common.artist || (metadata.common.artists ?? []).join(' / ') || artist
        album = metadata.common.album || undefined
        year = metadata.common.year || undefined
        genre = (metadata.common.genre ?? []).filter(Boolean).join(' / ') || undefined
        durationMs = metadata.format.duration ? Math.round(metadata.format.duration * 1000) : undefined
        const picture = metadata.common.picture?.[0]
        if (picture) {
          const blob = new Blob([new Uint8Array(picture.data) as unknown as BlobPart], {
            type: picture.format
          })
          cover = await blobToDataUrl(blob)
        }
      } catch {
        // Metadata is optional; the file remains playable with its filename.
      }
    }

    if (
      options.minDurationSec &&
      options.minDurationSec > 0 &&
      durationMs !== undefined &&
      durationMs < options.minDurationSec * 1000
    ) {
      return { record: null, reason: 'duration' }
    }

    const key = uid('local')
    const ext = extFromName(file.name)
    const path = `local/${key}.${ext}`
    const data = await blobToBase64(file)
    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Data,
      recursive: true
    })
    const uri = await Filesystem.getUri({ path, directory: Directory.Data })
    const record: LocalTrackRecord = {
      key,
      title,
      artist,
      album,
      year,
      genre,
      durationMs,
      fileName: file.name,
      path: uri.uri,
      relativePath: path,
      sourcePath: options.sourcePath,
      mime: file.type || mimeForAudio(file.name),
      cover,
      size: file.size,
      createdAt: Date.now()
    }
    const db = await getDb()
    await db.put('localTracks', toPlain(record))
    localRecords.value = [record, ...localRecords.value]
    tracks.value = { ...tracks.value, [record.key]: localTrackToTrack(record) }
    return { record }
  }

  /**
   * 批量导入本地文件。
   *
   * 单个文件失败不中断整批；失败原因挂在返回数组的 `failed` 上，
   * 由界面一并提示——此前只写 console.warn，用户完全不知道
   * 某个文件为什么没进来（过大、格式不支持、存储写满）。
   */
  async function importLocalFiles(
    files: File[]
  ): Promise<LocalTrackRecord[] & { failed: Array<{ name: string; message: string }> }> {
    importingLocal.value = true
    const imported: LocalTrackRecord[] = []
    const failed: Array<{ name: string; message: string }> = []
    try {
      for (const file of files) {
        try {
          const record = await importLocalFile(file)
          if (record) imported.push(record)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.warn('导入本地歌曲失败', file.name, error)
          failed.push({ name: file.name, message })
        }
      }
      return Object.assign(imported, { failed })
    } finally {
      importingLocal.value = false
    }
  }

  function pickLocalFiles(): Promise<LocalTrackRecord[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'audio/*'
      input.multiple = true
      input.style.display = 'none'
      document.body.appendChild(input)
      input.onchange = async () => {
        const files = Array.from(input.files ?? [])
        input.remove()
        resolve(await importLocalFiles(files))
      }
      input.oncancel = () => {
        input.remove()
        resolve([])
      }
      input.click()
    })
  }

  interface ScannedAudioFile {
    path: string
    name: string
    size: number
    directory: Directory
  }

  async function collectAudioFiles(
    path: string,
    directory: Directory,
    depth: number,
    output: ScannedAudioFile[],
    minSizeKb = 0,
    stats?: { filteredSizeCount: number }
  ): Promise<void> {
    if (depth > 8 || output.length >= 2000) return
    let entries: any[] = []
    try {
      const result = await Filesystem.readdir({ path, directory })
      entries = result.files ?? []
    } catch {
      return
    }
    for (const entry of entries) {
      if (output.length >= 2000) return
      if (!path && ['local', 'downloads', 'exports'].includes(String(entry.name))) continue
      const childPath = path ? `${path}/${entry.name}` : entry.name
      if (entry.type === 'directory') {
        await collectAudioFiles(childPath, directory, depth + 1, output, minSizeKb, stats)
      } else if (isAudioFileName(entry.name)) {
        const size = Number(entry.size) || 0
        if (minSizeKb > 0 && size > 0 && size < minSizeKb * 1024) {
          if (stats) stats.filteredSizeCount++
          continue
        }
        output.push({
          path: childPath,
          name: entry.name,
          size,
          directory
        })
      }
    }
  }

  async function scanLocalMusic(options?: ScanLocalOptions): Promise<ScanLocalResult> {
    importingLocal.value = true
    const imported: LocalTrackRecord[] = []
    let filteredSizeCount = 0
    let filteredDurationCount = 0
    let skippedExistingCount = 0

    const minSizeKb = options?.minSizeKb ?? settingsStore.settings.localScanFilterMinSizeKb ?? 100
    const minDurationSec = options?.minDurationSec ?? settingsStore.settings.localScanFilterMinDurationSec ?? 30

    try {
      const directories: Directory[] = [Directory.Documents]
      if (Capacitor.getPlatform() === 'android') directories.push(Directory.External)
      const files: ScannedAudioFile[] = []
      const stats = { filteredSizeCount: 0 }
      for (const directory of directories) {
        await collectAudioFiles('', directory, 0, files, minSizeKb, stats)
      }
      filteredSizeCount += stats.filteredSizeCount

      for (const file of files) {
        try {
          if (minSizeKb > 0 && file.size > 0 && file.size < minSizeKb * 1024) {
            filteredSizeCount++
            continue
          }
          const sourcePath = `${file.directory}:${file.path}`
          const existing = localRecords.value.find(
            (item) =>
              item.sourcePath === sourcePath ||
              (item.fileName === file.name && item.size === file.size && file.size > 0)
          )
          if (existing && existing.size === file.size && file.size > 0) {
            skippedExistingCount++
            continue
          }
          const data = await Filesystem.readFile({ path: file.path, directory: file.directory })
          const base64 = typeof data.data === 'string' ? data.data : ''
          const bytes = new Uint8Array(base64ToArrayBuffer(base64))
          if (file.size === 0 && minSizeKb > 0 && bytes.byteLength < minSizeKb * 1024) {
            filteredSizeCount++
            continue
          }

          const blob = new Blob([bytes], { type: mimeForAudio(file.name) })
          const fileObj = new File([blob], file.name, { type: mimeForAudio(file.name) })

          let title = file.name.replace(/\.[^.]+$/, '')
          let artist = '未知艺术家'
          let album: string | undefined
          let year: number | undefined
          let genre: string | undefined
          let durationMs: number | undefined
          let cover: string | undefined

          try {
            const { parseBlob } = await import('music-metadata-browser')
            const metadata = await parseBlob(fileObj, { skipCovers: false })
            title = metadata.common.title || title
            artist = metadata.common.artist || (metadata.common.artists ?? []).join(' / ') || artist
            album = metadata.common.album || undefined
            year = metadata.common.year || undefined
            genre = (metadata.common.genre ?? []).filter(Boolean).join(' / ') || undefined
            durationMs = metadata.format.duration ? Math.round(metadata.format.duration * 1000) : undefined
            const picture = metadata.common.picture?.[0]
            if (picture) {
              const picBlob = new Blob([new Uint8Array(picture.data) as unknown as BlobPart], {
                type: picture.format
              })
              cover = await blobToDataUrl(picBlob)
            }
          } catch {
            // Metadata is optional
          }

          if (minDurationSec > 0 && durationMs !== undefined && durationMs < minDurationSec * 1000) {
            filteredDurationCount++
            continue
          }

          const record = await importLocalFile(fileObj, {
            sourcePath,
            preParsed: {
              title,
              artist,
              album,
              year,
              genre,
              durationMs,
              cover
            }
          })
          if (record) {
            imported.push(record)
          } else {
            skippedExistingCount++
          }
        } catch (error) {
          console.warn('扫描本地歌曲失败', file.path, error)
        }
      }
      const skippedCount = filteredSizeCount + filteredDurationCount + skippedExistingCount
      const result = Object.assign(imported, {
        imported,
        skippedCount,
        filteredSizeCount,
        filteredDurationCount
      })
      return result as ScanLocalResult
    } finally {
      importingLocal.value = false
    }
  }
  async function deleteLocalTrack(key: string): Promise<void> {
    const record = localRecords.value.find((item) => item.key === key)
    if (!record) return
    try {
      await Filesystem.deleteFile({ path: record.relativePath || record.path, directory: Directory.Data })
    } catch {
      // The file may already have been removed by the system.
    }
    const db = await getDb()
    await db.delete('localTracks', key)
    localRecords.value = localRecords.value.filter((item) => item.key !== key)
    const next = { ...tracks.value }
    delete next[key]
    tracks.value = next
  }

  /**
   * 分页返回本地歌单。
   *
   * 与曲目列表同一套游标语义：此前同样忽略 cursor、每次返回全部，
   * 插件按 `nextCursor` 翻页时要么停在第一页、要么无限重复。
   */
  function asHostPlaylists(cursor?: string, limit?: number) {
    const page = paginate(
      playlists.value.map((playlist) => ({
        ref: { id: playlist.id, location: 'local' as const },
        name: playlist.name,
        description: playlist.description,
        trackCount: playlist.trackKeys.length,
        writable: true
      })),
      cursor,
      limit
    )
    if (!page) throw new Error('分页游标无效')
    return page
  }

  /** 分页返回歌单曲目；游标非法时抛错，避免插件翻页死循环。 */
  function asHostTracks(reference: any, cursor?: string, limit?: number) {
    const playlist = playlists.value.find((item) => item.id === reference?.id)
    if (!playlist) return { items: [], totalEstimate: 0 }
    const page = paginate(
      playlistTracks(playlist.id).map((track) => track.raw),
      cursor,
      limit
    )
    if (!page) throw new Error('分页游标无效')
    return page
  }

  async function importHostPlaylist(request: any) {
    const playlist = createPlaylist(request?.suggestedName || '导入歌单')
    let added = 0
    for (const entity of request?.items ?? []) {
      try {
        const track = entity.ref?.kind === 'track'
          ? {
              key: `${entity.ref.scope === 'provider' ? entity.ref.providerId : 'import'}:${entity.ref.id}`,
              ref: entity.ref,
              title: entity.title,
              subtitle: entity.subtitle,
              artists: entity.metadata?.artists ?? [],
              album: entity.metadata?.album?.title,
              durationMs: entity.durationMs ?? entity.metadata?.durationMs,
              artworkUrl: entity.metadata?.artworkUrl,
              qualities: entity.metadata?.qualities ?? [],
              playable: entity.playable !== false,
              raw: entity,
              source: 'plugin' as const
            }
          : null
        if (!track) continue
        upsertTrack(track)
        if (!playlist.trackKeys.includes(track.key)) {
          playlist.trackKeys.push(track.key)
          added++
        }
      } catch {
        // Ignore malformed entries and continue importing the rest.
      }
    }
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
    return {
      cancelled: false,
      target: { id: playlist.id, location: 'local' },
      added,
      skipped: (request?.items?.length ?? 0) - added
    }
  }

  async function removeHostTracks(reference: any, entities: any[]) {
    const playlist = playlists.value.find((item) => item.id === reference?.id)
    if (!playlist) return { removed: 0, notFound: entities?.length ?? 0 }
    let removed = 0
    for (const entity of entities ?? []) {
      // 队列 key 有两种形状：公共 provider 资源是 `providerId:id`，
      // 插件私有资源是 `pluginId:providerId:id`。此前只拼前一种，
      // 私有歌曲在歌单里永远删不掉（界面提示成功、列表却没变化）。
      const candidates = playlistKeyCandidates(entity?.ref, entity?.key)
      const before = playlist.trackKeys.length
      playlist.trackKeys = playlist.trackKeys.filter((item) => !candidates.includes(item))
      if (playlist.trackKeys.length < before) removed++
    }
    if (removed > 0) {
      playlist.updatedAt = Date.now()
      const db = await getDb()
      await db.put('playlists', toPlain(playlist))
      // 插件改了歌单，其它插件与界面都要知道（桌面 PluginHost 改完同样发 library.changed）。
      pluginStore.publishLibrary({ id: playlist.id, location: 'local' }, 'updated')
    }
    return { removed, notFound: (entities?.length ?? 0) - removed }
  }

  async function clearHostPlaylist(reference: any) {
    const playlist = playlists.value.find((item) => item.id === reference?.id)
    if (!playlist) return
    if (!playlist.trackKeys.length) return
    playlist.trackKeys = []
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
    pluginStore.publishLibrary({ id: playlist.id, location: 'local' }, 'updated')
  }

  /** 分页返回本地音乐；游标非法时抛错，而不是静默从头再来（会让插件死循环）。 */
  function localMusicPage(cursor?: string, limit?: number) {
    const page = paginate(
      localTracks.value.map((track) => track.raw),
      cursor,
      limit
    )
    if (!page) throw new Error('分页游标无效')
    return page
  }

  async function applyLocalMetadata(
    trackKey: string,
    metadata: { cover?: string; lyrics?: string; title?: string; artist?: string; album?: string }
  ): Promise<boolean> {
    const record = localRecords.value.find((item) => item.key === trackKey)
    if (!record) return false
    if (metadata.cover !== undefined) record.cover = metadata.cover || undefined
    if (metadata.lyrics !== undefined) record.lyrics = metadata.lyrics || undefined
    const title = metadata.title?.trim()
    if (title) record.title = title
    const artist = metadata.artist?.trim()
    if (artist) record.artist = artist
    const album = metadata.album?.trim()
    if (album) record.album = album
    const db = await getDb()
    await db.put('localTracks', toPlain(record))
    tracks.value = { ...tracks.value, [record.key]: localTrackToTrack(record) }
    return true
  }

  function localTags(track: any) {
    const record = localRecords.value.find((item) => item.key === track?.id || item.key === track?.ref?.id)
    return record ? { ...record } : null
  }

  async function writeLocalTags(track: any, tags: any) {
    const record = localRecords.value.find((item) => item.key === track?.id || item.key === track?.ref?.id)
    if (!record) throw new Error('本地歌曲不存在')
    if (tags?.title != null) record.title = String(tags.title).trim() || record.title
    if (Array.isArray(tags?.artists)) {
      record.artist = tags.artists.map(String).filter(Boolean).join(' / ') || '未知艺术家'
    }
    if (tags?.album != null) record.album = String(tags.album).trim() || undefined
    if (tags?.year !== undefined) {
      const year = Number(tags.year)
      record.year = Number.isFinite(year) && year > 0 ? Math.trunc(year) : undefined
    }
    if (tags?.genre !== undefined) record.genre = String(tags.genre).trim() || undefined
    // SDK 的 writeTags 契约里 lyrics 是 LyricsDocument（`{ lines, format }`），
    // 插件按契约传对象时 `String()` 会得到 `[object Object]`，歌词就此丢失。
    // 字符串（页内编辑）原样保留，结构化文档转成 LRC 再存。
    if (tags?.lyrics != null) {
      record.lyrics =
        typeof tags.lyrics === 'string' ? tags.lyrics : lyricValueToLrc(tags.lyrics)
    }
    if (tags?.cover !== undefined) record.cover = String(tags.cover).trim() || undefined

    let fileTagWritten = false
    let fileTagWarning: string | undefined
    if (
      record.relativePath &&
      (isMp3File(record.fileName, record.mime) ||
        isFlacFile(record.fileName, record.mime) ||
        isM4aFile(record.fileName, record.mime))
    ) {
      try {
        const file = await Filesystem.readFile({
          path: record.relativePath,
          directory: Directory.Data
        })
        const base64 = typeof file.data === 'string' ? file.data : ''
        if (!base64) throw new Error('读取音频文件失败')
        const fileTags = {
          title: record.title,
          artists: record.artist.split(/\s*\/\s*/).filter(Boolean),
          album: record.album,
          year: record.year,
          genres: record.genre ? [record.genre] : undefined,
          lyrics: record.lyrics,
          coverDataUrl: record.cover
        }
        const isMp3 = isMp3File(record.fileName, record.mime)
        const isFlac = isFlacFile(record.fileName, record.mime)
        const tagged = isMp3
          ? writeMp3TagsToBase64(base64, fileTags)
          : isFlac
            ? writeFlacTagsToBase64(base64, fileTags)
            : writeM4aTagsToBase64(base64, fileTags)
        await Filesystem.writeFile({
          path: record.relativePath,
          data: tagged,
          directory: Directory.Data,
          recursive: true
        })
        fileTagWritten = true
      } catch (error) {
        fileTagWarning = error instanceof Error ? error.message : String(error)
      }
    }

    const db = await getDb()
    await db.put('localTracks', toPlain(record))
    tracks.value = { ...tracks.value, [record.key]: localTrackToTrack(record) }
    return { success: true, fileTagWritten, fileTagWarning }
  }
  function historyPage(cursor?: string, limit?: number) {
    const page = paginate(
      history.value.map((item) => item.track.raw),
      cursor,
      limit
    )
    if (!page) throw new Error('分页游标无效')
    return page
  }

  /**
   * 把插件传来的实体变成本地 Track。
   *
   * 插件收藏/取消收藏的是它自己刚搜出来的歌，多半还没进过 `tracks` 表；
   * 此前 `getTrack(key)` 取不到就**静默跳过**——插件以为收藏成功，
   * 用户的收藏列表却没有任何变化，也没有任何报错。
   * 取不到就按实体自身的元数据构造一条（与播放路径 `rawEntityToTrack` 同口径）。
   */
  function hostEntityToTrack(entity: any): Track | null {
    const ref = entity?.ref
    if (!ref || ref.kind !== 'track' || !ref.id) return null
    const pluginKey =
      pluginStore.providers.find((item) => item.providerId === ref.providerId)?.pluginKey ??
      (typeof ref.pluginId === 'string' ? ref.pluginId : undefined)
    const key = `${pluginKey ?? ref.providerId}:${ref.providerId}:${ref.id}`
    const existing = getTrack(key) ?? (entity?.key ? getTrack(String(entity.key)) : undefined)
    if (existing) return existing
    const metadata = entity?.metadata ?? {}
    const artists = Array.isArray(metadata.artists)
      ? metadata.artists.map(String)
      : String(entity?.subtitle ?? '')
          .split(/[/,，、]/)
          .map((item: string) => item.trim())
          .filter(Boolean)
    return {
      key,
      ...(pluginKey ? { pluginKey } : {}),
      ref,
      title: String(entity?.title ?? '未知歌曲'),
      subtitle: entity?.subtitle,
      artists,
      album: metadata.album?.title,
      albumId: metadata.album?.id ? String(metadata.album.id) : undefined,
      durationMs: Number(entity?.durationMs ?? metadata.durationMs ?? 0) || undefined,
      artworkUrl: metadata.artworkUrl,
      qualities: Array.isArray(metadata.qualities) ? metadata.qualities.map(String) : [],
      playable: entity?.playable !== false,
      raw: toPlain(entity),
      source: 'plugin'
    }
  }

  async function addHostFavorite(track: any) {
    const resolved = hostEntityToTrack(track)
    if (!resolved) throw new Error('收藏的歌曲引用无效')
    await addFavorite(resolved)
  }

  async function removeHostFavorite(track: any) {
    const resolved = hostEntityToTrack(track)
    if (!resolved) throw new Error('取消收藏的歌曲引用无效')
    await removeFavorite(resolved)
  }

  async function importSharedPlaylist(
    name: string,
    description: string,
    tracks: Track[]
  ): Promise<Playlist> {
    const playlist = createPlaylist(name, description)
    const uniqueTracks = new Map<string, Track>()
    for (const track of tracks) {
      if (!track?.key) continue
      uniqueTracks.set(track.key, track)
      upsertTrack(track)
      if (!playlist.trackKeys.includes(track.key)) playlist.trackKeys.push(track.key)
    }
    playlist.updatedAt = Date.now()
    const db = await getDb()
    if (uniqueTracks.size) {
      const tx = db.transaction('tracks', 'readwrite')
      for (const track of uniqueTracks.values()) tx.store.put(toPlain(track))
      await tx.done
    }
    await db.put('playlists', toPlain(playlist))
    return playlist
  }

  async function importPlaylistFromPlugin(
    pluginKey: string,
    pluginId: string,
    importerId: string,
    value: string
  ) {
    void pluginId
    const runtime = (await import('@/services/plugin/runtime')).pluginRuntimeManager.get(pluginKey)
    if (!runtime) throw new Error('插件未启用')

    let cursor: string | undefined
    let playlist: Playlist | null = null
    /**
     * 导入器分页的停止条件。
     *
     * 这是个 `do … while (cursor)` 循环，唯一的出口是插件给出空的 `nextCursor`。
     * 插件把游标原样回传（或每次都返回同一页）时，这里会**永远转下去**：界面
     * 一直停在「导入中」，每转一圈都在往歌单里塞同一批歌，只能强杀应用。
     * 与其它分页同一口径：连续两页没有新增即停，另加页数上限兜底。
     */
    let barrenPages = 0
    let pages = 0

    do {
      const page = await runtime.invokeImporter(importerId, {
        value,
        cursor,
        limit: 100
      })
      if (!page) throw new Error('导入器没有返回歌单')
      if (!playlist) playlist = createPlaylist(page.name || '导入歌单')
      if (page?.name && page.name !== playlist.name) playlist.name = page.name

      let added = 0
      for (const entity of page?.items ?? []) {
        if (entity?.ref?.kind !== 'track') continue
        const track = pluginStore.normalizeEntity(pluginKey, entity)
        upsertTrack(track)
        if (!playlist.trackKeys.includes(track.key)) {
          playlist.trackKeys.push(track.key)
          added += 1
        }
      }
      pages += 1
      barrenPages = added === 0 ? barrenPages + 1 : 0
      if (barrenPages >= 2 || pages >= MAX_IMPORT_PAGES) {
        cursor = undefined
        break
      }
      cursor = page?.nextCursor
    } while (cursor)

    if (!playlist) throw new Error('导入器没有返回歌单')
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
    return playlist
  }


  async function uploadPlaylistToCloud(playlistId: string): Promise<string> {
    const playlist = playlists.value.find((item) => item.id === playlistId)
    if (!playlist) throw new Error('歌单不存在')
    const tracks = playlistTracks(playlistId)
    const songlist = playlistTracksToCloud(tracks)
    if (!songlist.length) throw new Error('歌单中没有可分享的在线歌曲')
    const created = await cloudSongListApi.createUserSongList({
      localId: playlist.id,
      name: playlist.name,
      describe: playlist.description || '',
      cover: playlist.cover || tracks.find((track) => track.artworkUrl)?.artworkUrl,
      songlist
    })
    if (!created?.id) throw new Error('云端没有返回歌单 ID')
    playlist.cloudId = created.id
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
    return created.id
  }

  async function syncPlaylistToCloud(playlistId: string): Promise<string> {
    const playlist = playlists.value.find((item) => item.id === playlistId)
    if (!playlist) throw new Error('歌单不存在')
    if (!playlist.cloudId) return uploadPlaylistToCloud(playlistId)
    const tracks = playlistTracks(playlistId)
    const songlist = playlistTracksToCloud(tracks)
    if (!songlist.length) throw new Error('歌单中没有可分享的在线歌曲')
    const updated = await cloudSongListApi.updateUserSongList({
      listId: playlist.cloudId,
      name: playlist.name,
      describe: playlist.description || '',
      cover: playlist.cover || tracks.find((track) => track.artworkUrl)?.artworkUrl,
      songlist
    })
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
    return updated?.id || playlist.cloudId
  }

  return {
    favorites,
    playlists,
    history,
    localRecords,
    tracks,
    initialized,
    importingLocal,
    favoriteKeys,
    recentTracks,
    localTracks,
    init,
    upsertTrack,
    getTrack,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    createPlaylist,
    updatePlaylist,
    getPlaylistCover,
    renamePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    removeTracksFromPlaylist,
    reorderPlaylist,
    playlistTracks,
    recordHistory,
    clearHistory,
    removeFromHistory,
    pickLocalFiles,
    importLocalFile,
    importLocalFileWithReason,
    importLocalFiles,
    scanLocalMusic,
    deleteLocalTrack,
    asHostPlaylists,
    asHostTracks,
    importHostPlaylist,
    removeHostTracks,
    clearHostPlaylist,
    localMusicPage,
    localTags,
    applyLocalMetadata,
    writeLocalTags,
    historyPage,
    addHostFavorite,
    removeHostFavorite,
    importPlaylistFromPlugin,
    importSharedPlaylist,
    uploadPlaylistToCloud,
    syncPlaylistToCloud
  }
})
