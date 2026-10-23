/**
 * 「从云端覆盖本地歌单」，对齐桌面版 `views/music/list.vue` 的 `handleSyncFromCloud`。
 *
 * 移动端此前只有单向出口：本地歌单可以上传 / 同步到云端，但云端那份拉不回来。
 * 在别的设备上整理过歌单、或本地被误删以后，手机上没有任何还原路径。
 *
 * 这里只放纯逻辑：把云端曲目整理成待写入的列表，并算出这次覆盖会丢掉什么，
 * 让调用方能把代价提前告诉用户。真正的落地（写 IndexedDB）在 library store。
 */
import { isShareableTrack } from './cloudSongList'
import { cloudSongToTrack, type ProviderLike } from './cloudPlaylistTracks'
import type { CloudSongDto } from './cloudSongList'
import type { Track } from '@/types/music'

export interface CloudOverwritePlan {
  /** 覆盖后歌单里的曲目，已按云端顺序去重 */
  tracks: Track[]
  /** 云端按 key 去重后丢掉了几首重复项 */
  duplicates: number
  /** 本地有、云端不可能有（本地文件 / 已下载副本）而会被覆盖掉的曲目数 */
  droppedLocal: number
  /** 其中没有对应音源插件、覆盖后不可播放的曲目数 */
  unplayable: number
}

/**
 * 云端曲目 → 覆盖计划。
 *
 * 云端同样可能给出重复条目（同一首歌在歌单里出现两次，旧版本允许），
 * 写入前按 key 去重——否则歌单里会出现两条一模一样的歌，移除时也只能删掉一条。
 */
export function planCloudOverwrite(
  cloudSongs: readonly CloudSongDto[],
  localTracks: readonly Track[],
  providers: readonly ProviderLike[]
): CloudOverwritePlan {
  const seen = new Set<string>()
  const tracks: Track[] = []
  let duplicates = 0
  for (const song of cloudSongs) {
    const track = cloudSongToTrack(song, providers)
    if (!track.key) continue
    if (seen.has(track.key)) {
      duplicates += 1
      continue
    }
    seen.add(track.key)
    tracks.push(track)
  }
  // 本地文件与已下载副本没有可上传的身份，云端不会有它们，
  // 覆盖就是删除——必须让用户知道会少几首。
  const droppedLocal = localTracks.filter((track) => !isShareableTrack(track)).length
  const unplayable = tracks.filter((track) => !track.playable).length
  return { tracks, duplicates, droppedLocal, unplayable }
}

/**
 * 给确认对话框的一句话说明。
 *
 * 覆盖是破坏性操作，且用户往往记不清本地比云端多了什么；把「会少几首」
 * 与「有几首播不了」说在前面，比事后发现更省事。
 */
export function describeCloudOverwrite(plan: CloudOverwritePlan): string {
  const parts = [`将用云端的 ${plan.tracks.length} 首歌曲替换本机歌单内容。`]
  if (plan.droppedLocal > 0) {
    parts.push(`本机的 ${plan.droppedLocal} 首本地文件 / 已下载副本会被移出歌单（云端不保存它们）。`)
  }
  if (plan.unplayable > 0) {
    parts.push(`其中 ${plan.unplayable} 首没有对应的音源插件，覆盖后无法播放。`)
  }
  return parts.join('')
}
