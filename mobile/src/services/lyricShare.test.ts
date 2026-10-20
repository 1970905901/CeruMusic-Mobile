import { describe, expect, it } from 'vitest'
import type { LyricLine, Track } from '@/types/music'
import { buildLyricShareText, formatLyricTimestamp } from './lyricShare'

describe('lyricShare service', () => {
  const dummyTrack: Track = {
    key: 'dummy_1',
    ref: { providerId: 'test', kind: 'track', id: '1', scope: 'provider' },
    title: '海阔天空',
    artists: ['Beyond'],
    album: '乐与怒',
    qualities: ['128k'],
    playable: true,
    raw: {}
  }

  const dummyLines: LyricLine[] = [
    { startMs: 15400, text: '今天我 寒夜里看雪飘过', translation: 'Today I watch the snow falling in the cold night' },
    { startMs: 22100, text: '怀着冷却了的心窝漂远方', romanization: 'waai zyu laang koek liu dik sam wo' },
    { startMs: 30000, text: '风雨里追赶 雾里分不清影踪' }
  ]

  it('formats timestamp correctly', () => {
    expect(formatLyricTimestamp(0)).toBe('[00:00.00]')
    expect(formatLyricTimestamp(65430)).toBe('[01:05.43]')
    expect(formatLyricTimestamp(12500)).toBe('[00:12.50]')
  })

  it('builds formatted share text with track title and selected lines', () => {
    const text = buildLyricShareText({
      track: dummyTrack,
      lines: dummyLines,
      selectedIndices: [0, 1],
      includeTranslation: true,
      includeRomanization: true,
      includeTimestamp: false
    })

    expect(text).toContain('《海阔天空》 - Beyond (乐与怒)')
    expect(text).toContain('今天我 寒夜里看雪飘过')
    expect(text).toContain('Today I watch the snow falling in the cold night')
    expect(text).toContain('怀着冷却了的心窝漂远方')
    expect(text).toContain('waai zyu laang koek liu dik sam wo')
    expect(text).not.toContain('风雨里追赶')
  })

  it('includes timestamps when requested', () => {
    const text = buildLyricShareText({
      track: dummyTrack,
      lines: dummyLines,
      selectedIndices: [0],
      includeTimestamp: true
    })

    expect(text).toContain('[00:15.40] 今天我 寒夜里看雪飘过')
  })

  it('handles plain text fallback when lines are empty', () => {
    const text = buildLyricShareText({
      track: dummyTrack,
      lines: [],
      selectedIndices: [],
      plainTextFallback: '纯文本歌词第一行\n纯文本歌词第二行'
    })

    expect(text).toContain('《海阔天空》 - Beyond (乐与怒)')
    expect(text).toContain('纯文本歌词第一行')
  })
})