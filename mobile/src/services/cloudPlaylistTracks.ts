/**
 * 云端歌单 → 可播放曲目，供社区帖子的歌单附件、以及其它只有 `cloudId` 的入口使用。
 *
 * 社区附件只存 `listId`（云端歌单 ID）与前三首预览，原帖里没有完整曲目；
 * 此前点歌单附件只会弹一句「将在后续云歌单功能中打开」，等于点不开。
 * 这里复用已有的 `cloudSongListApi.getSongListDetail` 拉全量曲目，并把每条
 * 云端歌曲映射成 `Track`（与歌单页、分享歌单页同一套 ref 语义）。
 */
import { cloudSongListApi, type CloudSongDto } from './cloudSongList'
import type { Track } from '@/types/music'

export interface ProviderLike {
  pluginKey: string
  providerId: string
  qualities: readonly string[]
}

/** `"5:41"` / `"65"` → 毫秒；无法解析返回 undefined。 */
export function durationMsOf(interval: unknown): number | undefined {
  const text = String(interval ?? '').trim()
  if (!text) return undefined
  const parts = text.split(':')
  if (parts.length > 2) return undefined
  const seconds = parts.reduce((total, part) => {
    const value = Number(part)
    return Number.isFinite(value) ? total * 60 + value : Number.NaN
  }, 0)
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return Math.round(seconds * 1000)
}

/** 歌手串按桌面版同一组分隔符拆开。 */
function artistsOf(singer: unknown): string[] {
  return String(singer ?? '')
    .split(/[/,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 单首云端歌曲 → Track。
 *
 * 没有对应音源插件时仍返回 Track（`playable: false`），让用户能看到歌单内容
 * 而不是整页空白；能否播放由界面按 `playable` 决定提示。
 */
export function cloudSongToTrack(
  song: CloudSongDto,
  providers: readonly ProviderLike[]
): Track {
  const source = String(song.source || '')
  const provider = providers.find((item) => item.providerId === source)
  const pluginResource = (song as CloudSongDto).pluginResource
  const ref =
    pluginResource && pluginResource.kind === 'track'
      ? (pluginResource as Track['ref'])
      : {
          providerId: source,
          kind: 'track' as const,
          id: String(song.songmid),
          scope: 'provider' as const
        }
  return {
    key: (provider ? provider.pluginKey + ':' : 'cloud:') + ref.providerId + ':' + ref.id,
    ...(provider ? { pluginKey: provider.pluginKey } : {}),
    ref,
    title: String(song.name || '未知歌曲'),
    subtitle: String(song.singer || ''),
    artists: artistsOf(song.singer),
    album: song.albumName || undefined,
    albumId: song.albumId || undefined,
    durationMs: durationMsOf(song.interval),
    artworkUrl: song.img || undefined,
    // 插件声明了音质就用它的顺序；云端记录里的 types 只作兜底。
    qualities: provider?.qualities?.length
      ? [...provider.qualities]
      : Array.isArray(song.types)
        ? song.types.map((item) => item.type).filter(Boolean)
        : [],
    playable: Boolean(provider),
    raw: { ...song, ref },
    source: provider ? 'plugin' : undefined
  }
}

export interface CloudPlaylistResult {
  name?: string
  cover?: string
  tracks: Track[]
}

/**
 * 拉取整张云端歌单。
 *
 * `limit` 给一个足够大的值而不是逐页循环：云端歌单接口一次能返回整单，
 * 分页循环只会让这段代码更难读，也更容易在异常分页上空转。
 */
export async function loadCloudPlaylist(
  listId: string,
  providers: readonly ProviderLike[],
  limit = 500
): Promise<CloudPlaylistResult> {
  const id = String(listId || '').trim()
  if (!id) throw new Error('歌单附件缺少云端 ID')
  const detail = await cloudSongListApi.getSongListDetail(id, 'asc', limit)
  const songs = Array.isArray(detail?.list) ? detail.list : []
  if (!songs.length) throw new Error('这个云端歌单里没有歌曲')
  return {
    tracks: songs.map((song) => cloudSongToTrack(song, providers))
  }
}
