/**
 * 把当前播放队列整理成一张新歌单的草稿（桌面版 `views/music/songlist.vue`
 * 的「从播放列表」导入方式）。
 *
 * 桌面版在音乐库的「选择导入方式」里提供「从播放列表 —— 将当前播放列表保存为歌单」。
 * 移动端此前没有对应能力：队列可以导出成 `.cmpl` 文件，但想把它留成一个歌单，
 * 只能逐首点「加入歌单」，几十首的队列基本没法做。
 *
 * 命名与描述沿用桌面版同一份口径（`播放列表 YYYY-MM-DD HH:mm` /
 * `从播放列表导入，共 N 首歌曲`），因此两端存出来的歌单长得一样。
 * 队列里同一首可能因为「下一首播放」等操作出现重复项，这里按 key 去重，
 * 并把跳过的数量带回去，让调用方能如实提示。
 */

import type { Track } from '@/types/music'

export interface QueuePlaylistDraft {
  /** 歌单名，与桌面版逐字同格式。 */
  name: string
  /** 歌单描述，含曲目数量。 */
  description: string
  /** 去重后的曲目，保持队列顺序。 */
  tracks: Track[]
  /** 因 key 重复而被跳过的条数。 */
  skipped: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** `播放列表 YYYY-MM-DD HH:mm`。时间按本机时区，与桌面版一致。 */
export function queuePlaylistName(now: Date = new Date()): string {
  return (
    `播放列表 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    ` ${pad(now.getHours())}:${pad(now.getMinutes())}`
  )
}

/**
 * 队列 → 歌单草稿。
 *
 * 空队列不是「导出一张空歌单」而是**没有可保存的东西**：桌面版此时只弹一句
 * 「当前播放列表为空，无法导入」。这里抛出同样的意思，让调用方统一走错误提示。
 */
export function buildQueuePlaylistDraft(
  queue: readonly Track[],
  now: Date = new Date()
): QueuePlaylistDraft {
  if (!queue.length) throw new Error('当前播放队列为空，无法保存为歌单')

  const seen = new Set<string>()
  const tracks: Track[] = []
  for (const track of queue) {
    if (!track?.key) continue
    if (seen.has(track.key)) continue
    seen.add(track.key)
    tracks.push(track)
  }
  if (!tracks.length) throw new Error('播放队列里没有可保存的歌曲')

  return {
    name: queuePlaylistName(now),
    description: `从播放列表导入，共 ${tracks.length} 首歌曲`,
    tracks,
    skipped: queue.length - tracks.length
  }
}
