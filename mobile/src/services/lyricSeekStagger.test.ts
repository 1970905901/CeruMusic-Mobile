import { describe, expect, it } from 'vitest'
import {
  isSeekJump,
  SEEK_STAGGER_MAX_LINES,
  SEEK_STAGGER_STEP_MS,
  SEEK_STAGGER_WINDOW_MS,
  seekStaggerDelayMs
} from './lyricSeekStagger'

describe('lyric seek stagger', () => {
  it('gives the active line no delay and grows with distance', () => {
    expect(seekStaggerDelayMs(4, 4, true)).toBe(0)
    expect(seekStaggerDelayMs(5, 4, true)).toBe(SEEK_STAGGER_STEP_MS)
    expect(seekStaggerDelayMs(2, 4, true)).toBe(SEEK_STAGGER_STEP_MS * 2)
  })

  it('caps the delay for far away lines', () => {
    const cap = SEEK_STAGGER_STEP_MS * SEEK_STAGGER_MAX_LINES
    expect(seekStaggerDelayMs(4 + SEEK_STAGGER_MAX_LINES, 4, true)).toBe(cap)
    expect(seekStaggerDelayMs(400, 4, true)).toBe(cap)
  })

  it('returns no delay when the switch is off', () => {
    expect(seekStaggerDelayMs(9, 4, false)).toBe(0)
  })

  it('returns no delay without an active line or for invalid indices', () => {
    expect(seekStaggerDelayMs(9, -1, true)).toBe(0)
    expect(seekStaggerDelayMs(-3, 4, true)).toBe(0)
    expect(seekStaggerDelayMs(Number.NaN, 4, true)).toBe(0)
  })

  it('keeps the stagger window past the last delay', () => {
    expect(SEEK_STAGGER_WINDOW_MS).toBeGreaterThan(
      SEEK_STAGGER_STEP_MS * SEEK_STAGGER_MAX_LINES
    )
  })
})

describe('lyric seek jump detection', () => {
  it('treats normal forward playback as no jump', () => {
    expect(isSeekJump(4, 5)).toBe(false)
    expect(isSeekJump(4, 4)).toBe(false)
  })

  it('treats backwards and multi line moves as jumps', () => {
    expect(isSeekJump(4, 3)).toBe(true)
    expect(isSeekJump(4, 9)).toBe(true)
    expect(isSeekJump(4, 1)).toBe(true)
  })

  it('treats the first resolved line as a jump and ignores unknown targets', () => {
    expect(isSeekJump(-1, 0)).toBe(true)
    expect(isSeekJump(4, -1)).toBe(false)
  })
})
