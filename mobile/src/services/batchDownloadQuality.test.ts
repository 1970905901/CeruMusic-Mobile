import { describe, expect, it } from 'vitest'
import { batchQualityChoices, resolveTrackQuality } from './batchDownloadQuality'

// 插件清单顺序：低 → 高。
const ORDER = ['128k', '320k', 'flac', 'hires']

describe('batch quality choices', () => {
  it('unions the qualities of the selected tracks in manifest order', () => {
    const tracks = [{ qualities: ['320k', 'flac'] }, { qualities: ['128k', 'flac'] }]
    expect(batchQualityChoices(tracks, ORDER)).toEqual(['128k', '320k', 'flac'])
  })

  it('follows the manifest order rather than song order', () => {
    // 按歌单顺序拼出来会是 flac,128k，下拉里高低就反了。
    const tracks = [{ qualities: ['flac'] }, { qualities: ['128k'] }]
    expect(batchQualityChoices(tracks, ORDER)).toEqual(['128k', 'flac'])
  })

  it('falls back to whatever the tracks declare when the manifest order is missing', () => {
    expect(batchQualityChoices([{ qualities: ['a', 'b'] }], [])).toEqual(['a', 'b'])
  })

  it('returns an empty list when no track declares anything', () => {
    expect(batchQualityChoices([{ qualities: [] }], ORDER)).toEqual([])
  })
})

describe('per-track quality resolution', () => {
  it('uses the target when the track supports it', () => {
    expect(resolveTrackQuality({ qualities: ['128k', '320k', 'flac'] }, 'flac', ORDER)).toBe('flac')
  })

  it('downgrades to the highest supported quality below the target', () => {
    // 只要 320k 的歌不该被要求下 flac，否则插件报错或给出意外档位。
    expect(resolveTrackQuality({ qualities: ['128k', '320k'] }, 'hires', ORDER)).toBe('320k')
    expect(resolveTrackQuality({ qualities: ['128k', '320k'] }, 'flac', ORDER)).toBe('320k')
  })

  it('never upgrades above the requested quality', () => {
    expect(resolveTrackQuality({ qualities: ['128k', 'flac'] }, '320k', ORDER)).toBe('128k')
  })

  it('returns undefined when the track declares nothing', () => {
    expect(resolveTrackQuality({ qualities: [] }, 'flac', ORDER)).toBeUndefined()
  })

  it('handles tracks whose qualities are outside the manifest order', () => {
    expect(resolveTrackQuality({ qualities: ['odd', 'other'] }, 'flac', ['flac'])).toBe(
      'other'
    )
  })
})
