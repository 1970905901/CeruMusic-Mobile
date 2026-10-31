/**
 * `localMusic.getTags` 交给插件的标签对象。
 *
 * 移动端此前把内部 `LocalTrackRecord` 原样返回，里面包含 `path`（文件在设备上的
 * 真实路径）与 `relativePath`——插件拿到它就能绕过 `files.*` 的句柄体系直接读写
 * 文件，而 SDK 对本地音乐只承诺「读取标签」。桌面的 `getTags` 只回文件名、时长、
 * 标题/歌手/专辑/年份/流派这些音乐信息。
 *
 * 这里做显式白名单：以后给 `LocalTrackRecord` 加字段也不会自动泄露出去。
 */
export interface LocalTagsPayload {
  title?: string
  artist?: string
  album?: string
  year?: number
  genre?: string
  durationMs?: number
  fileName?: string
  mime?: string
  size?: number
  /** 歌词文本（LRC）；桌面 `getTags(songmid, true)` 同样包含它。 */
  lyrics?: string
  cover?: string
}

export const LOCAL_TAGS_FIELDS = [
  'title',
  'artist',
  'album',
  'year',
  'genre',
  'durationMs',
  'fileName',
  'mime',
  'size',
  'lyrics',
  'cover'
] as const

export function localTagsPayload(
  record: Record<string, unknown> | null | undefined
): LocalTagsPayload {
  if (!record) return {}
  const payload: Record<string, unknown> = {}
  for (const key of LOCAL_TAGS_FIELDS) {
    const value = record[key]
    if (value === undefined || value === null) continue
    payload[key] = value
  }
  return payload as LocalTagsPayload
}
