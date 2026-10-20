import { describe, expect, it } from 'vitest'
import {
  BEAT_BRIGHTNESS_BASE,
  BEAT_BRIGHTNESS_RANGE,
  BEAT_SCALE_BASE,
  BEAT_SCALE_RANGE,
  backgroundBeatStyle,
  beatBrightness,
  beatScale,
  clampBeat,
  createBackgroundBeatSmoother
} from './backgroundBeat'

describe('background beat mapping', () => {
  it('clamps non-finite and out-of-range input', () => {
    expect(clampBeat(-1)).toBe(0)
    expect(clampBeat(2)).toBe(1)
    expect(clampBeat(Number.NaN)).toBe(0)
    expect(clampBeat(0.5)).toBe(0.5)
  })

  it('maps the low-frequency level onto the desktop scale and brightness range', () => {
    expect(beatScale(0)).toBeCloseTo(BEAT_SCALE_BASE, 6)
    expect(beatScale(1)).toBeCloseTo(BEAT_SCALE_BASE + BEAT_SCALE_RANGE, 6)
    expect(beatBrightness(0)).toBeCloseTo(BEAT_BRIGHTNESS_BASE, 6)
    expect(beatBrightness(1)).toBeCloseTo(BEAT_BRIGHTNESS_BASE + BEAT_BRIGHTNESS_RANGE, 6)
  })

  it('emits no variables when the effect is disabled', () => {
    expect(backgroundBeatStyle(0.8, false)).toEqual({})
  })

  it('emits the CSS variables consumed by the player background', () => {
    const style = backgroundBeatStyle(1, true)
    expect(style['--bg-beat-scale']).toBe('1.0800')
    expect(style['--bg-beat-brightness']).toBe('1.2800')
  })
})

describe('background beat smoother', () => {
  it('jumps to the level on the first sample', () => {
    const smoother = createBackgroundBeatSmoother()
    expect(smoother.push(0.6, 1000)).toBeCloseTo(0.6, 6)
  })

  it('attacks faster than it releases', () => {
    const attack = createBackgroundBeatSmoother()
    attack.push(0, 0)
    const attackAfter = attack.push(1, 100)

    const release = createBackgroundBeatSmoother()
    release.push(1, 0)
    const releaseAfter = release.push(0, 100)

    expect(attackAfter).toBeGreaterThan(1 - releaseAfter)
  })

  it('approaches the target without overshooting', () => {
    const smoother = createBackgroundBeatSmoother()
    smoother.push(0, 0)
    let value = 0
    for (let frame = 1; frame <= 40; frame++) value = smoother.push(1, frame * 33)
    expect(value).toBeGreaterThan(0.9)
    expect(value).toBeLessThanOrEqual(1)
  })

  it('resets back to silence', () => {
    const smoother = createBackgroundBeatSmoother()
    smoother.push(1, 0)
    smoother.reset()
    expect(smoother.push(0, 10)).toBe(0)
  })
})
