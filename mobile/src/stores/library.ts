import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { Playlist, FavoriteEntry, HistoryEntry, Track } from '@/types/music'
import type { LocalTrackRecord } from '@/types/download'
import { getDb, toPlain } from '@/services/db'
import { usePluginStore } from '@/stores/plugins'
import { lyricValueToLrc } from '@/services/lyrics'
import { base64ToArrayBuffer, isFlacFile, isMp3File, writeFlacTagsToBase64, writeMp3TagsToBase64 } from '@/services/audioTags'
import { isM4aFile, writeM4aTagsToBase64 } from '@/services/mp4Tags'
import { cloudSongListApi, playlistTracksToCloud } from '@/services/cloudSongList'

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
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
    raw: { local: true, lrc: record.lyrics || null },
    localUri: Capacitor.convertFileSrc(record.path),
    localPath: record.path,
    localRelativePath: record.relativePath,
    source: 'local'
  }
}


export const useLibraryStore = defineStore('library', () => {
  const pluginStore = usePluginStore()
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
    history.value = historyRows.sort((a, b) => b.playedAt - a.playedAt).slice(0, 300)
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

  function isFavorite(trackOrRef: Track | any): boolean {
    const key = trackOrRef?.key ?? (trackOrRef?.providerId && trackOrRef?.id ? `${trackOrRef.providerId}:${trackOrRef.id}` : '')
    return favoriteKeys.value.has(key)
  }

  async function toggleFavorite(track: Track): Promise<boolean> {
    upsertTrack(track)
    const db = await getDb()
    if (isFavorite(track)) {
      await db.delete('favorites', track.key)
      favorites.value = favorites.value.filter((item) => item.key !== track.key)
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

  async function renamePlaylist(id: string, name: string): Promise<void> {
    const playlist = playlists.value.find((item) => item.id === id)
    if (!playlist) return
    playlist.name = name.trim() || playlist.name
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
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
    const duplicate = existing.filter((item) => item.track.key === track.key).slice(0, 3)
    for (const item of duplicate) await db.delete('history', item.id)
    await db.put('history', toPlain(entry))
    history.value = [entry, ...history.value.filter((item) => item.track.key !== track.key)].slice(0, 300)
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

  async function importLocalFile(
    file: File,
    options: { sourcePath?: string } = {}
  ): Promise<LocalTrackRecord | null> {
    const existing = options.sourcePath
      ? localRecords.value.find((item) => item.sourcePath === options.sourcePath)
      : undefined
    if (existing && existing.size === file.size) return null
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
    let title = file.name.replace(/\.[^.]+$/, '')
    let artist = '未知艺术家'
    let album: string | undefined
    let durationMs: number | undefined
    let cover: string | undefined
    try {
      const { parseBlob } = await import('music-metadata-browser')
      const metadata = await parseBlob(file, { skipCovers: false })
      title = metadata.common.title || title
      artist = metadata.common.artist || (metadata.common.artists ?? []).join(' / ') || artist
      album = metadata.common.album || undefined
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
    const record: LocalTrackRecord = {
      key,
      title,
      artist,
      album,
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
    return record
  }

  async function importLocalFiles(files: File[]): Promise<LocalTrackRecord[]> {
    importingLocal.value = true
    const imported: LocalTrackRecord[] = []
    try {
      for (const file of files) {
        try {
          const record = await importLocalFile(file)
          if (record) imported.push(record)
        } catch (error) {
          console.warn('导入本地歌曲失败', file.name, error)
        }
      }
      return imported
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
    output: ScannedAudioFile[]
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
        await collectAudioFiles(childPath, directory, depth + 1, output)
      } else if (isAudioFileName(entry.name)) {
        output.push({
          path: childPath,
          name: entry.name,
          size: Number(entry.size) || 0,
          directory
        })
      }
    }
  }

  async function scanLocalMusic(): Promise<LocalTrackRecord[]> {
    importingLocal.value = true
    const imported: LocalTrackRecord[] = []
    try {
      const directories: Directory[] = [Directory.Documents]
      if (Capacitor.getPlatform() === 'android') directories.push(Directory.External)
      const files: ScannedAudioFile[] = []
      for (const directory of directories) {
        await collectAudioFiles('', directory, 0, files)
      }
      for (const file of files) {
        try {
          const sourcePath = `${file.directory}:${file.path}`
          const existing = localRecords.value.find(
            (item) =>
              item.sourcePath === sourcePath ||
              (item.fileName === file.name && item.size === file.size)
          )
          if (existing && existing.size === file.size) continue
          const data = await Filesystem.readFile({ path: file.path, directory: file.directory })
          const base64 = typeof data.data === 'string' ? data.data : ''
          const bytes = new Uint8Array(base64ToArrayBuffer(base64))
          const blob = new Blob([bytes], { type: mimeForAudio(file.name) })
          const record = await importLocalFile(
            new File([blob], file.name, { type: mimeForAudio(file.name) }),
            { sourcePath: `${file.directory}:${file.path}` }
          )
          if (record) imported.push(record)
        } catch (error) {
          console.warn('扫描本地歌曲失败', file.path, error)
        }
      }
      return imported
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

  function asHostPlaylists() {
    return {
      items: playlists.value.map((playlist) => ({
        ref: { id: playlist.id, location: 'local' as const },
        name: playlist.name,
        description: playlist.description,
        trackCount: playlist.trackKeys.length,
        writable: true
      })),
      totalEstimate: playlists.value.length
    }
  }

  function asHostTracks(reference: any, cursor?: string) {
    const playlist = playlists.value.find((item) => item.id === reference?.id)
    if (!playlist) return { items: [], totalEstimate: 0 }
    const items = playlistTracks(playlist.id).map((track) => track.raw)
    return { items, totalEstimate: items.length, ...(cursor ? {} : {}) }
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
      const key = `${entity.ref?.providerId}:${entity.ref?.id}`
      const before = playlist.trackKeys.length
      playlist.trackKeys = playlist.trackKeys.filter((item) => item !== key)
      if (playlist.trackKeys.length < before) removed++
    }
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
    return { removed, notFound: (entities?.length ?? 0) - removed }
  }

  async function clearHostPlaylist(reference: any) {
    const playlist = playlists.value.find((item) => item.id === reference?.id)
    if (!playlist) return
    playlist.trackKeys = []
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
  }

  function localMusicPage(cursor?: string) {
    return {
      items: localTracks.value.map((track) => track.raw),
      totalEstimate: localTracks.value.length
    }
  }

  async function applyLocalMetadata(
    trackKey: string,
    metadata: { cover?: string; lyrics?: string }
  ): Promise<boolean> {
    const record = localRecords.value.find((item) => item.key === trackKey)
    if (!record) return false
    if (metadata.cover !== undefined) record.cover = metadata.cover || undefined
    if (metadata.lyrics !== undefined) record.lyrics = metadata.lyrics || undefined
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
    if (tags?.lyrics != null) record.lyrics = String(tags.lyrics)

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
        const tags = {
          title: record.title,
          artists: record.artist.split(/\s*\/\s*/).filter(Boolean),
          album: record.album,
          lyrics: record.lyrics,
          coverDataUrl: record.cover
        }
        const isMp3 = isMp3File(record.fileName, record.mime)
        const isFlac = isFlacFile(record.fileName, record.mime)
        const tagged = isMp3
          ? writeMp3TagsToBase64(base64, tags)
          : isFlac
            ? writeFlacTagsToBase64(base64, tags)
            : writeM4aTagsToBase64(base64, tags)
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
  function historyPage(cursor?: string) {
    return {
      items: history.value.map((item) => item.track.raw),
      totalEstimate: history.value.length
    }
  }

  async function addHostFavorite(track: any) {
    const key = track?.key ?? (track?.ref ? `${track.ref.providerId}:${track.ref.id}` : '')
    const local = getTrack(key)
    if (local) await addFavorite(local)
  }

  async function removeHostFavorite(track: any) {
    const key = track?.key ?? (track?.ref ? `${track.ref.providerId}:${track.ref.id}` : '')
    const local = getTrack(key)
    if (local) await removeFavorite(local)
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

    do {
      const page = await runtime.invokeImporter(importerId, {
        value,
        cursor,
        limit: 100
      })
      if (!page) throw new Error('导入器没有返回歌单')
      if (!playlist) playlist = createPlaylist(page.name || '导入歌单')
      if (page?.name && page.name !== playlist.name) playlist.name = page.name

      for (const entity of page?.items ?? []) {
        if (entity?.ref?.kind !== 'track') continue
        const track = pluginStore.normalizeEntity(pluginKey, entity)
        upsertTrack(track)
        if (!playlist.trackKeys.includes(track.key)) playlist.trackKeys.push(track.key)
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
    renamePlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    reorderPlaylist,
    playlistTracks,
    recordHistory,
    pickLocalFiles,
    importLocalFile,
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
