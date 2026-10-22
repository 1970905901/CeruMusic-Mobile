/**
 * 歌单统计，对齐桌面版 `Settings/PlaylistSettings.vue` 的「播放列表统计」
 * （歌曲数 / 总时长 / 歌手数）。
 *
 * 桌面版解析的是旧接口的 `song.interval` 字符串（`"05:41"` 或毫秒数字串）；
 * 移动端的曲目已经有 `durationMs` 数值，但为了兼容从旧歌单文件/云端导入的数据，
 * 这里两种都能吃。
 */

export interface PlaylistStatsSource {
  durationMs?: number
  interval?: string | number
  artists?: readonly string[]
  singer?: string
}

export interface PlaylistStats {
  totalSongs: number
  /** 总时长（秒）。 */
  totalDurationSec: number
  artistCount: number
}

/** 歌手名之间常见的分隔符：桌面版用 `/ 、 &`，移动端数据里还会出现中文逗号与 `·`。 */
const ARTIST_SEPARATORS = /[/、,&，·]/

export function splitArtists(song: PlaylistStatsSource): string[] {
  if (Array.isArray(song.artists) && song.artists.length) {
    return song.artists.map((name) => String(name || '').trim()).filter(Boolean)
  }
  const text = String(song.singer ?? '').trim()
  if (!text) return []
  return text
    .split(ARTIST_SEPARATORS)
    .map((name) => name.trim())
    .filter(Boolean)
}

/**
 * 把 `interval` 解析成秒：支持 `"05:41"`、`"1:05:41"` 与毫秒数字串。
 * 无法识别时返回 0，而不是 NaN——统计不能因为一首脏数据整体变成 NaN。
 */
export function intervalSeconds(interval: unknown): number {
  if (typeof interval === 'number') {
    return Number.isFinite(interval) && interval > 0 ? interval / 1000 : 0
  }
  if (typeof interval !== 'string') return 0
  const text = interval.trim()
  if (!text) return 0
  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number(part))
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0
    // 从右往左按 秒/分/时 累加，兼容 "mm:ss" 与 "hh:mm:ss"。
    return parts.reduce((total, part) => total * 60 + part, 0)
  }
  const milliseconds = Number(text)
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds / 1000 : 0
}

function songSeconds(song: PlaylistStatsSource): number {
  const durationMs = Number(song.durationMs)
  if (Number.isFinite(durationMs) && durationMs > 0) return durationMs / 1000
  return intervalSeconds(song.interval)
}

export function summarizePlaylist(songs: readonly PlaylistStatsSource[]): PlaylistStats {
  let totalDurationSec = 0
  const artists = new Set<string>()
  for (const song of songs) {
    totalDurationSec += songSeconds(song)
    for (const name of splitArtists(song)) artists.add(name)
  }
  return {
    totalSongs: songs.length,
    totalDurationSec: Math.round(totalDurationSec),
    artistCount: artists.size
  }
}

/** `01:05:07` / `05:07` 两种形态，与桌面版 `formatDuration` 一致。 */
export function formatPlaylistDuration(totalSeconds: number): string {
  const value = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = value % 60
  const pad = (part: number) => String(part).padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** 一行可读摘要，歌单头部直接显示。 */
export function describePlaylistStats(stats: PlaylistStats): string {
  const parts = [`${stats.totalSongs} 首`]
  if (stats.totalDurationSec > 0) parts.push(formatPlaylistDuration(stats.totalDurationSec))
  if (stats.artistCount > 0) parts.push(`${stats.artistCount} 位歌手`)
  return parts.join(' · ')
}
