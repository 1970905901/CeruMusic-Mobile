import { describe, expect, it } from 'vitest'
import { karaokeMaskStyle, karaokeProgress } from './lyricKaraoke'
import type { LyricLine } from '@/types/music'

const line: LyricLine = { startMs: 1000, endMs: 3000, text: 'morning light' }

describe('apple style lyric karaoke', () => {
  it('holds at the start before the line begins', () => {
    expect(karaokeProgress(line, 0)).toBe(0)
    expect(karaokeProgress(line, 1000)).toBe(0)
  })

  it('sweeps linearly across the line', () => {
    expect(karaokeProgress(line, 2000)).toBeCloseTo(0.5, 5)
    expect(karaokeProgress(line, 2500)).toBeCloseTo(0.75, 5)
  })

  it('clamps to fully sung at and past the end', () => {
    expect(karaokeProgress(line, 3000)).toBe(1)
    expect(karaokeProgress(line, 9000)).toBe(1)
  })

  it('estimates progress when the line has no end time', () => {
    expect(karaokeProgress({ startMs: 0, text: 'x' }, 1500)).toBeCloseTo(0.5, 5)
  })

  it('ignores missing lines and non finite positions', () => {
    expect(karaokeProgress(undefined, 1200)).toBe(0)
    expect(karaokeProgress(line, Number.NaN)).toBe(0)
  })

  it('returns mask variables only when the renderer is enabled', () => {
    expect(karaokeMaskStyle(line, 2000, true)).toEqual({ '--karaoke-mask-x': '50.00%' })
    expect(karaokeMaskStyle(line, 1000, true)).toEqual({ '--karaoke-mask-x': '100.00%' })
    expect(karaokeMaskStyle(line, 3000, true)).toEqual({ '--karaoke-mask-x': '0.00%' })
    expect(karaokeMaskStyle(line, 2000, false)).toBeUndefined()
    expect(karaokeMaskStyle(undefined, 2000, true)).toBeUndefined()
  })
})
