import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { Playlist, FavoriteEntry, HistoryEntry, Track } from '@/types/music'
import type { LocalTrackRecord } from '@/types/download'
import { getDb, toPlain } from '@/services/db'
import { usePluginStore } from '@/stores/plugins'

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
    raw: { local: true },
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
    const [favoriteRows, playlistRows, historyRows, localRows] = await Promise.all([
      db.getAll('favorites'),
      db.getAll('playlists'),
      db.getAll('history'),
      db.getAll('localTracks')
    ])
    favorites.value = favoriteRows.sort((a, b) => b.createdAt - a.createdAt)
    playlists.value = playlistRows.sort((a, b) => b.updatedAt - a.updatedAt)
    history.value = historyRows.sort((a, b) => b.playedAt - a.playedAt).slice(0, 300)
    localRecords.value = localRows.sort((a, b) => b.createdAt - a.createdAt)
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

  async function importLocalFiles(files: File[]): Promise<LocalTrackRecord[]> {
    importingLocal.value = true
    const imported: LocalTrackRecord[] = []
    try {
      for (const file of files) {
        try {
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
              const blob = new Blob([new Uint8Array(picture.data) as unknown as BlobPart], { type: picture.format })
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
            mime: file.type,
            cover,
            size: file.size,
            createdAt: Date.now()
          }
          const db = await getDb()
          await db.put('localTracks', toPlain(record))
          localRecords.value = [record, ...localRecords.value]
          tracks.value = { ...tracks.value, [record.key]: localTrackToTrack(record) }
          imported.push(record)
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

  async function scanLocalMusic(): Promise<LocalTrackRecord[]> {
    return pickLocalFiles()
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

  function localTags(track: any) {
    const record = localRecords.value.find((item) => item.key === track?.id || item.key === track?.ref?.id)
    return record ? { ...record } : null
  }

  async function writeLocalTags(track: any, tags: any) {
    const record = localRecords.value.find((item) => item.key === track?.id || item.key === track?.ref?.id)
    if (!record) throw new Error('本地歌曲不存在')
    record.title = tags?.title ?? record.title
    record.artist = tags?.artists?.join(' / ') ?? record.artist
    record.album = tags?.album ?? record.album
    const db = await getDb()
    await db.put('localTracks', toPlain(record))
    tracks.value = { ...tracks.value, [record.key]: localTrackToTrack(record) }
    return { success: true }
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

  async function importPlaylistFromPlugin(
    pluginKey: string,
    pluginId: string,
    importerId: string,
    value: string
  ) {
    const runtime = (await import('@/services/plugin/runtime')).pluginRuntimeManager.get(pluginKey)
    if (!runtime) throw new Error('插件未启用')
    let cursor: string | undefined
    let name = '导入歌单'
    const playlist = createPlaylist(name)
    do {
      const page = await runtime.invokeImporter(importerId, {
        value,
        cursor,
        limit: 100
      })
      if (page?.name) {
        playlist.name = page.name
        name = page.name
      }
      for (const entity of page?.items ?? []) {
        if (entity?.ref?.kind !== 'track') continue
        const track: Track = {
          key: `${pluginKey}:${entity.ref.providerId}:${entity.ref.id}`,
          pluginKey,
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
          source: 'plugin'
        }
        upsertTrack(track)
        if (!playlist.trackKeys.includes(track.key)) playlist.trackKeys.push(track.key)
      }
      cursor = page?.nextCursor
    } while (cursor)
    playlist.updatedAt = Date.now()
    const db = await getDb()
    await db.put('playlists', toPlain(playlist))
    return playlist
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
    writeLocalTags,
    historyPage,
    addHostFavorite,
    removeHostFavorite,
    importPlaylistFromPlugin
  }
})
