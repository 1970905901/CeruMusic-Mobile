import { describe, expect, it } from 'vitest'
import {
  describeQualityCoverage,
  intersectQualities,
  isQualitySupportedEverywhere
} from './qualityIntersection'

const a = { id: 'a', qualities: ['128k', '320k', 'flac'] }
const b = { id: 'b', qualities: ['128k', '320k'] }

describe('quality intersection', () => {
  it('keeps only what every source supports, in the first source’s order', () => {
    expect(intersectQualities([a, b])).toEqual(['128k', '320k'])
  })

  it('ignores case and surrounding whitespace', () => {
    expect(
      intersectQualities([
        { id: 'a', qualities: ['FLAC'] },
        { id: 'b', qualities: [' flac '] }
      ])
    ).toEqual(['FLAC'])
  })

  it('returns nothing when the sources share no quality', () => {
    expect(
      intersectQualities([
        { id: 'a', qualities: ['flac'] },
        { id: 'b', qualities: ['128k'] }
      ])
    ).toEqual([])
  })

  it('handles no sources and empty declarations', () => {
    expect(intersectQualities([])).toEqual([])
    expect(intersectQualities([{ id: 'a', qualities: [] }])).toEqual([])
  })

  it('deduplicates a repeated quality', () => {
    expect(intersectQualities([{ id: 'a', qualities: ['320k', '320k'] }])).toEqual(['320k'])
  })
})

describe('quality coverage', () => {
  it('treats a quality as supported only when every source offers it', () => {
    expect(isQualitySupportedEverywhere('320k', [a, b])).toBe(true)
    expect(isQualitySupportedEverywhere('flac', [a, b])).toBe(false)
  })

  it('does not count an empty (automatic) selection as supported', () => {
    expect(isQualitySupportedEverywhere('', [a])).toBe(false)
    expect(isQualitySupportedEverywhere(undefined, [a])).toBe(false)
  })

  it('explains how many sources would have to fall back', () => {
    expect(describeQualityCoverage('flac', [a, b])).toContain('1 个音源不支持')
  })

  it('stays quiet when the quality is covered, empty or there are no sources', () => {
    // 提示只在真的会降级时出现，否则设置页会一直挂着一句废话。
    expect(describeQualityCoverage('320k', [a, b])).toBe('')
    expect(describeQualityCoverage('', [a, b])).toBe('')
    expect(describeQualityCoverage('flac', [])).toBe('')
  })
})
