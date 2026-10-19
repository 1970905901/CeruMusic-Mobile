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
