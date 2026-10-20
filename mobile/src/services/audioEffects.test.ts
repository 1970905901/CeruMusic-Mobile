import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUDIO_EFFECTS_STATE,
  EQ_FREQUENCIES,
  clampEqualizerGains,
  effectiveBalance,
  effectiveBassGain,
  effectiveEqualizerGains,
  effectiveLoudness,
  effectiveSurroundMode,
  hasActiveEffects,
  type AudioEffectsState
} from '@/services/audioEffects'

function makeState(overrides: Partial<AudioEffectsState> = {}): AudioEffectsState {
  return {
    ...DEFAULT_AUDIO_EFFECTS_STATE,
    equalizerGains: [...DEFAULT_AUDIO_EFFECTS_STATE.equalizerGains],
    bassBoost: { ...DEFAULT_AUDIO_EFFECTS_STATE.bassBoost },
    surround: { ...DEFAULT_AUDIO_EFFECTS_STATE.surround },
    balance: { ...DEFAULT_AUDIO_EFFECTS_STATE.balance },
    loudness: { ...DEFAULT_AUDIO_EFFECTS_STATE.loudness },
    ...overrides
  }
}

describe('audio effects helpers', () => {
  it('normalizes gains to ten clamped bands', () => {
    expect(clampEqualizerGains([20, -20])).toEqual([
      12, -12, 0, 0, 0, 0, 0, 0, 0, 0
    ])
    expect(clampEqualizerGains(new Array(EQ_FREQUENCIES.length + 3).fill(1))).toHaveLength(
      EQ_FREQUENCIES.length
    )
    expect(clampEqualizerGains([Number.NaN])[0]).toBe(0)
  })

  it('bypasses equalizer gains while disabled', () => {
    const state = makeState({ equalizerEnabled: false, equalizerGains: new Array(10).fill(6) })
    expect(effectiveEqualizerGains(state)).toEqual(new Array(10).fill(0))
    expect(effectiveEqualizerGains({ ...state, equalizerEnabled: true })[0]).toBe(6)
  })

  it('honors enabled flags for every effect', () => {
    const state = makeState({
      bassBoost: { enabled: true, gain: 30 },
      surround: { enabled: true, mode: 'large' },
      balance: { enabled: true, value: -2 },
      loudness: { enabled: true, target: 'strong' }
    })
    expect(effectiveBassGain(state)).toBe(12)
    expect(effectiveSurroundMode(state)).toBe('large')
    expect(effectiveBalance(state)).toBe(-1)
    expect(effectiveLoudness(state)).toEqual({ enabled: true, target: 'strong' })
  })

  it('returns neutral values when effects are disabled', () => {
    const state = makeState()
    expect(effectiveBassGain(state)).toBe(0)
    expect(effectiveSurroundMode(state)).toBe('off')
    expect(effectiveBalance(state)).toBe(0)
    expect(effectiveLoudness(state)).toEqual({ enabled: false, target: 'standard' })
  })

  it('treats a centered balance as inactive', () => {
    expect(hasActiveEffects(makeState())).toBe(false)
    expect(hasActiveEffects(makeState({ balance: { enabled: true, value: 0.4 } }))).toBe(true)
    expect(hasActiveEffects(makeState({ equalizerEnabled: true }))).toBe(true)
    expect(hasActiveEffects(makeState({ loudness: { enabled: true, target: 'gentle' } }))).toBe(
      true
    )
  })
})
