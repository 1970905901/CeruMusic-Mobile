import { describe, expect, it } from 'vitest'
import { BASS_PRESETS, bassPresetFromGain, bassPresetGain } from './bassPresets'

describe('bass presets', () => {
  it('matches the desktop preset gains', () => {
    // 桌面版 applyBassPreset: light 3 / medium 6 / heavy 9 dB。
    expect(BASS_PRESETS.map((item) => [item.value, item.gain])).toEqual([
      ['light', 3],
      ['medium', 6],
      ['heavy', 9]
    ])
  })

  it('resolves a preset to its gain', () => {
    expect(bassPresetGain('medium')).toBe(6)
    expect(bassPresetGain('unknown')).toBeNull()
    expect(bassPresetGain('')).toBeNull()
  })

  it('finds the preset matching an exact gain', () => {
    expect(bassPresetFromGain(3)).toBe('light')
    expect(bassPresetFromGain(9)).toBe('heavy')
  })

  it('returns null for a hand-dragged value so no preset looks selected', () => {
    // 滑杆停在 4.5 dB 时若仍高亮「轻度」，界面会和实际值对不上。
    expect(bassPresetFromGain(4.5)).toBeNull()
    expect(bassPresetFromGain(0)).toBeNull()
    expect(bassPresetFromGain(Number.NaN)).toBeNull()
  })
})
