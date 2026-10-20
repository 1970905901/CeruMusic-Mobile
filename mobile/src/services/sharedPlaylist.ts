import type { ProviderEntry } from '@/types/plugin'
import type { Track } from '@/types/music'
import type { PlaylistShareSongInfo } from '@/services/shareApi'

export interface SharedPlaylistMapOptions {
  providers: readonly ProviderEntry[]
  shareId: string
}

function durationMs(interval: unknown): number | undefined {
  const parts = String(interval || '')
    .split(':')
    .map(Number)
  if (!parts.length || parts.some((value) => !Number.isFinite(value) || value < 0)) return undefined
  return Math.round(parts.reduce((total, value) => total * 60 + value, 0) * 1000)
}

function artistsOf(value: unknown): string[] {
  return String(value || '')
    .split(/[、,/]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * Playlist shares contain public entities. Prefer a locally installed provider
 * so playback uses the user's own plugin; otherwise the item stays visible but
 * is not marked playable.
 */
export function sharedPlaylistTrack(
  song: PlaylistShareSongInfo,
  options: SharedPlaylistMapOptions
): Track {
  const source = String(song.source || 'share')
  const provider = options.providers.find((item) => item.providerId === source)
  const pluginResource = (song as any).pluginResource
  const ref =
    pluginResource?.kind === 'track'
      ? pluginResource
      : { providerId: source, kind: 'track', id: String(song.songmid), scope: 'provider' }
  return {
    key:
      (provider ? provider.pluginKey + ':' : 'share:') +
      ref.providerId +
      ':' +
      ref.id,
    ...(provider ? { pluginKey: provider.pluginKey } : {}),
    ref,
    title: String(song.name || '分享歌曲'),
    subtitle: String(song.singer || ''),
    artists: artistsOf(song.singer),
    album: song.albumName || undefined,
    durationMs: durationMs(song.interval),
    artworkUrl: song.img || undefined,
    qualities: provider?.qualities ?? [],
    playable: !!provider,
    raw: { ...song, ref },
    source: provider ? 'plugin' : undefined
  }
}

export function sharedPlaylistTracks(
  songs: readonly PlaylistShareSongInfo[],
  options: SharedPlaylistMapOptions
): Track[] {
  return songs.map((song) => sharedPlaylistTrack(song, options))
}

export function sharedPlaylistNextPos(
  songs: readonly PlaylistShareSongInfo[]
): number | undefined {
  const last = songs[songs.length - 1]
  const pos = Number(last?.pos)
  return Number.isFinite(pos) ? pos : undefined
}

export interface SharedPlaylistPageData {
  playlist: {
    songs?: readonly PlaylistShareSongInfo[]
    total?: number | string
    [key: string]: any
  }
  [key: string]: any
}

export interface SharedPlaylistInputEntry {
  input: string
  id?: string
  error?: string
}

export interface SharedPlaylistLoadOptions {
  pageSize?: number
  maxPages?: number
  onProgress?: (loaded: number, total?: number) => void
}

export interface SharedPlaylistFetchResult<T> {
  detail: T
  songs: PlaylistShareSongInfo[]
}

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{3,200}$/

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Accepts a raw share id or one of the link shapes the app produces/opens:
 * - cerumusic://playlist/share/<id>
 * - cerumusic://share/playlist/<id>
 * - https://host/share/playlist/<id>
 * - https://host/playlist/share/<id>
 */
export function parseSharedPlaylistInput(value: string): string {
  const text = String(value ?? '').trim()
  if (!text) throw new Error('请输入歌单分享链接或 ID')
  if (text.length > 2048) throw new Error('分享链接过长')
  if (SHARE_ID_PATTERN.test(text)) return text

  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error('无法识别的歌单分享链接')
  }

  const segments = url.pathname.split('/').map(decodeSegment).filter(Boolean)
  if (url.protocol === 'cerumusic:') {
    if (url.hostname === 'playlist' && segments[0] === 'share' && segments[1]) return segments[1]
    if (url.hostname === 'share' && segments[0] === 'playlist' && segments[1]) return segments[1]
  }
  const pairs: Array<[string, string]> = [
    ['share', 'playlist'],
    ['playlist', 'share']
  ]
  for (let index = 0; index < segments.length - 1; index++) {
    const matched = pairs.some(
      ([first, second]) => segments[index] === first && segments[index + 1] === second
    )
    const id = segments[index + 2]
    if (matched && id && SHARE_ID_PATTERN.test(id)) return id
  }

  const queryId = url.searchParams.get('id') || url.searchParams.get('shareId')
  if (queryId && SHARE_ID_PATTERN.test(queryId)) return queryId
  throw new Error('链接中缺少歌单分享 ID')
}

/** Parse a multi-line paste box, keeping per-line errors visible to the UI. */
export function parseSharedPlaylistInputs(text: string): SharedPlaylistInputEntry[] {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) throw new Error('请输入至少一个歌单分享链接')

  const seen = new Set<string>()
  const entries: SharedPlaylistInputEntry[] = []
  for (const input of lines) {
    try {
      const id = parseSharedPlaylistInput(input)
      if (seen.has(id)) {
        entries.push({ input, error: '重复的分享链接' })
        continue
      }
      seen.add(id)
      entries.push({ input, id })
    } catch (error) {
      entries.push({ input, error: error instanceof Error ? error.message : '无法识别的分享链接' })
    }
  }
  return entries
}

