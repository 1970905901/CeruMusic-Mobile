/**
 * 全应用唯一的 Track key 规则。
 *
 * 同一首歌在不同入口（搜索结果、插件推进队列、收藏、歌单导入）必须得到同一个
 * key，否则按 key 查找的地方全部会漏：队列里出现重复条目、收藏判定认不出、
 * 歌单里删不掉。历史上这里散落过三种写法：
 *
 * - `stores/plugins.ts`：公共资源 `providerId:id`，私有资源 `pluginId:providerId:id`（正确）
 * - `stores/player.ts`：一律 `pluginKey:providerId:id`（公共资源多了一层前缀）
 * - `stores/library.ts`：私有资源写成 `import:providerId:id`
 *
 * 现在收敛到这一个函数，其它模块不再自己拼。
 */

export interface TrackRefLike {
  pluginId?: unknown
  providerId?: unknown
  id?: unknown
  scope?: unknown
}

/**
 * @param pluginKey 该资源所属插件的 key（`PluginRecord.key`）。
 *   公共资源（`scope === 'provider'`）不需要它——key 里不含插件身份，
 *   这样两个插件声明同一个 provider 时指向的仍是同一首歌。
 */
export function trackKeyFor(ref: TrackRefLike | null | undefined, pluginKey?: string | null): string {
  const providerId = String(ref?.providerId ?? '')
  const id = String(ref?.id ?? '')
  if (ref?.scope === 'provider') return `${providerId}:${id}`
  const pluginId = String(ref?.pluginId ?? pluginKey ?? '')
  return `${pluginId}:${providerId}:${id}`
}
