import type { PluginRecord } from '@/types/plugin'

/**
 * 歌单页的插件栏目（桌面 `pluginState.playlistSections` 的移动端等价）。
 *
 * 两个与桌面一致的约束，移动端此前都没做：
 * - **只有 `kind: 'native'` 的 Surface 能作为歌单栏目**。桌面版要求栏目对应的
 *   Surface 是原生界面，因为它要嵌进歌单页自己的布局；移动端只要声明了 view
 *   就当按钮列出来，web / schema Surface 点开是一个和歌单页毫无关系的整页。
 * - **按 `order` 排序**。声明顺序不等于展示顺序，插件用 order 表达优先级。
 */
export interface PlaylistSectionEntry {
  key: string
  pluginKey: string
  pluginName: string
  id: string
  title: string
  view: string
  order: number
}

export function collectPlaylistSections(
  plugins: readonly PluginRecord[]
): PlaylistSectionEntry[] {
  const entries: PlaylistSectionEntry[] = []
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    const surfaces = plugin.manifest.modules?.surfaces ?? []
    const nativeViews = new Set(
      surfaces.filter((surface) => surface.kind === 'native').map((surface) => surface.id)
    )
    for (const section of plugin.manifest.contributes?.playlistSections ?? []) {
      if (!section.view || !nativeViews.has(section.view)) continue
      entries.push({
        key: JSON.stringify([plugin.key, section.id]),
        pluginKey: plugin.key,
        pluginName: plugin.manifest.name,
        id: section.id,
        title: section.title || plugin.manifest.name,
        view: section.view,
        order: Number(section.order ?? 0)
      })
    }
  }
  return entries.sort(
    (left, right) =>
      left.order - right.order ||
      left.pluginName.localeCompare(right.pluginName) ||
      left.title.localeCompare(right.title)
  )
}
