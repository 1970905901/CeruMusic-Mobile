/**
 * 列表分页的停止条件。
 *
 * 页面的「还有更多」此前只看 `nextCursor` 是否存在。音源插件并非总守规矩：
 * 重复返回同一页、`nextCursor` 原样回传、或过滤后整页都是别的东西，都会让
 * 游标一直存在。用户一直下拉，界面就一直请求同一页——看起来像卡住，实际
 * 是永远到不了底部，同时在消耗流量与插件调用。
 *
 * 判据取「这一页有没有带来新内容」：连续 `BARREN_PAGE_LIMIT` 页没有新增即停止。
 * 允许一页为空而不停止，是因为音源常用「过滤后空页 + 正确游标」跳过不可用条目。
 */

export const BARREN_PAGE_LIMIT = 2

/** 累计连续空页数：本页有新增就清零，没有就 +1。 */
export function nextBarrenCount(added: number, current: number): number {
  // 计数器只应来自本模块；仍然收敛一次，脏值不能让它永远增长而卡死翻页。
  if (added > 0) return 0
  const base = Number.isFinite(current) ? Math.max(0, current) : 0
  return base + 1
}

/** 是否还应该继续翻页。`hasCursor` 为假时无论如何都停。 */
export function pagingShouldContinue(hasCursor: boolean, barrenPages: number): boolean {
  return hasCursor && barrenPages < BARREN_PAGE_LIMIT
}
