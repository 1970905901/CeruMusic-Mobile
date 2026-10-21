/**
 * 随机播放顺序，对齐桌面版 `globaPlayList` 的 `shuffleOrder`：
 *
 * 桌面版把顺序存成**歌曲 id 列表**（不是下标），并在队列真的变化时重建。
 * 移动端原先存的是下标，并且在每次「开始播放 / 插入队列」时把它重置成
 * 递增序列——打开随机播放后只要点了任意一首歌，随机就静默失效。
 *
 * 另外，桌面版「下一首」是沿着洗牌后的顺序**推进游标**，而不是每次都从
 * 剩余项里随机抽一个：逐个抽样的结果是同一首歌可能连着放，而游标推进能保证
 * 一轮之内把队列听完再重新洗牌。
 */

/** Fisher-Yates 洗牌，返回新数组；随机源可注入以便测试。 */
export function buildShuffleOrder(
  keys: readonly string[],
  random: () => number = Math.random
): string[] {
  const order = keys.slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = order[i]
    order[i] = order[j]
    order[j] = swap
  }
  return order
}

/**
 * 顺序是否仍然可用：长度一致，且每首歌都在（不要求同序，用户拖动排序后
 * 应该保留已洗好的随机顺序，而不是重新洗一次）。
 */
export function isShuffleOrderValid(
  order: readonly string[],
  keys: readonly string[]
): boolean {
  if (order.length !== keys.length) return false
  if (order.length === 0) return true
  const remaining = new Set(keys)
  if (remaining.size !== order.length) return false
  for (const key of order) if (!remaining.has(key)) return false
  return true
}

/**
 * 取「下一首」：从当前歌在洗牌顺序中的位置往后推进一格；
 * 走到末尾后按 `wrap` 决定是回到开头重洗还是结束。
 */
export function nextShuffleKey(
  order: readonly string[],
  currentKey: string | null | undefined,
  options: { wrap: boolean; random?: () => number } = { wrap: false }
): { key: string | null; order: string[] } {
  if (!order.length) return { key: null, order: order.slice() }
  const current = currentKey == null ? -1 : order.indexOf(currentKey)
  const nextIndex = current + 1
  if (nextIndex < order.length) return { key: order[nextIndex], order: order.slice() }
  if (!options.wrap) return { key: null, order: order.slice() }
  // 到末尾：重新洗牌后从第一首开始，避免最后一首永远接回固定的那一首。
  const reshuffled = buildShuffleOrder(order, options.random)
  return { key: reshuffled[0] ?? null, order: reshuffled }
}

/**
 * 取「上一首」：沿洗牌顺序回退一格，开头则停在第一首（不环绕，
 * 与桌面版一致——上一首在列表头不跳回末尾）。
 */
export function previousShuffleKey(
  order: readonly string[],
  currentKey: string | null | undefined
): string | null {
  if (!order.length) return null
  const current = currentKey == null ? 0 : order.indexOf(currentKey)
  if (current <= 0) return order[0] ?? null
  return order[current - 1]
}
