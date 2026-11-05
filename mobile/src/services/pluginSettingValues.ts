/**
 * 插件写入公开设置时的取值校验。
 *
 * `pluginSettingsUpdate` 此前只核对**名字**在白名单里：插件写
 * `{ lyricFontSize: "abc" }` 会被原样写进设置。播放页随后把这几个值直接拼进
 * 内联样式（`Math.round(lyricFontSize * lyricFontScale) + 'px'`），
 * 于是歌词字号变成 `NaNpx`、整段歌词按浏览器默认字号渲染——插件一次脏写入
 * 就让用户「歌词突然变小了」，而设置页的滑杆停在原位、看不出任何异常。
 * 同一条路径也能把 `theme` 写成任意字符串（界面比较全部落空、主题失效）、
 * 把 `audioCacheMaxQuality` 写成一个没人认识的档位（缓存判定永远不达标）。
 *
 * 桌面 `Settings.updateSettings` 对唯一会出事的 `FullPlayLyricFontRate`
 * 做的是「越界就重置」；这里对每一项都按**设置页自己给出的取值范围**校验，
 * 越界或类型不符时如实报错，而不是让一个界面永远产生不出来的值进入运行时。
 */

import { normalizeLyricFont } from '@/services/lyricFonts'
import { normalizeTagWriteOptions } from '@/services/tagWriteOptions'
import { getBackgroundRenderer } from '@/services/backgroundRenderers'
import { parseHex } from '@/services/accentTheme'

/** 数值型设置的取值范围；与设置页的滑杆/选项一致。 */
const NUMBER_RANGES: Record<string, { min: number; max: number; integer?: boolean; label: string }> = {
  lyricFontSize: { min: 16, max: 34, integer: true, label: '歌词字号' },
  lyricFontScale: { min: 0.5, max: 2, label: '歌词字号倍率' },
  lyricFontWeight: { min: 100, max: 900, integer: true, label: '歌词字重' },
  // 设置页只给到 ±2 秒，但插件按歌词数据校正时可能需要更大；留一倍余量。
  lyricOffsetMs: { min: -10_000, max: 10_000, integer: true, label: '歌词偏移' },
  audioCacheMaxBytes: { min: 64 * 1024 * 1024, max: 16 * 1024 * 1024 * 1024, integer: true, label: '缓存上限' }
}

/** 布尔型公开设置。 */
const BOOLEAN_SETTINGS = new Set([
  'lyricShowTranslation',
  'lyricShowRomanization',
  'lyricAnimate',
  'lyricJump',
  'lyricSeekStagger',
  'lyricAppleStyle',
  'lyricImmersiveColor',
  'lyricBlur',
  'lyricFilterInfo',
  'lyricStrictFilter',
  'audioVisualizer',
  'seamlessTransition',
  'autoFallbackSource',
  'autoHideControls',
  'smtcHiresCover',
  'pauseTransition',
  'playerBackgroundAnimation',
  'playerBackgroundBeat',
  'routePreloadEnabled',
  'autoUpdatePlugins',
  'autoCacheMusic'
])

/** 纯字符串公开设置及其长度上限。 */
const STRING_SETTINGS: Record<string, number> = {
  // 音质档位由插件自己声明，宿主无从枚举，只约束形状与长度。
  preferredQuality: 64,
  downloadQuality: 64,
  audioCacheMaxQuality: 64,
  filenameTemplate: 200
}

function asFiniteNumber(name: string, value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new Error(`设置 ${name} 需要数值`)
  }
  return parsed
}

/**
 * 校验并归一化单个公开设置的值。
 *
 * @param name  文档名（`PLUGIN_PUBLIC_SETTINGS` 里的那一项），只用于报错文案
 * @param value 插件给出的值
 * @param field 移动端字段名；文档名有别名时由调用方传入（如
 *              `FullPlayLyricFontRate` → `lyricFontScale`）
 */
export function normalizePluginSettingValue(
  name: string,
  value: unknown,
  field: string = name
): unknown {
  const range = NUMBER_RANGES[field]
  if (range) {
    const parsed = asFiniteNumber(name, value)
    if (parsed < range.min || parsed > range.max) {
      throw new Error(`设置 ${name}（${range.label}）必须在 ${range.min} 到 ${range.max} 之间`)
    }
    return range.integer ? Math.round(parsed) : parsed
  }
  if (BOOLEAN_SETTINGS.has(field)) {
    if (typeof value !== 'boolean') throw new Error(`设置 ${name} 需要布尔值`)
    return value
  }
  if (field in STRING_SETTINGS) {
    if (typeof value !== 'string') throw new Error(`设置 ${name} 需要字符串`)
    const text = value.trim()
    if (text.length > STRING_SETTINGS[field]) {
      throw new Error(`设置 ${name} 过长（最多 ${STRING_SETTINGS[field]} 个字符）`)
    }
    return text
  }
  switch (field) {
    case 'theme': {
      if (value !== 'system' && value !== 'light' && value !== 'dark') {
        throw new Error('设置 theme 只能是 system、light 或 dark')
      }
      return value
    }
    case 'accent': {
      // 非法颜色会写进 CSS 变量，被浏览器静默丢弃，界面与自绘控件出现两套色。
      if (typeof value !== 'string' || !parseHex(value)) {
        throw new Error(`设置 ${name} 需要 #rgb 或 #rrggbb 颜色值`)
      }
      return value.trim()
    }
    case 'playerLayout': {
      if (value !== 'cd' && value !== 'cover') {
        throw new Error('设置 playerLayout 只能是 cd 或 cover')
      }
      return value
    }
    case 'playerBackgroundRenderer': {
      // 未知渲染器会让播放页拿到一个不存在的 id；按注册表回落默认值。
      if (typeof value !== 'string') throw new Error(`设置 ${name} 需要字符串`)
      const renderer = getBackgroundRenderer(value).value
      if (renderer !== value) throw new Error(`未知的背景渲染器：${value}`)
      return renderer
    }
    case 'tagWriteOptions':
      // 结构由下载流程直接读取，脏值会让写标签时抛错；走与本地存档同一套归一化。
      return normalizeTagWriteOptions(value)
    case 'lyricFontFamily': {
      const font = normalizeLyricFont(value)
      if (font !== String(value ?? '').trim()) throw new Error(`未知的歌词字体：${String(value)}`)
      return font
    }
    default:
      return value
  }
}
