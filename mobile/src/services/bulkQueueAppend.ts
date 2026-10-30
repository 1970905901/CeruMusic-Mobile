/**
 * 批量加入播放队列的计划（桌面版本地音乐页「添加全部到播放列表」）。
 *
 * 桌面版在本地音乐页的更多菜单里能把整批扫描结果一次加到播放列表末尾，
 * 单曲菜单与批量选择也走同一份 `addToPlaylistEnd` 口径：已在列表里的歌
 * 只会提示「歌曲已在播放列表中」，不会在队尾再塞一份。
 *
 * 移动端此前只有单曲的「加入播放列表」和批量的「下一首」，想一次把整个
 * 歌单或选中的几十首排到队尾没有入口。这里把「该加哪些」抽成纯函数：
 * 队列里已有的、以及**同一批里重复的**都要剔掉，并把剔除数量带回去，
 * 让调用方能如实提示而不是静默少加。
 */

import type { Track } from '@/types/music'

export interface BulkAppendPlan {
  /** 去重后的待追加曲目，保持调用方给的顺序。 */
  toAdd: Track[]
  /** 因为已在队列或本批重复而跳过的曲目数。 */
  skipped: number
}

/**
 * @param queueKeys 当前播放队列里所有曲目的 key
 * @param tracks    想要追加的曲目（可能来自多个入口，可能重复）
 */
export function planBulkAppend(
  queueKeys: Iterable<string>,
  tracks: readonly Track[]
): BulkAppendPlan {
  const taken = new Set<string>(queueKeys)
  const toAdd: Track[] = []
  for (const track of tracks) {
    if (!track?.key || taken.has(track.key)) continue
    taken.add(track.key)
    toAdd.push(track)
  }
  return { toAdd, skipped: tracks.length - toAdd.length }
}
