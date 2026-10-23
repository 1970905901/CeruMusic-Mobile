/**
 * 社区数字与相对时间的统一格式化。
 *
 * 同一批数据在移动端各页面各写了一份实现，结果并不一致：
 * - 列表页 `formatCount` 对 100000 以上取 0 位小数，详情页固定 1 位，
 *   同一条 12.3 万赞的帖子在列表里是「12万」、点进去变「12.3万」；
 * - 评论点赞用 `1.2w`（英文字母），社区用「万」，同一屏里两种写法并存；
 * - 三处 `formatTime` 字面相同却各存一份，改一处不会同步另外两处。
 *
 * 这里收敛成一份纯函数，并与桌面端口径对齐：
 * - 数字：< 10000 原样；之后保留 1 位小数，100000 起去掉小数（`PostCard.formatCount`）；
 * - 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前，一周以上显示本地日期。
 */

/** 社区点赞、评论数等计数文案。负值与非数字按 0 处理。 */
export function formatCommunityCount(value: unknown): string {
  const count = Math.max(0, Math.trunc(Number(value) || 0))
  if (count < 10000) return String(count)
  return (count / 10000).toFixed(count < 100000 ? 1 : 0) + '万'
}

/**
 * 相对时间。时间缺失或无法解析时返回空串，调用方据此隐藏这一行——
 * 显示 `Invalid Date` 比不显示更糟。
 */
export function formatRelativeTime(value: string | number | Date | null | undefined, now = Date.now()): string {
  if (value === null || value === undefined || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = now - date.getTime()
  // 客户端时钟略慢于服务端时 diff 会是负数（刚发的帖子）；不该显示「-1 分钟前」。
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前'
  return date.toLocaleDateString()
}
