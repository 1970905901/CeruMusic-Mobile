import shareApi, { type PlaylistShareDetail, type ShareDetail } from '@/services/shareApi'

export interface ChatShareCardView {
  kind: 'song' | 'playlist'
  title: string
  subtitle: string
  meta: string
  cover: string
  /** 歌单卡最多预览 3 首，与桌面端一致 */
  tracks: Array<{ name: string; singer: string }>
}

/**
 * 卡片展示字段的唯一来源。桌面端把这些写成模板表达式，移动端抽成纯函数，
 * 便于覆盖空字段 / 脏字段而不必挂载组件。
 */
export function chatShareSongView(detail: ShareDetail): ChatShareCardView {
  const song = detail?.song || ({} as ShareDetail['song'])
  return {
    kind: 'song',
    title: String(song.name || '分享歌曲'),
    subtitle: String(song.singer || '未知歌手'),
    meta: '单曲 · 由 ' + (detail?.username || '音乐同好') + ' 分享',
    cover: String(song.img || ''),
    tracks: []
  }
}

export function chatSharePlaylistView(detail: PlaylistShareDetail): ChatShareCardView {
  const playlist = detail?.playlist
  const songs = Array.isArray(playlist?.songs) ? playlist.songs : []
  return {
    kind: 'playlist',
    title: String(playlist?.name || '分享歌单'),
    subtitle: '歌单 · ' + String(playlist?.total ?? songs.length) + ' 首',
    meta: '由 ' + (detail?.username || '音乐同好') + ' 分享',
    cover: String(playlist?.cover || ''),
    tracks: songs.slice(0, 3).map((song) => ({
      name: String(song?.name || '未知歌曲'),
      singer: String(song?.singer || '')
    }))
  }
}

/**
 * 消息里可能有多条相同链接，缓存按 id 去重；失败也缓存成 null，
 * 避免每条重渲染都重打一次接口（桌面端 shareLink.ts 同款语义）。
 */
const songCache = new Map<string, Promise<ShareDetail | null>>()
const playlistCache = new Map<string, Promise<PlaylistShareDetail | null>>()

export function fetchChatShareSong(id: string): Promise<ShareDetail | null> {
  if (!id) return Promise.resolve(null)
  let pending = songCache.get(id)
  if (!pending) {
    pending = shareApi.getById(id).catch(() => null)
    songCache.set(id, pending)
  }
  return pending
}

export function fetchChatSharePlaylist(id: string): Promise<PlaylistShareDetail | null> {
  if (!id) return Promise.resolve(null)
  let pending = playlistCache.get(id)
  if (!pending) {
    pending = shareApi.getPlaylistById(id, 3, 0).catch(() => null)
    playlistCache.set(id, pending)
  }
  return pending
}

/** 仅供测试与「分享已更新」场景手动失效缓存。 */
export function clearChatShareCardCache(): void {
  songCache.clear()
  playlistCache.clear()
}
