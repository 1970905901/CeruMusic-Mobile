/**
 * 插件歌单导入的元信息，对齐桌面 `views/music/songlist.vue` 的
 * `handleNetworkPlaylistImport`：
 *
 * ```ts
 * name = result.name || name
 * description = result.playlist?.description || description
 * artwork = result.playlist?.artworkUrl || artwork
 * ```
 *
 * 桌面把封面写进新建歌单（`songListAPI.updateCover`）；移动端此前只读
 * `page.name` 与 `page.items`，`page.playlist` 整个丢掉——导入进来的歌单在
 * 「音乐库 → 歌单」里是一张空白封面、也没有简介，和同页其它卡片长得不一样。
 *
 * 逐页合并的规则也照搬桌面：后续分页给出非空值才覆盖，空白不会把前面的
 * 内容抹掉（导入器通常只在第一页或最后一页带元信息）。
 */

export interface PlaylistImportMeta {
  name?: string
  description?: string
  cover?: string
}

function usableText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

/**
 * 封面只放行 http(s) 与 data URL。这个地址会原样进入 `<img src>`，
 * `javascript:` 一类的值没有意义，也不该被存进歌单记录里。
 */
function usableCover(value: unknown): string | undefined {
  const url = usableText(value)
  if (!url) return undefined
  if (/^https?:\/\//i.test(url)) return url
  if (/^data:image\//i.test(url)) return url
  return undefined
}

export function playlistImportMeta(page: unknown): PlaylistImportMeta {
  const record = (page && typeof page === 'object' ? page : {}) as Record<string, any>
  const playlist = record.playlist && typeof record.playlist === 'object' ? record.playlist : {}
  return {
    name: usableText(record.name),
    description: usableText(playlist.description),
    cover: usableCover(playlist.artworkUrl)
  }
}

/** 逐页合并：`next` 里的非空字段覆盖 `current`，其余保留。 */
export function mergePlaylistImportMeta(
  current: PlaylistImportMeta,
  next: PlaylistImportMeta
): PlaylistImportMeta {
  return {
    name: next.name ?? current.name,
    description: next.description ?? current.description,
    cover: next.cover ?? current.cover
  }
}
