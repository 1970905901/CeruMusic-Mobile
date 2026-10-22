import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_AUDIO_EFFECTS_STATE,
  EQUALIZER_PRESETS,
  applyTailEffects,
  audioEffectChain,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  clampEqualizerGains,
  clampNumber,
  hasActiveEffects,
  type AudioEffectsState,
  type EqualizerPreset,
  type LoudnessTarget,
  type SurroundMode
} from '@/services/audioEffects'
import {
  BUILTIN_EQ_PRESET_NAMES,
  EQ_CUSTOM_PRESET,
  EQ_FALLBACK_PRESET,
  checkPresetName,
  exportEqConfig,
  parseEqConfig,
  resolvePresetAfterImport,
  sanitizeCustomPresets,
  type StoredEqPreset
} from '@/services/eqPresets'
import { usePlayerStore } from '@/stores/player'

const STORAGE_KEY = 'ceru-mobile-audio-effects-v1'
const SURROUND_MODES: SurroundMode[] = ['off', 'small', 'medium', 'large']
const LOUDNESS_TARGETS: LoudnessTarget[] = ['gentle', 'standard', 'strong']
const PRESET_STORAGE_KEY = 'ceru-mobile-eq-presets-v1'

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
    // 逐字段核对，而不是简单展开：存档可能来自旧版本或被写坏，
    // `bassBoost.enabled: "true"`、`surround.mode: "huge"` 这类值
    // 会被界面的 v-if 当 truthy、被音频链路当成不存在的预设。
    return {
      ...defaults,
      equalizerEnabled:
        typeof parsed.equalizerEnabled === 'boolean'
          ? parsed.equalizerEnabled
          : defaults.equalizerEnabled,
      equalizerPreset:
        typeof parsed.equalizerPreset === 'string' && parsed.equalizerPreset
          ? parsed.equalizerPreset
          : defaults.equalizerPreset,
      equalizerGains: Array.isArray(parsed.equalizerGains)
        ? clampEqualizerGains(parsed.equalizerGains)
        : defaults.equalizerGains,
      bassBoost: {
        enabled:
          typeof parsed.bassBoost?.enabled === 'boolean'
            ? parsed.bassBoost.enabled
            : defaults.bassBoost.enabled,
        // 非数字（缺失、字符串、NaN）才回落到默认值；合法的 0 dB 必须保留。
        gain: Number.isFinite(Number(parsed.bassBoost?.gain))
          ? clampNumber(Number(parsed.bassBoost?.gain), EQ_GAIN_MIN, EQ_GAIN_MAX)
          : defaults.bassBoost.gain
      },
      surround: {
        enabled:
          typeof parsed.surround?.enabled === 'boolean'
            ? parsed.surround.enabled
            : defaults.surround.enabled,
        mode: SURROUND_MODES.includes(parsed.surround?.mode as SurroundMode)
          ? (parsed.surround!.mode as SurroundMode)
          : defaults.surround.mode
      },
      balance: {
        enabled:
          typeof parsed.balance?.enabled === 'boolean'
            ? parsed.balance.enabled
            : defaults.balance.enabled,
        value: Number.isFinite(Number(parsed.balance?.value))
          ? clampNumber(Number(parsed.balance?.value), -1, 1)
          : defaults.balance.value
      },
      loudness: {
        enabled:
          typeof parsed.loudness?.enabled === 'boolean'
            ? parsed.loudness.enabled
            : defaults.loudness.enabled,
        target: LOUDNESS_TARGETS.includes(parsed.loudness?.target as LoudnessTarget)
          ? (parsed.loudness!.target as LoudnessTarget)
          : defaults.loudness.target
      }
    }
  } catch {
    return defaults
  }
}

function loadCustomPresets(): StoredEqPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY)
    return raw ? sanitizeCustomPresets(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

/** 逐段比较增益，用于判断导入的增益是否正好等于某个预设。 */
function gainsEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-6)
}

/** 内置预设在前，用户预设在后；下拉与「是否可删」都按这份列表判断。 */
function buildPresets(custom: readonly StoredEqPreset[]): EqualizerPreset[] {
  return [
    ...EQUALIZER_PRESETS.map((preset) => ({ ...preset, gains: [...preset.gains] })),
    ...custom.map((preset) => ({
      name: preset.name,
      gains: [...preset.gains],
      ...(preset.originalGains ? { originalGains: [...preset.originalGains] } : {})
    }))
  ]
}

