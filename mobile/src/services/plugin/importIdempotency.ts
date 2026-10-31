/**
 * `library.playlists.import` 的 `requestId` 幂等缓存（桌面
 * `PluginHost.importResults` 的移动端等价）。
 *
 * SDK 与文档都写明：同一批重试要用同一个 `requestId`，宿主据此去重；
 * 缓存键是 `requestId + 目标`，最多保留 200 项，且只在插件运行期间有效
 * （不是跨重启的事务凭证）。
 *
 * 移动端此前只校验了 `requestId` 的形状就丢掉它。插件网络抖动后重试同一批，
 * 歌就被导入两次，返回的 `added` 还是第二遍的数字——插件据此显示「又加了 N 首」，
 * 用户看到的是重复条目。
 */
export interface ImportCacheEntry<T> {
  result: Promise<T>
}

export const MAX_IMPORT_CACHE = 200

export function importCacheKey(requestId: unknown, target: unknown): string | null {
  const id = typeof requestId === 'string' ? requestId.trim() : ''
  if (!id || id.length > 256) return null
  // 目标参与键值：同一批歌曲导入到两张不同歌单是两个独立操作。
  const targetKey = target && typeof target === 'object'
    ? JSON.stringify([String((target as any).id ?? ''), String((target as any).location ?? 'local')])
    : 'none'
  return id + '|' + targetKey
}

/**
 * 命中缓存就返回同一个 Promise；未命中先执行再写入缓存。
 *
 * 失败时**立刻删掉缓存的键**：桌面同样在 catch 里 `delete`，否则一次临时失败
 * 会被永久缓存成一个失败的 Promise，插件之后每次重试都拿到同一个错误。
 */
export function importOnce<T>(
  cache: Map<string, ImportCacheEntry<T>>,
  key: string,
  run: () => Promise<T>
): Promise<T> {
  const existing = cache.get(key)
  if (existing) return existing.result
  const result = run().catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, { result })
  // 缓存是「最近 200 项」，超出时丢弃最早的条目。
  while (cache.size > MAX_IMPORT_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return result
}
