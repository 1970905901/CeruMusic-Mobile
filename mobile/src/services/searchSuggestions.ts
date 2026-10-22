/**
 * 搜索建议的归一化，对齐桌面版 `components/search/searchSuggest.vue`。
 *
 * 桌面版把 `tipSearch` 的结果按「单曲 / 歌手 / 专辑 / 歌单」分组渲染，
 * 并永远把「直接搜索：<关键词>」放在最上面；移动端此前只有发现页的纯字符串
 * 联想，搜索页本身没有任何建议。这里把插件返回的多种形状收敛成同一份分组，
 * 页面只管渲染。
 */

export type SuggestionKind = 'songs' | 'artists' | 'albums' | 'playlists'

export interface SuggestionItem {
  kind: SuggestionKind
  /** 点选后填进搜索框的文本。 */
  text: string
  /** 歌手名一类的副标题；没有就不显示。 */
  hint?: string
}

export const SUGGESTION_GROUPS: ReadonlyArray<{ kind: SuggestionKind; label: string }> = [
  { kind: 'songs', label: '单曲' },
  { kind: 'artists', label: '歌手' },
  { kind: 'albums', label: '专辑' },
  { kind: 'playlists', label: '歌单' }
]

/** 每类最多显示几条：手机上建议面板太高会盖住整个搜索框。 */
export const MAX_SUGGESTIONS_PER_GROUP = 4
export const MAX_SUGGESTIONS = 8

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  // 歌手字段常被插件给成 `{ name }`；取不到名字就当没有，避免渲染 [object Object]。
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return asText(record.name) || asText(record.title)
  }
  return ''
}

/**
 * 取一条建议的显示文本与副标题。
 * 插件给的条目可能是字符串、`{ name }`、`{ title }`，歌手还可能是 `{ name }`。
 */
function readItem(value: unknown): { text: string; hint?: string } {
  if (typeof value === 'string') return { text: value.trim() }
  if (!value || typeof value !== 'object') return { text: '' }
  const record = value as Record<string, unknown>
  const text = asText(record.name) || asText(record.title) || asText(record.keyword)
  const artist = asText(record.artist) || asText(record.singer) || asText(record.subtitle)
  return artist && artist !== text ? { text, hint: artist } : { text }
}

/**
 * 归一化插件的联想结果。
 *
 * 兼容三种形状：纯字符串数组、`{ items }` 分页、以及桌面版那种
 * `{ order: [...], songs: [...], artists: [...] }` 分组对象。
 */
export function normalizeSuggestions(value: unknown): SuggestionItem[] {
  if (!value) return []
  const record = (typeof value === 'object' ? value : null) as Record<string, unknown> | null

  // 分组的形状：有 order 或任一分组键。
  const grouped =
    record &&
    (Array.isArray(record.order) ||
      SUGGESTION_GROUPS.some((group) => Array.isArray(record[group.kind])))

  if (grouped) {
    const out: SuggestionItem[] = []
    const seen = new Set<string>()
    for (const group of SUGGESTION_GROUPS) {
      const list = record?.[group.kind]
      if (!Array.isArray(list)) continue
      let count = 0
      for (const entry of list) {
        if (count >= MAX_SUGGESTIONS_PER_GROUP) break
        const { text, hint } = readItem(entry)
        if (!text) continue
        const dedupeKey = `${group.kind}:${text.toLowerCase()}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        out.push({ kind: group.kind, text, ...(hint ? { hint } : {}) })
        count++
        if (out.length >= MAX_SUGGESTIONS) return out
      }
    }
    return out
  }

  // 平铺的形状：数组或 `{ items }`，都当作歌曲联想。
  const flat = Array.isArray(value)
    ? value
    : Array.isArray(record?.items)
      ? (record?.items as unknown[])
      : []
  const out: SuggestionItem[] = []
  const seen = new Set<string>()
  for (const entry of flat) {
    const { text, hint } = readItem(entry)
    if (!text || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    out.push({ kind: 'songs', text, ...(hint ? { hint } : {}) })
    if (out.length >= MAX_SUGGESTIONS) break
  }
  return out
}
