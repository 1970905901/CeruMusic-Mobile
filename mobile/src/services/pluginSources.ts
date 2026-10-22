import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'

/**
 * 插件支持的音源名，用于插件列表展示。
 *
 * 桌面版 `Settings/plugins.vue` 会在每个插件卡片下列出 `supportedSources` 的名字标签；
 * 移动端只显示「N 个音源」这个数字，用户看不出装的是哪家音源——装了多个同类插件时
 * 尤其难分辨。
 *
 * 这里直接读 manifest 的 `contributes.providers`，而不是 `pluginStore.providers`：
 * 后者只包含**已启用**插件，而列表需要如实展示已禁用插件的音源。
 */

export interface PluginSourceTag {
  id: string
  name: string
}

/** 单个插件声明的音源，按声明顺序去重（同一个 id 只保留首次出现的名字）。 */
export function pluginSourceTags(manifest: PluginManifest | undefined | null): PluginSourceTag[] {
  const providers = manifest?.contributes?.providers ?? []
  const seen = new Set<string>()
  const tags: PluginSourceTag[] = []
  for (const provider of providers) {
    const id = String(provider?.id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const name = String(provider?.name ?? '').trim() || id
    tags.push({ id, name })
  }
  return tags
}

/**
 * 列表里最多显示几个音源标签。
 *
 * 一个插件声明十几个音源时，把名字全铺开会把卡片撑得又高又乱；
 * 超出部分折叠成「+N」。
 */
export const MAX_SOURCE_TAGS = 3

export interface PluginSourceSummary {
  tags: PluginSourceTag[]
  /** 因超出上限而未展示的数量。 */
  overflow: number
  total: number
}

export function summarizePluginSources(
  manifest: PluginManifest | undefined | null,
  limit = MAX_SOURCE_TAGS
): PluginSourceSummary {
  const tags = pluginSourceTags(manifest)
  const max = Math.max(0, Math.floor(Number(limit) || 0))
  const visible = max > 0 ? tags.slice(0, max) : []
  return { tags: visible, overflow: Math.max(0, tags.length - visible.length), total: tags.length }
}