export const useAudioEffectsStore = defineStore('audioEffects', () => {
  const player = usePlayerStore()
  const state = ref<AudioEffectsState>(load())
  const customPresets = ref<StoredEqPreset[]>(loadCustomPresets())
  const presets = ref<EqualizerPreset[]>(buildPresets(customPresets.value))
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
    state.value.equalizerPreset = EQ_CUSTOM_PRESET
  }

  function resetEqualizer(): void {
    selectPreset(EQ_FALLBACK_PRESET)
  }

  function persistCustomPresets(): void {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(customPresets.value))
    } catch {
      // Preferences remain in memory when storage is unavailable.
    }
  }

  function isBuiltinPreset(name: string): boolean {
    return (BUILTIN_EQ_PRESET_NAMES as readonly string[]).includes(name)
  }

  /** 当前选中的是否是用户预设；内置预设与「自定义」都不能删改。 */
  const customPresetActive = computed(
    () => !isBuiltinPreset(state.value.equalizerPreset) &&
      customPresets.value.some((preset) => preset.name === state.value.equalizerPreset)
  )

  /**
   * 用当前增益保存为新预设。校验与清洗都在 `eqPresets` 里，
   * 这里只负责落地并切到新预设，让用户立刻看到名字。
   */
  function savePreset(name: string): { ok: true; name: string } | { ok: false; reason: string } {
    const checked = checkPresetName(
      name,
      customPresets.value.map((preset) => preset.name)
    )
    if (!checked.ok) {
      const reason =
        checked.reason === 'empty'
          ? '预设名称不能为空'
          : checked.reason === 'builtin'
            ? '与内置预设同名'
            : '已存在同名预设'
      return { ok: false, reason }
    }
    const gains = clampEqualizerGains(state.value.equalizerGains)
    customPresets.value = [
      ...customPresets.value,
      { name: checked.name, gains, originalGains: [...gains] }
    ]
    presets.value = buildPresets(customPresets.value)
    state.value.equalizerPreset = checked.name
    state.value.equalizerGains = [...gains]
    persistCustomPresets()
    return { ok: true, name: checked.name }
  }

  /** 把当前增益写回当前用户预设，初始值保持不动，仍可「重置」。 */
  function overwriteCurrentPreset(): boolean {
    if (!customPresetActive.value) return false
    const gains = clampEqualizerGains(state.value.equalizerGains)
    customPresets.value = customPresets.value.map((preset) =>
      preset.name === state.value.equalizerPreset ? { ...preset, gains } : preset
    )
    presets.value = buildPresets(customPresets.value)
    state.value.equalizerGains = [...gains]
    persistCustomPresets()
    return true
  }

  function deleteCurrentPreset(): boolean {
    if (!customPresetActive.value) return false
    const name = state.value.equalizerPreset
    customPresets.value = customPresets.value.filter((preset) => preset.name !== name)
    presets.value = buildPresets(customPresets.value)
    const fallback = presets.value.find((preset) => preset.name === EQ_FALLBACK_PRESET)
    state.value.equalizerPreset = EQ_FALLBACK_PRESET
    state.value.equalizerGains = fallback ? [...fallback.gains] : clampEqualizerGains([])
    persistCustomPresets()
    return true
  }

  /**
   * 重置当前预设的增益：内置预设回到自身定义值，
   * 用户预设回到保存时的初始值；没有记录初始值的旧数据回落到 Flat。
   */
  function resetToCurrentPreset(): void {
    const name = state.value.equalizerPreset
    const preset = presets.value.find((item) => item.name === name)
    if (!preset) {
      selectPreset(EQ_FALLBACK_PRESET)
      return
    }
    const target = customPresetActive.value ? preset.originalGains : preset.gains
    state.value.equalizerGains = target
      ? clampEqualizerGains(target)
      : clampEqualizerGains(EQUALIZER_PRESETS[0].gains)
  }

  function exportConfig(): string {
    return exportEqConfig(customPresets.value, {
      presetName: state.value.equalizerPreset,
      gains: clampEqualizerGains(state.value.equalizerGains),
      enabled: state.value.equalizerEnabled
    })
  }

  /**
   * 导入桌面版或本机导出的配置；解析失败时抛错，由界面提示，不改动现状。
   *
   * 桌面版把 `currentPreset` 与 `gains` 分开保存，两者可能对不上（例如导出后
   * 手动拖过滑杆）。增益优先：文件里带了增益就照抄并把下拉落到
   * 「自定义」，只有当「名字 + 增益」正好是某个已知预设时才沿用名字，
   * 否则会显示一个与滑杆不符的预设。
   */
  function importConfig(text: string): void {
    const parsed = parseEqConfig(text)
    customPresets.value = parsed.presets
    presets.value = buildPresets(customPresets.value)
    persistCustomPresets()
    if (typeof parsed.enabled === 'boolean') state.value.equalizerEnabled = parsed.enabled
    const matchedName = resolvePresetAfterImport(parsed.presetName, parsed.presets)
    if (parsed.gains) {
      state.value.equalizerGains = [...parsed.gains]
      const preset = presets.value.find((item) => item.name === matchedName)
      state.value.equalizerPreset =
        preset && gainsEqual(preset.gains, parsed.gains) ? matchedName : EQ_CUSTOM_PRESET
      return
    }
    if (parsed.presetName) selectPreset(matchedName)
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
    customPresetActive,
    setEqualizerEnabled,
    selectPreset,
    setBandGain,
    resetEqualizer,
    savePreset,
    overwriteCurrentPreset,
    deleteCurrentPreset,
    resetToCurrentPreset,
    exportConfig,
    importConfig,
    setBassBoost,
    setSurround,
    setBalance,
    setLoudness,
    resetEffects,
    resetAll
  }
})
