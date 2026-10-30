/**
 * 消息与时间戳的统一格式化。
 *
 * 同一个「消息」列表里混着两种卡片：官方通知走 `NoticeCard`，互动消息走页面
 * 自身的卡片。两处各写了一份 `formatTime`——前者 `toLocaleString('zh-CN',
 * { hour12: false })`，后者是不带参数的 `toLocaleString()`。于是同一条列表里
 * 会出现「2026/10/30 21:20」与「2026/10/30 下午9:20」两种写法，是否 24 小时制
 * 还取决于设备区域设置。
 *
 * 桌面版 `NoticeCard` 用的是 `toLocaleString('zh-CN', { hour12: false })`，
 * 这里以它为准收敛成一份，并保持「解析失败返回空串」的既有约定：调用方据此
 * 隐藏这一行，而不是显示 `Invalid Date`。
 */

/** 日期 + 24 小时制时间，`2026/10/30 21:20`。 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toLocaleString('zh-CN', { hour12: false })
}

/** 只有日期，`2026/10/30`。 */
export function formatDateOnly(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toLocaleDateString('zh-CN')
}

/** 只有时间，`21:20`。 */
export function formatClockTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
