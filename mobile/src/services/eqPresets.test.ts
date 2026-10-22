import { describe, expect, it } from 'vitest'
import {
  BUILTIN_EQ_PRESET_NAMES,
  EQ_FALLBACK_PRESET,
  checkPresetName,
  exportEqConfig,
  parseEqConfig,
  resolvePresetAfterImport,
  sanitizeCustomPresets
} from './eqPresets'

const MY_PRESET = { name: '语音', gains: [0, 0, -2, 1, 4, 4, 2, 1, 0, -1] }

describe('equalizer preset helpers', () => {
  it('rejects empty, builtin and duplicate preset names', () => {
    // 与桌面版一样：内置预设不可覆盖，重名会让下拉出现两个同名项。
    expect(checkPresetName('   ', [])).toEqual({ ok: false, reason: 'empty' })
    expect(checkPresetName('Flat(原声)', [])).toEqual({ ok: false, reason: 'builtin' })
    expect(checkPresetName('语音', ['语音'])).toEqual({ ok: false, reason: 'duplicate' })
    expect(BUILTIN_EQ_PRESET_NAMES).toContain('Flat(原声)')
  })

  it('trims the accepted preset name', () => {
    expect(checkPresetName('  语音  ', [])).toEqual({ ok: true, name: '语音' })
  })

  it('drops malformed presets and clamps their gains', () => {
    const cleaned = sanitizeCustomPresets([
      MY_PRESET,
      { name: '   ', gains: [1] },
      { name: 'Rock(摇滚)', gains: [1] },
      { name: '语音', gains: [1] },
      { name: '缺增益' },
      { name: '越界', gains: [99, -99] },
      null
    ])
    // 重复的「语音」只留第一份；内置同名被丢弃；缺增益的条目不可用。
    expect(cleaned.map((preset) => preset.name)).toEqual(['语音', '越界'])
    expect(cleaned[1].gains.slice(0, 2)).toEqual([12, -12])
    expect(cleaned[1].gains).toHaveLength(10)
  })

  it('round-trips a config through export and import', () => {
    const text = exportEqConfig([MY_PRESET], {
      presetName: '语音',
      gains: MY_PRESET.gains,
      enabled: true
    })
    const parsed = parseEqConfig(text)
    expect(parsed.presets).toEqual([MY_PRESET])
    expect(parsed.presetName).toBe('语音')
    expect(parsed.gains).toEqual(MY_PRESET.gains)
    expect(parsed.enabled).toBe(true)
  })

  it('keeps the original gains on exported presets so reset still works', () => {
    const text = exportEqConfig(
      [{ name: '语音', gains: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], originalGains: MY_PRESET.gains }],
      { presetName: '语音', gains: MY_PRESET.gains, enabled: false }
    )
    expect(parseEqConfig(text).presets[0].originalGains).toEqual(MY_PRESET.gains)
  })

  it('fails loudly on unusable files instead of silently wiping presets', () => {
    expect(() => parseEqConfig('not json')).toThrow('JSON')
    expect(() => parseEqConfig('[]')).toThrow('配置格式')
    // 空对象里没有任何可导入内容，不能当成「清空所有预设」。
    expect(() => parseEqConfig('{}')).toThrow('没有可导入的内容')
  })

  it('accepts a desktop config that only carries gains and enabled', () => {
    const parsed = parseEqConfig(JSON.stringify({ gains: [3, 3], enabled: true }))
    expect(parsed.presets).toEqual([])
    expect(parsed.gains).toEqual([3, 3, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('falls back to Flat when the imported preset name is unknown', () => {
    expect(resolvePresetAfterImport('语音', [MY_PRESET])).toBe('语音')
    expect(resolvePresetAfterImport('Pop(流行)', [])).toBe('Pop(流行)')
    expect(resolvePresetAfterImport('已删除的预设', [MY_PRESET])).toBe(EQ_FALLBACK_PRESET)
    expect(resolvePresetAfterImport(undefined, [MY_PRESET])).toBe(EQ_FALLBACK_PRESET)
  })
})
