/**
 * 歌单里曲目 key 的候选匹配，用于「插件按引用删除歌单内歌曲」。
 *
 * 移动端的 Track key 有两种形状（`stores/plugins.ts` 的 `makeTrackKey`）：
 * - 公共 provider 资源：`providerId:id`
 * - 插件私有资源：`pluginId:providerId:id`
 *
 * `removeHostTracks` 原来只拼第一种，于是插件私有歌曲在歌单里**永远删不掉**——
 * 插件收到 `{ removed: 0 }` 之外还以为成功了，界面也不变。这里把候选集合
 * 收敛成纯函数，两种形状都能命中。
 */

export interface TrackRefLike {
  pluginId?: unknown
  providerId?: unknown
  id?: unknown
}

/** 一个引用可能对应的所有歌单 key（已去空、去重）。 */
export function playlistKeyCandidates(
  ref: TrackRefLike | null | undefined,
  explicitKey?: unknown
): string[] {
  const candidates = new Set<string>()
  const providerId = typeof ref?.providerId === 'string' ? ref.providerId : ''
  const id = typeof ref?.id === 'string' ? ref.id : ''
  const pluginId = typeof ref?.pluginId === 'string' ? ref.pluginId : ''
  if (providerId && id) {
    candidates.add(`${providerId}:${id}`)
    if (pluginId) candidates.add(`${pluginId}:${providerId}:${id}`)
  }
  if (typeof explicitKey === 'string' && explicitKey.trim()) {
    candidates.add(explicitKey.trim())
  }
  return [...candidates]
}

/** 该 key 是否属于这个引用。 */
export function playlistKeyMatches(key: string, ref: TrackRefLike | null | undefined, explicitKey?: unknown): boolean {
  return playlistKeyCandidates(ref, explicitKey).includes(key)
}
