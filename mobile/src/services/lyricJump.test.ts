import { describe, expect, it } from 'vitest'
import {
  JUMP_MAX_DURATION_MS,
  JUMP_MIN_DURATION_MS,
  lyricJumpAmplitude,
  lyricJumpAnimationMs,
  lyricJumpStyle,
  lyricLineDuration
} from './lyricJump'

describe('jump lyric amplitude', () => {
  it('uses the desktop minimums for very short lines', () => {
    const amplitude = lyricJumpAmplitude(0)
    expect(amplitude.scale).toBeCloseTo(1.02, 5)
    expect(amplitude.liftEm).toBeCloseTo(0, 5)
    expect(amplitude.dropEm).toBeCloseTo(0.16, 5)
  })

  it('uses the desktop maximums for long lines and clamps above the range', () => {
    const longest = lyricJumpAmplitude(JUMP_MAX_DURATION_MS)
    expect(longest.scale).toBeCloseTo(1.15, 5)
    expect(longest.liftEm).toBeCloseTo(0.01, 5)
    expect(lyricJumpAmplitude(5000).scale).toBeCloseTo(longest.scale, 5)
  })

  it('grows monotonically with line duration', () => {
    let previous = lyricJumpAmplitude(JUMP_MIN_DURATION_MS).scale
    for (let duration = JUMP_MIN_DURATION_MS + 50; duration <= JUMP_MAX_DURATION_MS; duration += 50) {
      const current = lyricJumpAmplitude(duration).scale
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  it('falls back to the minimum duration for non finite input', () => {
    expect(lyricJumpAmplitude(Number.NaN).scale).toBeCloseTo(1.02, 5)
  })
})

describe('jump lyric line duration', () => {
  it('uses the real span when the line is closed', () => {
    expect(lyricLineDuration({ startMs: 1000, endMs: 2600 })).toBe(1600)
  })

  it('estimates the span when the end time is missing or invalid', () => {
    expect(lyricLineDuration({ startMs: 1000 })).toBe(3000)
    expect(lyricLineDuration({ startMs: 1000, endMs: 1000 })).toBe(3000)
  })

  it('keeps the desktop minimum animation time', () => {
    expect(lyricJumpAnimationMs(200)).toBe(1100)
    expect(lyricJumpAnimationMs(4000)).toBe(4000)
  })
})

describe('jump lyric style', () => {
  it('returns CSS variables for the active line when enabled', () => {
    expect(lyricJumpStyle({ startMs: 0, endMs: 800 }, true)).toEqual({
      '--lyric-jump-scale': '1.150',
      '--lyric-jump-drop': '0.160em',
      '--lyric-jump-lift': '0.010em',
      '--lyric-jump-duration': '1.10s'
    })
  })

  it('returns nothing when disabled or the line is unknown', () => {
    expect(lyricJumpStyle({ startMs: 0, endMs: 800 }, false)).toBeUndefined()
    expect(lyricJumpStyle(undefined, true)).toBeUndefined()
  })
})
