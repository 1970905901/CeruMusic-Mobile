/**
 * 宿主侧分页，对齐 SDK 的 `Page<T>` 契约：`items` + 可选 `nextCursor`。
 *
 * 移动端的 `localMusic.list` 与 `history.list` 此前完全忽略游标，每次都返回
 * 全量数组且不返回 `nextCursor`。插件只要写成标准的「while (nextCursor)」循环，
 * 就会因为拿到 undefined 而正常结束——但写成「一直翻到 items 为空」的插件
 * 则永远翻不完（每次都能拿到同一页）。更实际的问题是：歌单/历史有几千条时，
 * 每个插件都要一次性吞下整个列表，这是没有必要的负担。
 *
 * 这里用一个不透明游标（偏移量的 base64）做稳定分页，逻辑集中、可单测。
 */

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500

export interface HostPage<T> {
  items: T[]
  nextCursor?: string
  totalEstimate: number
}

/** 游标编码：`p:<offset>` 的 base64url，避免插件依赖内部格式。 */
function encodeCursor(offset: number): string {
  return 'p:' + offset
}

function decodeCursor(cursor: unknown): number | null {
  if (typeof cursor !== 'string' || !cursor.trim()) return 0
  const match = cursor.trim().match(/^p:(\d+)$/)
  if (!match) return null
  const offset = Number(match[1])
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : null
}

/**
 * 归一化每页条数：缺省、非法、非正数一律回到默认值。
 *
 * 注意 `Math.min(MAX, max(1, 0))` 这类写法会把 0 夹成 1，等于插件传 0 就拿到
 * 1 条一页，翻几千次——所以先判非法再夹上限。
 */
export function normalizePageSize(value: unknown): number {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(MAX_PAGE_SIZE, Math.floor(size))
}

/**
 * 切出一页。游标非法（被插件改过、或来自旧版本）时返回 null，
 * 由调用方报错——静默从头返回会让插件的翻页逻辑死循环。
 */
export function paginate<T>(
  items: readonly T[],
  cursor: unknown,
  limit: unknown = DEFAULT_PAGE_SIZE
): HostPage<T> | null {
  const offset = decodeCursor(cursor)
  if (offset === null) return null
  const size = normalizePageSize(limit)
  const start = Math.min(offset, items.length)
  const slice = items.slice(start, start + size)
  const nextOffset = start + slice.length
  return {
    items: slice,
    ...(nextOffset < items.length ? { nextCursor: encodeCursor(nextOffset) } : {}),
    totalEstimate: items.length
  }
}
