/**
 * 均衡器自定义预设的保存 / 删除 / 导入导出，对齐桌面版
 * `Settings/EqualizerSettings.vue`：内置预设不可删改，用户预设可保存当前增益、
 * 覆盖初始值、单独删除，并支持整份配置的 JSON 导出与导入。
 *
 * 这里只放纯函数：存储与 UI 在 `stores/audioEffects.ts` 与音效页，
 * 校验与清洗逻辑集中在此，便于测试「什么算合法预设」。
 */
import { clampEqualizerGains } from './audioEffects'

export const BUILTIN_EQ_PRESET_NAMES = [
  'Flat(原声)',
  'Pop(流行)',
  'Rock(摇滚)',
  'Jazz(爵士)',
  'Classical(古典)',
  'Bass Boost(低音增强)',
  'Vocal Boost(人声增强)',
  'Treble Boost(高音增强)'
] as const

/** 删除当前自定义预设后回落到的预设，避免选中项指向已不存在的名字。 */
export const EQ_FALLBACK_PRESET = 'Flat(原声)'

/** 增益不匹配任何预设时的虚拟选中项（移动端一直沿用这个字面量）。 */
export const EQ_CUSTOM_PRESET = '自定义'

export interface StoredEqPreset {
  name: string
  gains: number[]
  /** 创建时的增益，用于「重置到预设初始值」；桌面版同名字段。 */
  originalGains?: number[]
}

export type PresetNameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'builtin' | 'duplicate' }

/**
 * 新预设名校验：去空格后非空、不与内置同名、不与已有预设重名。
 * 桌面版是三条独立的提示，移动端把判定收敛成一个结果，文案由调用方给。
 */
export function checkPresetName(name: string, existing: readonly string[]): PresetNameCheck {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if ((BUILTIN_EQ_PRESET_NAMES as readonly string[]).includes(trimmed)) {
    return { ok: false, reason: 'builtin' }
  }
  if (existing.includes(trimmed)) return { ok: false, reason: 'duplicate' }
  return { ok: true, name: trimmed }
}

/** 把任意来源（本地存储、导入文件）的数据清洗成可信的自定义预设列表。 */
export function sanitizeCustomPresets(raw: unknown): StoredEqPreset[] {
  if (!Array.isArray(raw)) return []
  const result: StoredEqPreset[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name || seen.has(name)) continue
    // 内置预设由代码提供，导入的同名条目只会让下拉出现两个「Flat(原声)」。
    if ((BUILTIN_EQ_PRESET_NAMES as readonly string[]).includes(name)) continue
    if (!Array.isArray(record.gains)) continue
    seen.add(name)
    const preset: StoredEqPreset = { name, gains: clampEqualizerGains(record.gains as number[]) }
    if (Array.isArray(record.originalGains)) {
      preset.originalGains = clampEqualizerGains(record.originalGains as number[])
    }
    result.push(preset)
  }
  return result
}

export interface EqConfigSnapshot {
  presetName: string
  gains: number[]
  enabled: boolean
}

/** 导出格式与桌面版一致：`presets` / `currentPreset` / `gains` / `enabled`。 */
export function exportEqConfig(
  presets: readonly StoredEqPreset[],
  snapshot: EqConfigSnapshot
): string {
  return JSON.stringify(
    {
      presets: presets.map((preset) => ({
        name: preset.name,
        gains: preset.gains,
        ...(preset.originalGains ? { originalGains: preset.originalGains } : {})
      })),
      currentPreset: snapshot.presetName,
      gains: snapshot.gains,
      enabled: snapshot.enabled
    },
    null,
    2
  )
}

export interface ParsedEqConfig {
  presets: StoredEqPreset[]
  presetName?: string
  gains?: number[]
  enabled?: boolean
}

/**
 * 解析导入文件。只接受对象；`presets` 缺失时视为「只有播放设置」，
 * 这样从桌面版导出的精简配置也能用。解析不出对象直接抛错，由界面提示。
 */
export function parseEqConfig(text: string): ParsedEqConfig {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('配置格式不正确')
  }
  const record = data as Record<string, unknown>
  const presets = sanitizeCustomPresets(record.presets)
  const result: ParsedEqConfig = { presets }
  if (typeof record.currentPreset === 'string' && record.currentPreset.trim()) {
    result.presetName = record.currentPreset.trim()
  }
  if (Array.isArray(record.gains)) result.gains = clampEqualizerGains(record.gains as number[])
  if (typeof record.enabled === 'boolean') result.enabled = record.enabled
  if (!result.presets.length && !result.gains && !result.presetName) {
    throw new Error('配置里没有可导入的内容')
  }
  return result
}

function matchesKnownPreset(name: string | undefined, presets: readonly StoredEqPreset[]): boolean {
  if (!name) return false
  return (
    (BUILTIN_EQ_PRESET_NAMES as readonly string[]).includes(name) ||
    presets.some((preset) => preset.name === name)
  )
}

/**
 * 导入后当前预设的落点。文件里的名字若既不是内置也不是已导入的预设，
 * 回落到 Flat，避免下拉指向一个不存在的选项。
 */
export function resolvePresetAfterImport(
  presetName: string | undefined,
  presets: readonly StoredEqPreset[]
): string {
  return matchesKnownPreset(presetName, presets) ? String(presetName) : EQ_FALLBACK_PRESET
}
