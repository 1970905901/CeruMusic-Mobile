import type { PluginRecord } from '@/types/plugin'

/**
 * 首页插件栏目（桌面 `pluginState.homeSections` 的移动端等价）。
 *
 * 桌面版的规则是「同一 `kind` 只展示一个插件」：多个插件都声明了 `playlists` /
 * `charts` 时，按用户的选择（`uiPluginMap[home:<kind>]`）或第一个声明者只保留一个，
 * `custom` 栏目不受限制。移动端此前**把每个插件声明的栏目全部列出来**——装了两个
 * 都提供「每日推荐」的插件，首页就出现两个几乎一样、内容却来自不同平台的栏目，
 * 用户没法选，也没法收起其中一个。
 */
export interface HomeSectionEntry {
  pluginKey: string
  pluginName: string
  id: string
  title: string
  kind: string
  view: string
  /** 插件给的排序权重，缺省按插件名的字母序 */
  order: number
}

export interface CollectHomeSectionsOptions {
  /** `home:<kind>` → 插件 key，来自用户的选择；缺省时取排序最前的一个 */
  selection?: Record<string, string>
}

function compareEntries(left: HomeSectionEntry, right: HomeSectionEntry): number {
  return (
    left.order - right.order ||
    left.pluginName.localeCompare(right.pluginName) ||
    left.title.localeCompare(right.title)
  )
}

export function collectHomeSections(
  plugins: readonly PluginRecord[],
  options: CollectHomeSectionsOptions = {}
): HomeSectionEntry[] {
  const all: HomeSectionEntry[] = []
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    for (const section of plugin.manifest.contributes?.homeSections ?? []) {
      // 没有 view 的栏目由宿主的原生界面渲染，移动端没有对应实现，
      // 列出来只会点开一个空面板。
      if (!section.view) continue
      all.push({
        pluginKey: plugin.key,
        pluginName: plugin.manifest.name,
        id: section.id,
        title: section.title || plugin.manifest.name,
        kind: section.kind || 'custom',
        view: section.view,
        order: Number(section.order ?? 0)
      })
    }
  }
  const byKind = new Map<string, HomeSectionEntry[]>()
  for (const entry of all) {
    const bucket = byKind.get(entry.kind) ?? []
    bucket.push(entry)
    byKind.set(entry.kind, bucket)
  }
  const selection = options.selection ?? {}
  const kept = all.filter((entry) => {
    // 自定义栏目彼此独立，永远都展示。
    if (entry.kind === 'custom') return true
    const matches = byKind.get(entry.kind) ?? []
    if (matches.length <= 1) return true
    const picked = selection[`home:${entry.kind}`]
    const owner = matches.some((item) => item.pluginKey === picked)
      ? picked
      : // 没有选择时取排序最前的一个：同一 kind 只留一份，避免首页出现重复栏目。
        [...matches].sort(compareEntries)[0]?.pluginKey
    return entry.pluginKey === owner
  })
  return kept.sort(compareEntries)
}