export function sharedPlaylistSongKey(song: PlaylistShareSongInfo): string {
  const source = String(song?.source || 'share')
  const id = String(song?.songmid ?? '')
  const hash = String((song as any)?.hash ?? '')
  return source + ':' + (id || hash)
}

/** Flatten pages and drop songs repeated across page boundaries. */
export function mergeSharedPlaylistSongs(
  pages: readonly (readonly PlaylistShareSongInfo[])[]
): PlaylistShareSongInfo[] {
  const seen = new Set<string>()
  const result: PlaylistShareSongInfo[] = []
  for (const page of pages) {
    for (const song of page ?? []) {
      const key = sharedPlaylistSongKey(song)
      if (seen.has(key)) continue
      seen.add(key)
      result.push(song)
    }
  }
  return result
}

/**
 * Walk every page of a playlist share. The first page supplies the metadata
 * (name, cover, total); songs are merged and deduplicated across pages.
 */
export async function fetchSharedPlaylistSongs<T extends SharedPlaylistPageData>(
  shareId: string,
  loadPage: (limit: number, pos?: number) => Promise<T>,
  options: SharedPlaylistLoadOptions = {}
): Promise<SharedPlaylistFetchResult<T>> {
  if (!shareId) throw new Error('歌单分享缺少 ID')
  const pageSize = Math.max(1, Math.min(Number(options.pageSize) || 50, 200))
  const maxPages = Math.max(1, Math.min(Number(options.maxPages) || 200, 1000))
  const pages: PlaylistShareSongInfo[][] = []
  let detail: T | null = null
  let pos: number | undefined
  let loaded = 0
  let total: number | undefined

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const page = await loadPage(pageSize, pos)
    if (!page?.playlist) throw new Error('歌单分享不存在')
    if (!detail) detail = page
    const songs = (page.playlist.songs ?? []) as PlaylistShareSongInfo[]
    pages.push(songs)
    loaded += songs.length
    const pageTotal = Number(page.playlist.total)
    if (Number.isFinite(pageTotal) && pageTotal > 0) total = pageTotal
    options.onProgress?.(loaded, total)
    if (!songs.length) break
    if (total !== undefined && loaded >= total) break
    const next = sharedPlaylistNextPos(songs)
    if (next === undefined || next === pos) break
    pos = next
  }

  if (!detail) throw new Error('歌单分享不存在')
  return { detail, songs: mergeSharedPlaylistSongs(pages) }
}
