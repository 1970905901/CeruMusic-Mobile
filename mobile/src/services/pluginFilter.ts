import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import { pluginSourceTags } from './pluginSources'

/**
 * 插件列表的搜索与筛选，对齐桌面版 `Settings/plugins.vue` 的
 * `filteredPlugins`：按名称 / 作者 / 描述 / **音源名** 搜索，并可只看已启用或已禁用。
 *
 * 移动端插件列表此前没有任何搜索或筛选——插件装多了只能靠滚动找。
 */

export type PluginStatusFilter = 'all' | 'enabled' | 'disabled'

export interface FilterablePlugin {
  key: string
  enabled: boolean
  fileName: string
  manifest: PluginManifest
  lastError?: string
}

/** 参与搜索的全部文本（与桌面版同一口径，另加文件名便于定位导入的构建）。 */
export function pluginSearchText(plugin: FilterablePlugin): string {
  const manifest = plugin.manifest
  return [
    manifest?.name,
    manifest?.author,
    manifest?.description,
    plugin.fileName,
    ...pluginSourceTags(manifest).map((tag) => tag.name)
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase()
}

/**
 * 按状态与关键词过滤。
 *
 * 关键词做大小写无关的子串匹配；空查询不过滤。多个关键词用空格分隔时按「全部命中」处理，
 * 这样「网易 云」也能找到「网易云音乐」。
 */
export function filterPlugins<T extends FilterablePlugin>(
  plugins: readonly T[],
  query: string,
  status: PluginStatusFilter = 'all'
): T[] {
  const statusFiltered = plugins.filter((plugin) => {
    if (status === 'enabled') return plugin.enabled
    if (status === 'disabled') return !plugin.enabled
    return true
  })
  const terms = String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (!terms.length) return statusFiltered
  return statusFiltered.filter((plugin) => {
    const text = pluginSearchText(plugin)
    return terms.every((term) => text.includes(term))
  })
}

/** 筛选后是否还有「被筛掉」的插件，用于给出「清除筛选」的入口。 */
export function hasActivePluginFilter(
  query: string,
  status: PluginStatusFilter,
  total: number,
  visible: number
): boolean {
  if (status !== 'all') return total !== visible
  return String(query ?? '').trim().length > 0
}
