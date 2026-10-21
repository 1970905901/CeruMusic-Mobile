import type { LyricDocument } from '@/types/music'

/**
 * 歌词结果的缓存语义，对齐桌面版 `GlobalPlayStatus`：
 *
 * - **空结果不缓存**。插件可能在「暂时取不到」时返回空文档（网络抖动、上游 404
 *   被当成正常返回）。桌面版对此的注释是「只在真有歌词时写入」，否则空结果会被
 *   当成正常结果留下来，之后重复播放一直没歌词。
 * - **失败可重试**。抛错（网络异常、插件未就绪）不进缓存，下一次打开/切回这首歌
 *   会重新拉取。
 * - **容量有上限**。缓存是全应用生命周期的 Map，逐首累积却不回收会一直涨。
 *
 * 这里只放纯逻辑，播放页负责请求与竞态。
 */
export const LYRIC_CACHE_LIMIT = 24

export function hasLyrics(document: LyricDocument | null | undefined): boolean {
  if (!document) return false
  return document.lines.length > 0 || !!document.plainText?.trim()
}

/**
 * 只有含实际歌词的文档才值得缓存。空文档与纯错误占位符都返回 false。
 */
export function shouldCacheLyrics(document: LyricDocument | null | undefined): boolean {
  return hasLyrics(document)
}

/**
 * 带容量上限的 LRU 式写入：命中过的条目会被移到末尾，
 * 超出上限时淘汰最久未使用的一条。
 */
export function putLyricCache(
  cache: Map<string, LyricDocument>,
  key: string,
  document: LyricDocument,
  limit = LYRIC_CACHE_LIMIT
): void {
  if (!shouldCacheLyrics(document)) return
  cache.delete(key)
  cache.set(key, document)
  while (cache.size > Math.max(1, limit)) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

/** 读取命中时把条目提到末尾，保证淘汰顺序反映真实使用。 */
export function getLyricCache(
  cache: Map<string, LyricDocument>,
  key: string
): LyricDocument | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  cache.delete(key)
  cache.set(key, hit)
  return hit
}
