/**
 * 本地歌曲标签的「在线搜索」数据准备，对齐桌面版 `Music/LocalTagEditor.vue`：
 * 搜到候选后，把封面转成可写入标签的 data URL，并顺带取歌词。
 *
 * 两处与桌面版不同的取舍（移动端没有 Node 侧的 `requestSdk`）：
 * - 封面走 `CapacitorHttp` 抓，而不是浏览器 `Image` + canvas：封面 CDN 几乎都
 *   不带 CORS 头，canvas 会被污染、`toDataURL` 抛错；`CapacitorHttp` 在原生层
 *   取字节，不受同源策略限制。
 * - 封面抓不到时**不回落成远程 URL**：`writeLocalTags` 会把字符串直接当
 *   data URL 解析，远程 URL 只会让写入失败并丢掉已有的封面。宁可保留原封面。
 */

export interface MetadataCandidate {
  title: string
  artists: string[]
  album?: string
  year?: number
  genre?: string
  artworkUrl?: string
  /** 原文里可能带的总时长（毫秒），用于展示。 */
  durationMs?: number
  track?: unknown
}

/** 标签编辑器表单；与 `writeLocalTags` 接受的字段一一对应。 */
export interface TagForm {
  title: string
  artist: string
  album: string
  year: string
  genre: string
  lyrics: string
  cover: string
}

export function emptyTagForm(): TagForm {
  return { title: '', artist: '', album: '', year: '', genre: '', lyrics: '', cover: '' }
}

/**
 * 年份输入校验：空值合法（表示清除），其余必须是正整数。
 * 与歌单页/桌面版的判定保持一致，不在这里另造一套规则。
 */
export function parseYearInput(value: string): { ok: true; year: number | null } | { ok: false } {
  const text = value.trim()
  if (!text) return { ok: true, year: null }
  const year = Number(text)
  if (!Number.isFinite(year) || year <= 0) return { ok: false }
  return { ok: true, year: Math.trunc(year) }
}

/** 标题是唯一必填项：空的标题会让本地歌曲在列表里变成一行空白。 */
export function tagFormError(form: TagForm): string | null {
  if (!form.title.trim()) return '标题不能为空'
  if (!parseYearInput(form.year).ok) return '年份格式不正确'
  return null
}

/**
 * 把候选结果套进表单：只覆盖候选确实带了的字段。
 * 候选缺专辑/年份时保留用户已填的值，避免「搜索一次把手工修正清空」。
 */
export function applyCandidateToForm(form: TagForm, candidate: MetadataCandidate): TagForm {
  return {
    ...form,
    title: candidate.title.trim() || form.title,
    artist: candidate.artists.length ? candidate.artists.join(' / ') : form.artist,
    album: candidate.album?.trim() || form.album,
    year: candidate.year && candidate.year > 0 ? String(Math.trunc(candidate.year)) : form.year,
    genre: candidate.genre?.trim() || form.genre
  }
}

/**
 * 判断一张图是否需要重新转为 data URL。
 * `data:` 直接可用；`blob:` 与远程地址都要抓取后才能写进标签。
 */
export function coverNeedsFetch(cover: string | undefined): boolean {
  const value = (cover || '').trim()
  if (!value) return false
  return !value.startsWith('data:')
}
