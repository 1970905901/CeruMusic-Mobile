import { describe, expect, it } from 'vitest'
import {
  describePlaylistStats,
  formatPlaylistDuration,
  intervalSeconds,
  splitArtists,
  summarizePlaylist
} from './playlistStats'

describe('playlist duration parsing', () => {
  it('reads mm:ss and hh:mm:ss strings', () => {
    expect(intervalSeconds('05:41')).toBe(341)
    expect(intervalSeconds('1:05:41')).toBe(3941)
  })

  it('reads millisecond numbers and numeric strings', () => {
    // 桌面版的旧数据里 interval 有时是毫秒数字串。
    expect(intervalSeconds(341000)).toBe(341)
    expect(intervalSeconds('341000')).toBe(341)
  })

  it('returns zero for junk instead of NaN', () => {
    // 一首脏数据不能把整个歌单的统计变成 NaN。
    for (const value of [undefined, null, '', 'abc', '05:xx', -1, Number.NaN]) {
      expect(intervalSeconds(value)).toBe(0)
    }
  })
})

describe('playlist artist splitting', () => {
  it('accepts the structured artists array first', () => {
    expect(splitArtists({ artists: ['周杰伦', '方文山'] })).toEqual(['周杰伦', '方文山'])
  })

  it('splits legacy singer strings on every separator in use', () => {
    expect(splitArtists({ singer: '周杰伦 / 方文山' })).toEqual(['周杰伦', '方文山'])
    expect(splitArtists({ singer: 'A、B&C，D·E' })).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('returns nothing for a missing singer', () => {
    expect(splitArtists({})).toEqual([])
  })
})

describe('playlist summary', () => {
  it('counts songs, total duration and distinct artists', () => {
    const stats = summarizePlaylist([
      { durationMs: 200000, artists: ['周杰伦'] },
      { durationMs: 100000, artists: ['周杰伦', '方文山'] },
      { interval: '01:00', singer: '方文山' }
    ])
    expect(stats).toEqual({ totalSongs: 3, totalDurationSec: 360, artistCount: 2 })
  })

  it('does not double count an artist appearing in several songs', () => {
    const stats = summarizePlaylist([
      { durationMs: 1000, artists: ['同一个人'] },
      { durationMs: 1000, artists: ['同一个人'] }
    ])
    expect(stats.artistCount).toBe(1)
  })

  it('handles an empty playlist', () => {
    expect(summarizePlaylist([])).toEqual({ totalSongs: 0, totalDurationSec: 0, artistCount: 0 })
  })
})

describe('playlist stats display', () => {
  it('formats short and long totals', () => {
    expect(formatPlaylistDuration(341)).toBe('05:41')
    expect(formatPlaylistDuration(3941)).toBe('01:05:41')
    expect(formatPlaylistDuration(-5)).toBe('00:00')
  })

  it('omits parts that have no data', () => {
    expect(describePlaylistStats({ totalSongs: 3, totalDurationSec: 0, artistCount: 0 })).toBe('3 首')
    expect(describePlaylistStats({ totalSongs: 3, totalDurationSec: 341, artistCount: 2 })).toBe(
      '3 首 · 05:41 · 2 位歌手'
    )
  })
})
