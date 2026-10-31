/**
 * 歌单分类标签（桌面 `musicSdk.getPlaylistTags` 的移动端等价）。
 *
 * 插件用 `playlists.categories` 返回一个平铺的标签列表，靠每条标签的
 * `extensions.group` 归组、`extensions.hot` 标记热门。桌面版据此在歌单页
 * 顶部放一条「热门」标签条 + 「更多分类」分组面板；移动端此前直接把这些
 * 标签当成「歌单分类」的卡片网格平铺出来，既没有热门入口，也看不出分组。
 */
export interface PlaylistTag {
  id: string
  name: string
}

export interface PlaylistTagGroup {
  name: string
  list: PlaylistTag[]
}

export interface PlaylistTagCatalog {
  /** 按插件给的顺序分组；组名缺省为「分类」 */
  groups: PlaylistTagGroup[]
  /** 标了 `extensions.hot` 的标签，保持插件返回顺序 */
  hot: PlaylistTag[]
  /** 全部标签（已去重），用于「更多分类」面板 */
  all: PlaylistTag[]
}

const DEFAULT_GROUP = '分类'

export function collectPlaylistTags(items: readonly any[] | null | undefined): PlaylistTagCatalog {
  const groups = new Map<string, PlaylistTag[]>()
  const hot: PlaylistTag[] = []
  const all: PlaylistTag[] = []
  const seen = new Set<string>()
  for (const item of items ?? []) {
    const id = String(item?.ref?.id ?? '').trim()
    const name = String(item?.title ?? '').trim()
    // 缺 id 或标题的标签点开只会得到一张空列表，直接丢掉。
    if (!id || !name) continue
    // 同一个分类 ID 可能同时出现在「热门」和某个分组里；`all` 与分组内去重，
    // 但 `hot` 只跟插件声明走。
    if (!seen.has(id)) {
      seen.add(id)
      all.push({ id, name })
    }
    const groupName = String(item?.extensions?.group ?? '').trim() || DEFAULT_GROUP
    const group = groups.get(groupName) ?? []
    if (!group.some((tag) => tag.id === id)) group.push({ id, name })
    groups.set(groupName, group)
    if (item?.extensions?.hot && !hot.some((tag) => tag.id === id)) hot.push({ id, name })
  }
  return {
    groups: [...groups].map(([name, list]) => ({ name, list })),
    hot,
    all
  }
}
