import type { MusicFault, ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'

export interface Track {
  /** Host-local stable key. Never send this to a plugin. */
  key: string
  pluginKey?: string
  ref: ResourceRef
  title: string
  subtitle?: string
  artists: string[]
  album?: string
  albumId?: string
  durationMs?: number
  artworkUrl?: string
  qualities: string[]
  qualitySizes?: Record<string, number>
  playable: boolean
  /** Original provider entity, JSON only. */
  raw: Record<string, any>
  /** Present for local files. */
  localUri?: string
  localPath?: string
  localRelativePath?: string
  downloadedPath?: string
  downloadedRelativePath?: string
  source?: 'plugin' | 'local' | 'download'
}

export interface Playlist {
  id: string
  name: string
  description?: string
  cover?: string
  trackKeys: string[]
  source: 'local' | 'plugin'
  pluginKey?: string
  providerId?: string
  remoteId?: string
  cloudId?: string
  createdAt: number
  updatedAt: number
}

export interface FavoriteEntry {
  key: string
  track: Track
  createdAt: number
}

export interface HistoryEntry {
  id: string
  track: Track
  playedAt: number
}

export interface ResolveOutcome {
  url: string
  expiresAt?: number
  requestHeaders?: Record<string, string>
}

export interface LyricLine {
  startMs: number
  endMs?: number
  text: string
  translation?: string
  romanization?: string
}

export interface LyricDocument {
  lines: LyricLine[]
  plainText?: string
  format: 'crlyric' | 'lrc' | 'ttml' | 'plain'
}

export interface SearchPage<T> {
  items: T[]
  nextCursor?: string
  totalEstimate?: number
}

export interface PlaybackError {
  code: MusicFault['code'] | 'AUDIO' | 'RESOLVE' | 'OFFLINE'
  message: string
}
