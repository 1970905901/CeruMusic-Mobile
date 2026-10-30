import { describe, expect, it } from 'vitest'
import { buildQueuePlaylistDraft, queuePlaylistName } from './queuePlaylistDraft'
import type { Track } from '@/types/music'

function track(key: string): Track {
  return {
    key,
    ref: { providerId: 'wy', kind: 'track', id: key } as Track['ref'],
    title: key,
    artists: [],
    qualities: [],
    playable: true,
    raw: {}
  }
}

describe('queue playlist draft', () => {
  it('names the playlist like the desktop app', () => {
    expect(queuePlaylistName(new Date(2026, 9, 30, 14, 5))).toBe('播放列表 2026-10-30 14:05')
    // 月份与日期补零，避免出现 `播放列表 2026-1-5`。
    expect(queuePlaylistName(new Date(2026, 0, 5, 7, 9))).toBe('播放列表 2026-01-05 07:09')
  })

  it('keeps queue order and describes the track count', () => {
    const draft = buildQueuePlaylistDraft([track('a'), track('b'), track('c')], new Date(2026, 9, 30, 14, 5))
    expect(draft.name).toBe('播放列表 2026-10-30 14:05')
    expect(draft.description).toBe('从播放列表导入，共 3 首歌曲')
    expect(draft.tracks.map((item) => item.key)).toEqual(['a', 'b', 'c'])
    expect(draft.skipped).toBe(0)
  })

  it('drops repeated queue entries instead of writing duplicates', () => {
    // 「下一首播放」/重复加入会让队列里出现同一首两次；歌单里存两份只是噪音。
    const draft = buildQueuePlaylistDraft([track('a'), track('b'), track('a')])
    expect(draft.tracks.map((item) => item.key)).toEqual(['a', 'b'])
    expect(draft.description).toBe('从播放列表导入，共 2 首歌曲')
    expect(draft.skipped).toBe(1)
  })

  it('refuses an empty queue instead of creating an empty playlist', () => {
    expect(() => buildQueuePlaylistDraft([])).toThrow('当前播放队列为空，无法保存为歌单')
  })

  it('refuses when nothing in the queue carries a key', () => {
    const broken = [{ ...track('x'), key: '' } as Track]
    expect(() => buildQueuePlaylistDraft(broken)).toThrow('播放队列里没有可保存的歌曲')
  })
})
