import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_AUDIO_EFFECTS_STATE,
  EQUALIZER_PRESETS,
  applyTailEffects,
  audioEffectChain,
  clampEqualizerGains,
  hasActiveEffects,
  type AudioEffectsState,
  type EqualizerPreset,
  type LoudnessTarget,
  type SurroundMode
} from '@/services/audioEffects'
import { usePlayerStore } from '@/stores/player'

const STORAGE_KEY = 'ceru-mobile-audio-effects-v1'

function defaultState(): AudioEffectsState {
  return {
    ...DEFAULT_AUDIO_EFFECTS_STATE,
    equalizerGains: [...DEFAULT_AUDIO_EFFECTS_STATE.equalizerGains],
    bassBoost: { ...DEFAULT_AUDIO_EFFECTS_STATE.bassBoost },
    surround: { ...DEFAULT_AUDIO_EFFECTS_STATE.surround },
    balance: { ...DEFAULT_AUDIO_EFFECTS_STATE.balance },
    loudness: { ...DEFAULT_AUDIO_EFFECTS_STATE.loudness }
  }
}

function load(): AudioEffectsState {
  const defaults = defaultState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<AudioEffectsState>
    return {
      ...defaults,
      ...parsed,
      equalizerGains: Array.isArray(parsed.equalizerGains)
        ? clampEqualizerGains(parsed.equalizerGains)
        : defaults.equalizerGains,
      bassBoost: { ...defaults.bassBoost, ...(parsed.bassBoost ?? {}) },
      surround: { ...defaults.surround, ...(parsed.surround ?? {}) },
      balance: { ...defaults.balance, ...(parsed.balance ?? {}) },
      loudness: { ...defaults.loudness, ...(parsed.loudness ?? {}) }
    }
  } catch {
    return defaults
  }
}

export const useAudioEffectsStore = defineStore('audioEffects', () => {
  const player = usePlayerStore()
  const state = ref<AudioEffectsState>(load())
  const presets = ref<EqualizerPreset[]>(
    EQUALIZER_PRESETS.map((preset) => ({ ...preset, gains: [...preset.gains] }))
  )
  const supported = computed(
    () =>
      typeof window !== 'undefined' &&
      !!(window.AudioContext || (window as any).webkitAudioContext)
  )
  const active = computed(() => hasActiveEffects(state.value))

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
    } catch {
      // Preferences remain in memory when storage is unavailable.
    }
  }

  function apply(): void {
    const audio = player.getAudioElement()
    if (!audio) return
    if (!hasActiveEffects(state.value) && !audioEffectChain.active) return
    if (!audioEffectChain.ensure(audio)) return
    audioEffectChain.apply(state.value)
    // 尾巴链（无感过渡的旧歌）跟随同一份设置。
    applyTailEffects(state.value)
  }

  function setEqualizerEnabled(enabled: boolean): void {
    state.value.equalizerEnabled = enabled
  }

  function selectPreset(name: string): void {
    const preset = presets.value.find((item) => item.name === name)
    if (!preset) return
    state.value.equalizerPreset = name
    state.value.equalizerGains = [...preset.gains]
  }

  function setBandGain(index: number, gain: number): void {
    if (index < 0 || index >= state.value.equalizerGains.length) return
    state.value.equalizerGains[index] = gain
    state.value.equalizerPreset = '自定义'
  }

  function resetEqualizer(): void {
    selectPreset('Flat(原声)')
  }

  function setBassBoost(enabled: boolean, gain?: number): void {
    state.value.bassBoost.enabled = enabled
    if (typeof gain === 'number') state.value.bassBoost.gain = gain
  }

  function setSurround(enabled: boolean, mode?: SurroundMode): void {
    state.value.surround.enabled = enabled
    if (mode) state.value.surround.mode = mode
  }

  function setBalance(enabled: boolean, value?: number): void {
    state.value.balance.enabled = enabled
    if (typeof value === 'number') state.value.balance.value = value
  }

  function setLoudness(enabled: boolean, target?: LoudnessTarget): void {
    state.value.loudness.enabled = enabled
    if (target) state.value.loudness.target = target
  }

  function resetEffects(): void {
    const defaults = defaultState()
    state.value.bassBoost = defaults.bassBoost
    state.value.surround = defaults.surround
    state.value.balance = defaults.balance
    state.value.loudness = defaults.loudness
  }

  function resetAll(): void {
    Object.assign(state.value, defaultState())
  }

  watch(
    state,
    () => {
      persist()
      apply()
    },
    { deep: true }
  )

  apply()

  return {
    state,
    presets,
    supported,
    active,
    apply,
    setEqualizerEnabled,
    selectPreset,
    setBandGain,
    resetEqualizer,
    setBassBoost,
    setSurround,
    setBalance,
    setLoudness,
    resetEffects,
    resetAll
  }
})
