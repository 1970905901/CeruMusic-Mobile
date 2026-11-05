/**
 * 插件可读写的**公开设置**。
 *
 * 桌面 `services/pluginHostServices.ts` 的 `PUBLIC_SETTINGS`，以及插件文档
 * `docs/guide/plugins/v2/host-services.md` 列出的白名单，用的都是桌面端的字段名。
 * 移动端内部字段名与桌面不同（`filenameTemplate` → `downloadFilenameTemplate`、
 * `springFestivalDisabled` → `festivalThemeDisabled`、`FullPlayLyricFontRate`
 * → `lyricFontScale`、`autoCacheMusic` → `audioCacheEnabled`）。
 *
 * 白名单此前直接照抄桌面字段名，插件按文档请求这几项时被当成「非公开设置」
 * **静默丢弃**：插件以为宿主没有这项设置，宿主也从不告警；写入更糟——插件写
 * `filenameTemplate` 会被拒，而写 `downloadFilenameTemplate`（移动端字段名）
 * 又没人授权它知道这个名字。
 *
 * 现在两边都按文档名收发，映射集中在 `PLUGIN_SETTING_ALIASES`：
 * - 读：文档名 → 移动端字段，值原样返回；
 * - 写：文档名 → 移动端字段写回，返回的 changed 列表也用文档名；
 *   取值经 `services/pluginSettingValues` 校验后才落盘。
 *
 * 移动端确实没有对应能力的条目（AI 悬浮球、状态栏歌词、打开时自动导入歌单）
 * **不列进来**：插件读到的是缺省值，而不是一个拨了也没反应的开关。
 */

import { normalizePluginSettingValue } from '@/services/pluginSettingValues'

/** 文档名 → 移动端字段名；没有映射的条目两边同名。 */
export const PLUGIN_SETTING_ALIASES: Record<string, string> = {
  filenameTemplate: 'downloadFilenameTemplate',
  springFestivalDisabled: 'festivalThemeDisabled',
  FullPlayLyricFontRate: 'lyricFontScale',
  autoCacheMusic: 'audioCacheEnabled'
}

/** 纯计算出来的公开设置（移动端没有对应字段，按当前设置推导）。 */
const DERIVED_SETTINGS: Record<string, (settings: Record<string, unknown>) => unknown> = {
  // 桌面两开关：跟随系统 / 深色。移动端只有一个三档 `theme`。
  followSystemTheme: (settings) => settings.theme === 'system',
  isDarkMode: (settings) => settings.theme === 'dark'
}

export const PLUGIN_PUBLIC_SETTINGS = [
  // 文档名与移动端字段同名，但插件按文档名读写的公开偏好。
  'theme',
  'accent',
  'preferredQuality',
  'downloadQuality',
  'tagWriteOptions',
  'lyricFontSize',
  'lyricShowTranslation',
  'lyricShowRomanization',
  'lyricAnimate',
  'lyricJump',
  'lyricSeekStagger',
  'lyricAppleStyle',
  'lyricImmersiveColor',
  'lyricBlur',
  'audioVisualizer',
  'seamlessTransition',
  'autoFallbackSource',
  'autoHideControls',
  'playerLayout',
  'smtcHiresCover',
  'lyricOffsetMs',
  'lyricFilterInfo',
  'lyricStrictFilter',
  'pauseTransition',
  'playerBackgroundAnimation',
  'playerBackgroundRenderer',
  'playerBackgroundBeat',
  'audioCacheMaxBytes',
  'audioCacheMaxQuality',
  'autoUpdatePlugins',
  'lyricFontFamily',
  'lyricFontWeight',
  'routePreloadEnabled',
  // 映射到移动端字段的文档名。
  'filenameTemplate',
  'springFestivalDisabled',
  'FullPlayLyricFontRate',
  'autoCacheMusic',
  // 推导出来的。
  'isDarkMode',
  'followSystemTheme'
] as const

export type PluginPublicSettingName = (typeof PLUGIN_PUBLIC_SETTINGS)[number]

export const PLUGIN_PUBLIC_SETTINGS_SET: ReadonlySet<string> = new Set(
  PLUGIN_PUBLIC_SETTINGS
)

/** 文档名对应的移动端字段；未知条目原样返回（调用方已经用白名单挡过）。 */
export function pluginSettingField(name: string): string {
  return PLUGIN_SETTING_ALIASES[name] ?? name
}

export function pluginSettingsGet(
  keys: readonly string[],
  settings: Record<string, unknown>
): Record<string, unknown> {
  if (!Array.isArray(keys) || keys.length > 50) throw new Error('设置项列表无效')
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    const name = String(key)
    if (!PLUGIN_PUBLIC_SETTINGS_SET.has(name)) continue
    const derive = DERIVED_SETTINGS[name]
    if (derive) {
      result[name] = derive(settings)
      continue
    }
    result[name] = settings[pluginSettingField(name)]
  }
  return result
}

/**
 * 把插件给的公开设置写进本机设置，返回**改动过的文档名**。
 *
 * 三条规则：
 * 1. **先校验后写入**。此前是边查边写：`{ theme: 'dark', aiApiKey: 'x' }` 会在
 *    撞到 `aiApiKey` 抛错之前先把 `theme` 改掉——插件收到「被拒绝」的错误，
 *    用户的主题却已经变了。现在整批先全部校验、全部映射好，再一次性落盘。
 * 2. **值要合法**。名字在白名单里不代表值能直接进运行时（见
 *    `services/pluginSettingValues`）：`lyricFontSize: "abc"` 会让播放页的歌词
 *    字号变成 `NaNpx`。越界/类型不符如实报错。
 * 3. **推导项不可写**。`isDarkMode` / `followSystemTheme` 是从三档 `theme`
 *    推出来的只读视图，没有等价字段。此前 `isDarkMode` 被默默接受然后丢弃，
 *    插件以为切换了深色模式；现在如实拒绝，插件只能写 `theme`。
 */
export function pluginSettingsUpdate(
  values: Record<string, unknown> | null | undefined,
  settings: Record<string, any>
): string[] {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error('设置值无效')
  }
  let bytes = 0
  try {
    bytes = new TextEncoder().encode(JSON.stringify(values)).length
  } catch {
    throw new Error('设置值无效')
  }
  if (bytes > 32 * 1024) throw new Error('设置数据过大')

  // 第一遍：只校验与映射，不碰 settings。
  const writes: Array<{ field: string; value: unknown }> = []
  for (const [key, value] of Object.entries(values)) {
    if (!PLUGIN_PUBLIC_SETTINGS_SET.has(key)) {
      throw new Error(`包含不可由插件修改的设置：${key}`)
    }
    if (key in DERIVED_SETTINGS) {
      throw new Error(`设置 ${key} 为只读，请改为设置 theme`)
    }
    const field = pluginSettingField(key)
    writes.push({ field, value: normalizePluginSettingValue(key, value, field) })
  }

  // 第二遍：全部合法后才落盘。
  const changed: string[] = []
  for (let index = 0; index < writes.length; index++) {
    const { field, value } = writes[index]
    const name = Object.keys(values)[index]
    if (!Object.is(settings[field], value)) changed.push(name)
    settings[field] = value
  }
  return changed
}
