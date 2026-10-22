import { describe, expect, it } from 'vitest'
import {
  formatStartTime,
  normalizeRecognitionResults,
  parseStartTimeMs
} from './recognizeResults'

describe('recognition result normalization', () => {
  it('accepts the three shapes plugins return', () => {
    const item = { name: '夜曲', singer: '周杰伦' }
    expect(normalizeRecognitionResults([item])).toHaveLength(1)
    expect(normalizeRecognitionResults({ items: [item] })).toHaveLength(1)
    expect(normalizeRecognitionResults({ songs: [item] })).toHaveLength(1)
    expect(normalizeRecognitionResults(null)).toEqual([])
    expect(normalizeRecognitionResults('oops')).toEqual([])
  })

  it('keeps the recognized fragment offset so playback can jump to it', () => {
    // 桌面版会把 startTime 显示成「识别片段」并在播放后 seek 过去。
    const [result] = normalizeRecognitionResults([{ name: '晴天', startTime: 192000 }])
    expect(result.startTimeMs).toBe(192000)
    expect(formatStartTime(result.startTimeMs)).toBe('03:12')
  })

  it('treats fractional sub-1000 values as seconds', () => {
    // 有些插件给的是秒；12.5 若当成毫秒就只剩 12ms，跳转等于没跳。
    expect(parseStartTimeMs(12.5)).toBe(12500)
    expect(parseStartTimeMs(12)).toBe(12)
    expect(parseStartTimeMs('2500')).toBe(2500)
    expect(parseStartTimeMs(0)).toBe(0)
    expect(parseStartTimeMs(-5)).toBe(0)
    expect(parseStartTimeMs('abc')).toBe(0)
  })

  it('flattens array and object artist shapes into readable text', () => {
    const [flat] = normalizeRecognitionResults([
      { name: 'Song', artists: [{ name: 'A' }, { name: 'B' }] }
    ])
    expect(flat.artist).toBe('A / B')
  })

  it('falls back to placeholders instead of blank rows', () => {
    const [result] = normalizeRecognitionResults([{}])
    expect(result.title).toBe('未知歌曲')
    expect(result.artist).toBe('未知艺术家')
    expect(result.startTimeMs).toBe(0)
  })

  it('reads covers from the field names different sources use', () => {
    expect(normalizeRecognitionResults([{ name: 'x', img: 'a.jpg' }])[0].cover).toBe('a.jpg')
    expect(normalizeRecognitionResults([{ name: 'x', pic: 'b.jpg' }])[0].cover).toBe('b.jpg')
    expect(normalizeRecognitionResults([{ name: 'x' }])[0].cover).toBeUndefined()
  })

  it('drops non-object entries rather than rendering empty cards', () => {
    expect(normalizeRecognitionResults([null, 'x', 42, { name: 'ok' }])).toHaveLength(1)
  })
})
