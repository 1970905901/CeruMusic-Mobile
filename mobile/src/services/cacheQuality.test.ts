import { describe, expect, it } from 'vitest'
import {
  CACHE_QUALITY_COLORS,
  CACHE_UNKNOWN_COLOR,
  buildDonutArcs,
  formatCacheBytes,
  summarizeCacheQualities
} from './cacheQuality'

describe('formatCacheBytes', () => {
  it('scales units and clamps invalid input', () => {
    expect(formatCacheBytes(0)).toBe('0 B')
    expect(formatCacheBytes(512)).toBe('512 B')
    expect(formatCacheBytes(1536)).toBe('1.5 KB')
    expect(formatCacheBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatCacheBytes(1.5 * 1024 ** 3)).toBe('1.50 GB')
    expect(formatCacheBytes(-10)).toBe('0 B')
    expect(formatCacheBytes(Number.NaN)).toBe('0 B')
  })
})

describe('summarizeCacheQualities', () => {
  it('aggregates by quality with counts, sizes and percentages', () => {
    const result = summarizeCacheQualities(
      [
        { quality: 'flac', sizeBytes: 300 },
        { quality: '320k', sizeBytes: 100 },
        { quality: 'flac', sizeBytes: 100 },
        { quality: '320k', sizeBytes: 100 }
      ],
      ['128k', '320k', 'flac']
    )
    expect(result.audioBytes).toBe(600)
    expect(result.audioFormatted).toBe('600 B')
    expect(result.segments.map((s) => s.quality)).toEqual(['320k', 'flac'])
    const flac = result.segments[1]
    expect(flac).toMatchObject({ count: 2, size: 400, label: '无损' })
    expect(flac.percent).toBeCloseTo(66.666, 2)
    expect(result.segments[0].percent).toBeCloseTo(33.333, 2)
  })

  it('orders by the plugin-declared quality sequence', () => {
    const result = summarizeCacheQualities(
      [
        { quality: 'hires', sizeBytes: 10 },
        { quality: '128k', sizeBytes: 10 },
        { quality: 'flac', sizeBytes: 10 }
      ],
      ['128k', 'flac', 'hires']
    )
    expect(result.segments.map((s) => s.quality)).toEqual(['128k', 'flac', 'hires'])
  })

  it('keeps unknown types after declared ones and labels them', () => {
    const result = summarizeCacheQualities(
      [
        { quality: 'dolby', sizeBytes: 10 },
        { quality: '', sizeBytes: 10 },
        { quality: 'flac', sizeBytes: 20 }
      ],
      ['flac']
    )
    expect(result.segments.map((s) => s.quality)).toEqual(['flac', 'dolby', '未知'])
    // Unknown types fall back to their raw name; the empty quality becomes 未知 gray.
    expect(result.segments[1].label).toBe('dolby')
    expect(result.segments[2].label).toBe('未知')
    expect(result.segments[2].color).toBe(CACHE_UNKNOWN_COLOR)
    expect(result.segments[0].color).toBe(CACHE_QUALITY_COLORS[0])
  })

  it('skips empty or invalid sizes and handles an empty cache', () => {
    const result = summarizeCacheQualities([
      { quality: 'flac', sizeBytes: 0 },
      { quality: 'flac' },
      { quality: 'flac', sizeBytes: -5 }
    ])
    expect(result.segments).toEqual([])
    expect(result.audioBytes).toBe(0)
    expect(result.audioFormatted).toBe('0 B')
  })

  it('handles a missing entry list', () => {
    expect(summarizeCacheQualities(undefined as any).segments).toEqual([])
  })
})

describe('buildDonutArcs', () => {
  it('accumulates dash offsets around the circumference', () => {
    const arcs = buildDonutArcs([{ color: 'a', percent: 50 }, { color: 'b', percent: 25 }], 50)
    const circumference = 2 * Math.PI * 50
    expect(arcs[0].dashArray).toBe(`${circumference / 2} ${circumference / 2}`)
    expect(arcs[0].dashOffset).toBe(-0)
    expect(arcs[1].dashOffset).toBeCloseTo(-(circumference / 2), 5)
  })

  it('clamps bad percentages and tolerates an empty list', () => {
    const arcs = buildDonutArcs([{ color: 'a', percent: -20 }, { color: 'b', percent: Number.NaN }], 50)
    expect(arcs.every((arc) => arc.dashArray.startsWith('0 '))).toBe(true)
    expect(buildDonutArcs([])).toEqual([])
  })
})
