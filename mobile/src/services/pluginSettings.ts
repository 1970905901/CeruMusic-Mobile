export const PLUGIN_PUBLIC_SETTINGS = [
  'theme',
  'accent',
  'preferredQuality',
  'downloadQuality',
  'downloadWriteTags',
  'lyricFontSize',
  'lyricShowTranslation',
  'lyricShowRomanization',
  'lyricAnimate',
  'lyricOffsetMs',
  'lyricFilterInfo',
  'lyricStrictFilter',
  'pauseTransition',
  'playerBackgroundAnimation',
  'audioCacheEnabled',
  'audioCacheMaxBytes',
  'audioCacheMaxQuality',
  'autoUpdatePlugins'
] as const

export type PluginPublicSettingName = (typeof PLUGIN_PUBLIC_SETTINGS)[number]

export const PLUGIN_PUBLIC_SETTINGS_SET: ReadonlySet<string> = new Set(
  PLUGIN_PUBLIC_SETTINGS
)

export function pluginSettingsGet(
  keys: readonly string[],
  settings: Record<string, unknown>
): Record<string, unknown> {
  if (!Array.isArray(keys) || keys.length > 50) throw new Error('设置项列表无效')
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    const name = String(key)
    if (!PLUGIN_PUBLIC_SETTINGS_SET.has(name)) continue
    result[name] = settings[name]
  }
  return result
}

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
  const changed: string[] = []
  for (const [key, value] of Object.entries(values)) {
    if (!PLUGIN_PUBLIC_SETTINGS_SET.has(key)) {
      throw new Error(`包含不可由插件修改的设置：${key}`)
    }
    if (!Object.is(settings[key], value)) changed.push(key)
    settings[key] = value
  }
  return changed
}
