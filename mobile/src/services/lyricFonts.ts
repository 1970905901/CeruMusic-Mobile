/**
 * 歌词字体，对齐桌面版 `Settings/LyricFontSettings.vue` 的「选择字体」。
 *
 * 桌面版用 `font-list` 枚举系统字体、支持多选，拼成 `A,B,C` 的 font-family。
 * 移动端做不到同一件事：iOS 的 WKWebView 与 Android 的 WebView 都没有可用的
 * 字体枚举接口（`document.fonts` 只列出**已加载的 Web 字体**，不包含系统字体），
 * 而两个平台的系统字体名也不相同。硬要让用户输入字体名，多数人会填一个本机
 * 没有的名字，歌词静默回落到默认字体，却看不出哪儿不对。
 *
 * 因此这里提供一组**跨平台都能命中**的字体栈预设：每个预设同时给出 iOS、
 * Android 与通用族名，浏览器按顺序取第一个存在的。做不到「任意字体」就
 * 如实只做预设，与音频输出、代理设置等处同一口径。
 */

export interface LyricFontPreset {
  /** 存进设置的稳定 id */
  id: string
  label: string
  description: string
  /** font-family 值；空字符串表示跟随应用默认字体 */
  stack: string
}

export const LYRIC_FONT_PRESETS: readonly LyricFontPreset[] = [
  {
    id: 'system',
    label: '跟随系统',
    description: '使用应用的默认无衬线字体',
    stack: ''
  },
  {
    id: 'rounded',
    label: '圆体',
    description: '字形更柔和，适合长时间阅读歌词',
    // 苹方圆体只在较新的 iOS 上存在，Android 没有对应字体，
    // 因此补上通用的 sans-serif 兜底；字体栈本身就是「能命中就用」。
    stack: '"PingFang SC Rounded", "SF Pro Rounded", "Hiragino Maru Gothic ProN", system-ui, sans-serif'
  },
  {
    id: 'serif',
    label: '衬线 / 宋体',
    description: '偏传统的书卷感，适合慢歌',
    stack: '"Songti SC", "Noto Serif CJK SC", "Noto Serif SC", Georgia, serif'
  },
  {
    id: 'kai',
    label: '楷体',
    description: '手写风格的楷书字形',
    stack: '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif CJK SC", serif'
  },
  {
    id: 'mono',
    label: '等宽',
    description: '字距均匀，逐字歌词更容易对齐阅读',
    stack: '"SF Mono", Menlo, Consolas, "Roboto Mono", monospace'
  }
]

const PRESET_IDS = new Set(LYRIC_FONT_PRESETS.map((preset) => preset.id))

/**
 * 归一化设置里存的值。
 *
 * 存档可能来自旧版本、云端同步或手动改过的 localStorage：`null`、空串、
 * 已不存在的预设 id 一律回落到 `system`，避免把非法值写进 style 变成
 * 「字体突然全变了」。
 */
export function normalizeLyricFont(value: unknown): string {
  const id = String(value ?? '').trim()
  return PRESET_IDS.has(id) ? id : 'system'
}

/** 预设 id → 可直接写进 `font-family` 的值；未知 id 返回空串（继承默认）。 */
export function lyricFontStack(value: unknown): string {
  const id = normalizeLyricFont(value)
  return LYRIC_FONT_PRESETS.find((preset) => preset.id === id)?.stack ?? ''
}

export function lyricFontLabel(value: unknown): string {
  const id = normalizeLyricFont(value)
  return LYRIC_FONT_PRESETS.find((preset) => preset.id === id)?.label ?? '跟随系统'
}
