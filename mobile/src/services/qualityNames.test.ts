import { describe, expect, it } from 'vitest'
import {
  buildQualitySelectOptions,
  collectQualityTypes,
  getLocalFileQualityLabel,
  getQualityDescription,
  getQualityDisplayName,
  mergeSavedQualityTypes,
  QUALITY_DISPLAY_NAMES
} from './qualityNames'

describe('quality display names', () => {
  it('maps known quality types to Chinese names', () => {
    expect(getQualityDisplayName('128k')).toBe('标准')
    expect(getQualityDisplayName('320k')).toBe('超高')
    expect(getQualityDisplayName('flac')).toBe('无损')
    expect(getQualityDisplayName('hires')).toBe('高清臻音')
    expect(getQualityDisplayName('flac24bit')).toBe('超高解析')
    expect(getQualityDisplayName('atmos_plus')).toBe('全景增强')
    expect(getQualityDisplayName('master')).toBe('超清母带')
  })

  it('accepts { type } objects and trims input', () => {
    expect(getQualityDisplayName({ type: 'flac' })).toBe('无损')
    expect(getQualityDisplayName({ type: ' hires ' })).toBe('高清臻音')
    expect(getQualityDisplayName({ type: undefined })).toBe('')
  })

  it('passes unknown types through and handles empty input', () => {
    expect(getQualityDisplayName('dolby')).toBe('dolby')
    expect(getQualityDisplayName('')).toBe('')
    expect(getQualityDisplayName(null)).toBe('')
    expect(getQualityDisplayName(undefined)).toBe('')
  })

  it('describes known qualities and falls back for unknown ones', () => {
    expect(getQualityDescription('flac')).toBe('无损音质，完美还原原始录音')
    expect(getQualityDescription('master')).toBe('母带级音质,192kHz/24bit')
    expect(getQualityDescription('dolby')).toBe('自定义音质设置')
    expect(getQualityDescription('')).toBe('自定义音质设置')
  })

  it('keeps display names and descriptions in sync with the desktop map', () => {
    for (const type of Object.keys(QUALITY_DISPLAY_NAMES)) {
      expect(getQualityDisplayName(type)).not.toBe('')
      expect(getQualityDescription(type)).not.toBe('自定义音质设置')
    }
  })
})

describe('quality option lists', () => {
  it('collects types across providers preserving first-seen order', () => {
    expect(
      collectQualityTypes([
        ['128k', '320k', 'flac'],
        ['320k', 'hires'],
        undefined,
        []
      ])
    ).toEqual(['128k', '320k', 'flac', 'hires'])
  })

  it('ignores blank entries and non-array input', () => {
    expect(collectQualityTypes([['', '  ', 'flac'], undefined])).toEqual(['flac'])
    expect(collectQualityTypes([])).toEqual([])
  })

  it('builds select options with an empty placeholder first', () => {
    expect(buildQualitySelectOptions(['128k', 'flac'], '自动（最高）')).toEqual([
      { value: '', label: '自动（最高）' },
      { value: '128k', label: '标准' },
      { value: 'flac', label: '无损' }
    ])
    expect(buildQualitySelectOptions([], '不限制')).toEqual([{ value: '', label: '不限制' }])
  })

  it('merges saved qualities that the current plugins no longer declare', () => {
    expect(mergeSavedQualityTypes(['128k', 'flac'], ['flac', 'hires', ''])).toEqual([
      '128k',
      'flac',
      'hires'
    ])
    expect(mergeSavedQualityTypes([], [null, undefined, '  '])).toEqual([])
    expect(mergeSavedQualityTypes(['flac'], [' flac '])).toEqual(['flac'])
  })
})

describe('local file quality labels', () => {
  it('labels lossless containers', () => {
    expect(getLocalFileQualityLabel('/music/song.flac')).toBe('无损')
    expect(getLocalFileQualityLabel('song.WAV')).toBe('无损')
    expect(getLocalFileQualityLabel('song.ape')).toBe('无损')
    expect(getLocalFileQualityLabel('song.dff')).toBe('无损')
  })

  it('returns nothing for lossy containers or missing names', () => {
    expect(getLocalFileQualityLabel('/music/song.mp3')).toBe('')
    expect(getLocalFileQualityLabel('/music/song')).toBe('')
    expect(getLocalFileQualityLabel(undefined)).toBe('')
    expect(getLocalFileQualityLabel('')).toBe('')
  })
})
