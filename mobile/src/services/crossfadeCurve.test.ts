import { describe, expect, it } from 'vitest'
import {
  EMERGENCY_REMAINING_SEC,
  FADE_SAFETY_MARGIN_SEC,
  FORCED_REMAINING_SEC,
  MAX_FADE_TIME_SEC,
  MIN_FADE_TIME_SEC,
  MIN_SONG_DURATION_SEC,
  OBSERVATION_WINDOW_SEC,
  QUIET_REMAINING_SEC,
  RMS_WINDOW_SIZE,
  canCrossfade,
  crossfadeCurves,
  fadeDuration,
  markRange,
  pushRmsSample,
  shouldTrigger,
  timeDomainRms
} from './crossfadeCurve'

describe('crossfade timing', () => {
  it('scales the fade with the remaining time and clamps it to the desktop range', () => {
    expect(fadeDuration(60)).toBe(MAX_FADE_TIME_SEC)
    expect(fadeDuration(20)).toBe(MAX_FADE_TIME_SEC)
    expect(fadeDuration(16)).toBe(MAX_FADE_TIME_SEC)
    // 15 - margin is still above the cap, so the maximum fade applies.
    expect(fadeDuration(15)).toBe(MAX_FADE_TIME_SEC)
    expect(fadeDuration(12 + FADE_SAFETY_MARGIN_SEC)).toBe(MAX_FADE_TIME_SEC)
    expect(fadeDuration(9)).toBeCloseTo(9 - FADE_SAFETY_MARGIN_SEC, 6)
    expect(fadeDuration(3)).toBe(MIN_FADE_TIME_SEC)
  })

  it('falls back to the shortest fade for a non-finite remainder', () => {
    expect(fadeDuration(Number.NaN)).toBe(MIN_FADE_TIME_SEC)
  })

  it('marks the desktop observation window on the progress bar', () => {
    const range = markRange(200)
    expect(range).toEqual({ start: 200 - OBSERVATION_WINDOW_SEC, end: 200 - FORCED_REMAINING_SEC })
  })

  it('omits the mark range for tracks that are too short', () => {
    expect(markRange(MIN_SONG_DURATION_SEC - 1)).toBeNull()
    expect(markRange(0)).toBeNull()
    expect(canCrossfade(MIN_SONG_DURATION_SEC)).toBe(true)
    expect(canCrossfade(MIN_SONG_DURATION_SEC - 1)).toBe(false)
  })
})

describe('crossfade trigger rules', () => {
  it('never triggers before the observation window', () => {
    expect(shouldTrigger({ durationSec: 200, remainingSec: OBSERVATION_WINDOW_SEC + 1, avgRms: 0.6 })).toBe(false)
  })

  it('triggers on a quiet moment inside the quiet window', () => {
    expect(shouldTrigger({ durationSec: 200, remainingSec: QUIET_REMAINING_SEC, avgRms: 0.01 })).toBe(true)
  })

  it('does not trigger on a loud moment before the forced deadline', () => {
    expect(shouldTrigger({ durationSec: 200, remainingSec: QUIET_REMAINING_SEC, avgRms: 0.5 })).toBe(false)
  })

  it('always triggers at the forced and emergency deadlines', () => {
    expect(shouldTrigger({ durationSec: 200, remainingSec: FORCED_REMAINING_SEC, avgRms: 0.9 })).toBe(true)
    expect(shouldTrigger({ durationSec: 200, remainingSec: EMERGENCY_REMAINING_SEC, avgRms: 0.9 })).toBe(true)
  })

  it('ignores an already finished track', () => {
    expect(shouldTrigger({ durationSec: 200, remainingSec: 0, avgRms: 0 })).toBe(false)
  })
})

describe('crossfade curves', () => {
  it('starts and ends the equal-power pair', () => {
    expect(crossfadeCurves.fadeOut[0]).toBeCloseTo(1, 6)
    expect(crossfadeCurves.fadeIn[0]).toBeCloseTo(0, 6)
    const last = crossfadeCurves.fadeOut.length - 1
    expect(crossfadeCurves.fadeOut[last]).toBeCloseTo(0, 6)
    expect(crossfadeCurves.fadeIn[last]).toBeCloseTo(1, 6)
  })

  it('keeps the summed power constant across the fade', () => {
    for (let index = 0; index < crossfadeCurves.fadeOut.length; index += 1) {
      const out = crossfadeCurves.fadeOut[index]
      const inner = crossfadeCurves.fadeIn[index]
      expect(out * out + inner * inner).toBeCloseTo(1, 5)
    }
  })

  it('stays monotonic in both directions', () => {
    const length = crossfadeCurves.fadeOut.length
    for (let index = 1; index < length; index += 1) {
      // float32 rounding flattens the first steps, so require monotonic, not strict.
      expect(crossfadeCurves.fadeOut[index]).toBeLessThanOrEqual(crossfadeCurves.fadeOut[index - 1])
      expect(crossfadeCurves.fadeIn[index]).toBeGreaterThanOrEqual(crossfadeCurves.fadeIn[index - 1])
    }
    // The ends must still differ, otherwise the curve would be flat throughout.
    expect(crossfadeCurves.fadeOut[length - 1]).toBeLessThan(0.5)
  })
})

describe('rms observation', () => {
  it('measures a centred silence frame as zero', () => {
    expect(timeDomainRms(new Uint8Array([128, 128, 128, 128]))).toBe(0)
  })

  it('measures a full-scale frame as one', () => {
    // A byte of 255 maps to 255/128-1 = 0.9921875, matching the desktop formula.
    expect(timeDomainRms(new Uint8Array([0, 255, 0, 255]))).toBeCloseTo(0.9961, 3)
    expect(timeDomainRms(new Uint8Array([0, 255, 0, 255]))).toBeLessThan(1)
  })

  it('returns zero for an empty frame', () => {
    expect(timeDomainRms(new Uint8Array(0))).toBe(0)
  })

  it('averages the rolling window and drops the oldest sample', () => {
    const window: number[] = []
    for (let index = 0; index < RMS_WINDOW_SIZE; index += 1) pushRmsSample(window, 0)
    expect(pushRmsSample(window, 1)).toBeCloseTo(0.1, 6)
    expect(window).toHaveLength(RMS_WINDOW_SIZE)
  })
})
