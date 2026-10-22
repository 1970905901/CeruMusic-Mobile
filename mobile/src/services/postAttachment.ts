/**
 * 社区发帖/编辑的音乐附件，对齐桌面版 `community/PostCreateDialog.vue`。
 *
 * 桌面版的「分享音乐」可以附加**单曲**（从某个歌单选一首）或**整个歌单**；
 * 移动端此前只能附加正在播放的那一首，想分享歌单没有任何入口。
 *
 * 这里把「歌单 → 附件」的组装与可分享性判定抽成纯函数：
 * 一个歌单里可能混着本地文件与已下载副本，它们只存在于本机，
 * 打包成附件后别的设备点开会变成坏引用，所以要先按 `isShareableTrack`
 * 过滤，并在数量为 0 时明确拒绝而不是发出一张空卡片。
 */
import {
  isShareableTrack,
  trackToCloudSong,
  type CloudSongDto
} from './cloudSongList'
import type { Track } from '@/types/music'

export interface PlaylistAttachment {
  type: 'playlist'
  /** 云端歌单 ID：分享出去的歌单必须是云端可解析的。 */
  listId: string
  name: string
  cover?: string
  songCount: number
  preview: CloudSongDto[]
}

export interface PlaylistLike {
  id: string
  name: string
  cover?: string
  cloudId?: string
}

/** 歌单能不能作为附件分享：必须有云端 ID，且至少有一首可分享的在线歌曲。 */
export function playlistShareable(
  tracks: readonly Track[]
): { ok: true; songs: CloudSongDto[] } | { ok: false; reason: string } {
  const songs = tracks.filter(isShareableTrack).map(trackToCloudSong)
  if (!songs.length) {
    return { ok: false, reason: '歌单里没有可分享的在线歌曲（本地文件与已下载副本不能分享）' }
  }
  return { ok: true, songs }
}

/**
 * 组装歌单附件。`preview` 只取前三首：卡片上放不下更多，
 * 也让发帖请求小一点。`songCount` 用可分享的总数，不是歌单长度。
 */
export function buildPlaylistAttachment(
  playlist: PlaylistLike,
  tracks: readonly Track[]
): PlaylistAttachment {
  const result = playlistShareable(tracks)
  if (!result.ok) throw new Error(result.reason)
  if (!playlist.cloudId) throw new Error('这个歌单还没有同步到云端，无法分享')
  return {
    type: 'playlist',
    listId: playlist.cloudId,
    name: playlist.name,
    cover: playlist.cover || result.songs.find((song) => song.img)?.img,
    songCount: result.songs.length,
    preview: result.songs.slice(0, 3)
  }
}

/** 附件标题：单曲走 `song.name`，歌单走 `name`。 */
export function attachmentTitle(attachment: {
  type: 'song' | 'playlist'
  song?: Record<string, any>
  name?: string
} | null): string {
  if (!attachment) return ''
  return attachment.type === 'song'
    ? String(attachment.song?.name || '音乐')
    : String(attachment.name || '歌单')
}

/** 附件副标题：单曲显示歌手，歌单显示曲目数。 */
export function attachmentSubtitle(
  attachment: {
    type: 'song' | 'playlist'
    song?: Record<string, any>
    songCount?: number
    preview?: unknown[]
  } | null
): string {
  if (!attachment) return ''
  if (attachment.type === 'song') return String(attachment.song?.singer || '未知歌手')
  const count = Number(attachment.songCount ?? attachment.preview?.length ?? 0)
  return `${count || 0} 首歌曲`
}

/** 附件封面：单曲用 `img`，歌单用自身封面，其次预览第一首的封面。 */
export function attachmentCover(attachment: {
  type: 'song' | 'playlist'
  song?: Record<string, any>
  cover?: string
  preview?: Array<Record<string, any>>
} | null): string {
  if (!attachment) return ''
  if (attachment.type === 'song') return String(attachment.song?.img || '')
  return String(attachment.cover || attachment.preview?.[0]?.img || '')
}
