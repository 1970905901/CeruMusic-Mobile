/**
 * 列表分页合并时的去重。
 *
 * 音源的分页接口并不总是严格不重叠：换页边界上重复返回上一页最后一首、
 * 或同一页被重试两次，都是常见现象。此前搜索页直接 `[...old, ...page.items]`
 * 拼接，结果是同一首歌在列表里出现两次——而且 `v-for :key` 也随之重复，
 * Vue 会把两个节点当成同一个，滚动位置与点击高亮都会错乱。
 *
 * 保留**首次出现**的位置：新一页里的重复项直接丢掉，不会让已渲染的行跳动。
 */

export function dedupeByKey<T>(
  items: readonly T[],
  keyOf: (item: T) => string | undefined | null
): T[] {
  const seen = new Set<string>()
  const output: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    // 取不到 key 的条目无法判重；保留它比静默丢弃安全（用户至少能看到）。
    if (!key) {
      output.push(item)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    output.push(item)
  }
  return output
}
