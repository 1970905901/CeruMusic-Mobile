import CryptoJS from 'crypto-js'
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate'
import type { ProviderEntry } from '@/types/plugin'
import type { Track } from '@/types/music'
import { isShareableTrack, trackToCloudSong } from '@/services/cloudSongList'
import { sharedPlaylistTrack } from '@/services/sharedPlaylist'
import { sanitizeFilenamePart } from '@/utils/filename'

export const PLAYLIST_FILE_SECRET = 'CeruMusic-PlaylistSecretKey'

export interface PlaylistFileSong {
  songmid?: string | number
  hash?: string
  name?: string
  singer?: string
  albumName?: string
  albumId?: string | number
  source?: string
  interval?: string
  img?: string
  lrc?: string | null
  types?: unknown
  _types?: Record<string, any>
  typeUrl?: Record<string, any>
  pluginResource?: Record<string, any>
  [key: string]: any
}

/** Files only carry online references; local and downloaded audio stay on this device. */
export function exportableTracks(tracks: readonly Track[]): Track[] {
  return tracks.filter(isShareableTrack)
}

export function encryptPlaylistTracks(tracks: readonly Track[]): string {
  const songs = exportableTracks(tracks).map(trackToCloudSong)
  if (!songs.length) throw new Error('歌单中没有可导出的在线歌曲')
  return CryptoJS.AES.encrypt(JSON.stringify(songs), PLAYLIST_FILE_SECRET).toString()
}

export function decryptPlaylistText(encrypted: string): PlaylistFileSong[] {
  const text = String(encrypted || '').trim()
  if (!text) throw new Error('歌单文件为空')
  let decrypted = ''
  try {
    decrypted = CryptoJS.AES.decrypt(text, PLAYLIST_FILE_SECRET).toString(CryptoJS.enc.Utf8)
  } catch {
    decrypted = ''
  }
  if (!decrypted) throw new Error('解密播放列表失败或数据格式不正确')
  let value: unknown
  try {
    value = JSON.parse(decrypted)
  } catch {
    throw new Error('解密播放列表失败或数据格式不正确')
  }
  if (!Array.isArray(value)) throw new Error('解密播放列表失败或数据格式不正确')
  return value as PlaylistFileSong[]
}

export function packPlaylistFile(encrypted: string): Uint8Array {
  return gzipSync(strToU8(encrypted))
}

export function unpackPlaylistFile(bytes: Uint8Array): string {
  try {
    return strFromU8(gunzipSync(bytes))
  } catch {
    throw new Error('歌单文件解压失败')
  }
}

export function parsePlaylistFile(name: string, bytes: Uint8Array): PlaylistFileSong[] {
  const lower = String(name || '').toLowerCase()
  if (lower.endsWith('.cmpl')) return decryptPlaylistText(unpackPlaylistFile(bytes))
  if (lower.endsWith('.cpl')) return decryptPlaylistText(strFromU8(bytes))
  throw new Error('请选择 .cpl 或 .cmpl 歌单文件')
}

export function playlistFileTracks(
  songs: readonly PlaylistFileSong[],
  providers: readonly ProviderEntry[]
): Track[] {
  return songs
    .filter((song) => song && String(song.source || '') !== 'local')
    .map((song) =>
      sharedPlaylistTrack(
        {
          ...song,
          songmid: song.songmid ?? song.hash ?? ''
        } as any,
        { providers, shareId: 'file' }
      )
    )
}

export function playlistFileName(name: string): string {
  const base = sanitizeFilenamePart(name, '歌单')
  return base + '-' + new Date().toISOString().slice(0, 10) + '.cmpl'
}
