import CryptoJS from 'crypto-js'
import { gzipSync, strFromU8, strToU8 } from 'fflate'
import { gunzipWithLimit } from '@/services/gzipLimit'
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

/** 歌单文件（压缩或明文）本身的体积上限。 */
export const MAX_PLAYLIST_FILE_BYTES = 16 * 1024 * 1024
/** `.cmpl` 解压后的上限：正常的歌单文件远小于这个数。 */
export const MAX_PLAYLIST_UNPACKED_BYTES = 64 * 1024 * 1024

export function packPlaylistFile(encrypted: string): Uint8Array {
  return gzipSync(strToU8(encrypted))
}

/**
 * 解压 `.cmpl`，并对**解压后**的体积设上限。
 *
 * 歌单文件来自外部（聊天记录、网盘、插件目录），而 gzip 的压缩比可以高达
 * 上千倍：一个几百 KB 的文件解出几个 GB，`gunzipSync` 会一次性申请这么多内存，
 * 移动端 WebView 直接被杀掉，用户只看到应用闪退、不知道是哪个文件。
 * 这里用流式解压边解边计数，超限立刻中止。
 */
export function unpackPlaylistFile(
  bytes: Uint8Array,
  limit: number = MAX_PLAYLIST_UNPACKED_BYTES
): string {
  let unpacked: Uint8Array
  try {
    unpacked = gunzipWithLimit(bytes, limit)
  } catch (error) {
    if (error instanceof Error && error.message.includes('解压后过大')) throw error
    throw new Error('歌单文件解压失败')
  }
  return unpacked.length ? strFromU8(unpacked) : ''
}

export function parsePlaylistFile(name: string, bytes: Uint8Array): PlaylistFileSong[] {
  const lower = String(name || '').toLowerCase()
  const isCompressed = lower.endsWith('.cmpl')
  if (!isCompressed && !lower.endsWith('.cpl')) throw new Error('请选择 .cpl 或 .cmpl 歌单文件')
  if (bytes.byteLength > MAX_PLAYLIST_FILE_BYTES) {
    throw new Error(
      `歌单文件超过 ${Math.round(MAX_PLAYLIST_FILE_BYTES / 1024 / 1024)} MB，可能不是有效的歌单文件`
    )
  }
  return decryptPlaylistText(isCompressed ? unpackPlaylistFile(bytes) : strFromU8(bytes))
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
