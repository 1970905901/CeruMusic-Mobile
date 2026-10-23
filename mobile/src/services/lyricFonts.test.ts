import { describe, expect, it } from 'vitest'
import {
  LYRIC_FONT_PRESETS,
  lyricFontLabel,
  lyricFontStack,
  normalizeLyricFont
} from './lyricFonts'

describe('lyric font presets', () => {
  it('offers a follow-system default plus named choices', () => {
    expect(LYRIC_FONT_PRESETS.map((preset) => preset.id)).toEqual([
      'system',
      'rounded',
      'serif',
      'kai',
      'mono'
    ])
    expect(LYRIC_FONT_PRESETS[0].stack).toBe('')
  })

  it('gives every non-default preset a real font stack', () => {
    for (const preset of LYRIC_FONT_PRESETS.slice(1)) {
      expect(preset.stack.trim().length).toBeGreaterThan(0)
      // 每个预设都必须有兜底族名，否则在某台设备上一个字体都命中时会退回浏览器默认。
      expect(preset.stack).toMatch(/,\s*(sans-serif|serif|monospace)$/)
    }
  })

  it('keeps ids unique so the settings dropdown cannot show duplicates', () => {
    const ids = LYRIC_FONT_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('lyric font normalisation', () => {
  it('passes known preset ids through', () => {
    for (const preset of LYRIC_FONT_PRESETS) {
      expect(normalizeLyricFont(preset.id)).toBe(preset.id)
    }
  })

  it('falls back to the system font for junk instead of writing it into CSS', () => {
    // 存档或云端同步可能给出任意值；非法值写进 font-family 会让整页歌词换字体。
    expect(normalizeLyricFont(undefined)).toBe('system')
    expect(normalizeLyricFont(null)).toBe('system')
    expect(normalizeLyricFont('')).toBe('system')
    expect(normalizeLyricFont('   ')).toBe('system')
    expect(normalizeLyricFont('Comic Sans MS')).toBe('system')
    expect(normalizeLyricFont(42)).toBe('system')
    expect(normalizeLyricFont({ id: 'serif' })).toBe('system')
  })

  it('trims surrounding whitespace before matching', () => {
    expect(normalizeLyricFont('  serif  ')).toBe('serif')
  })

  it('returns an empty stack for the default so the element inherits app typography', () => {
    expect(lyricFontStack('system')).toBe('')
    expect(lyricFontStack('nonsense')).toBe('')
  })

  it('returns the preset stack for a real choice', () => {
    expect(lyricFontStack('mono')).toContain('monospace')
    expect(lyricFontStack('serif')).toContain('serif')
  })

  it('labels the current choice without leaking internal ids', () => {
    expect(lyricFontLabel('kai')).toBe('楷体')
    expect(lyricFontLabel('system')).toBe('跟随系统')
    expect(lyricFontLabel('bogus')).toBe('跟随系统')
  })
})
