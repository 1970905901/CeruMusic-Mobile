/**
 * 低音增强预设，对齐桌面版 `Settings/AudioEffectSettings.vue` 的
 * `applyBassPreset`：轻度 3 dB、中度 6 dB、重度 9 dB。
 *
 * 移动端此前只有一根 −12~+12 的滑杆，没有桌面版的三个快捷档位——
 * 想快速调到「中度」得自己拖到 6。这里把档位抽成纯函数，UI 与测试共用。
 */

export type BassPreset = 'light' | 'medium' | 'heavy'

export const BASS_PRESETS: ReadonlyArray<{ value: BassPreset; label: string; gain: number }> = [
  { value: 'light', label: '轻度', gain: 3 },
  { value: 'medium', label: '中度', gain: 6 },
  { value: 'heavy', label: '重度', gain: 9 }
]

/** 预设对应的增益（dB）；未知值返回 null，由调用方忽略。 */
export function bassPresetGain(preset: string): number | null {
  const hit = BASS_PRESETS.find((item) => item.value === preset)
  return hit ? hit.gain : null
}

/**
 * 当前增益是否正好等于某个预设。
 *
 * 用于把分段控件高亮到对应的档位；用户手动拖动滑杆离开预设值时返回 null，
 * 此时不应高亮任何一档（否则会显示一个与滑杆不符的选中项）。
 */
export function bassPresetFromGain(gain: number): BassPreset | null {
  if (!Number.isFinite(gain)) return null
  const hit = BASS_PRESETS.find((item) => Math.abs(item.gain - gain) < 1e-6)
  return hit ? hit.value : null
}
