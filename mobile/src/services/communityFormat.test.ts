import { describe, expect, it } from 'vitest'
import { formatCommunityCount, formatRelativeTime } from './communityFormat'

describe('community count formatting', () => {
  it('shows small counts unchanged', () => {
    expect(formatCommunityCount(0)).toBe('0')
    expect(formatCommunityCount(7)).toBe('7')
    expect(formatCommunityCount(9999)).toBe('9999')
  })

  it('uses one decimal in the ten-thousands range', () => {
    expect(formatCommunityCount(10000)).toBe('1.0万')
    expect(formatCommunityCount(12300)).toBe('1.2万')
    expect(formatCommunityCount(99999)).toBe('10.0万')
  })

  it('drops the decimal from 100000 up, like the desktop post card', () => {
    // 桌面端 PostCard.formatCount 在 10 万起取 0 位；此前移动端详情页固定 1 位，
    // 同一条帖子在列表和详情里的数字不一样。
    expect(formatCommunityCount(100000)).toBe('10万')
    expect(formatCommunityCount(123456)).toBe('12万')
  })

  it('treats dirty values as zero instead of printing NaN', () => {
    expect(formatCommunityCount(undefined)).toBe('0')
    expect(formatCommunityCount('abc')).toBe('0')
    expect(formatCommunityCount(-5)).toBe('0')
    expect(formatCommunityCount(Number.NaN)).toBe('0')
  })
})

describe('relative time', () => {
  const now = new Date(2026, 9, 23, 12, 0, 0).getTime()
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

  it('shows 刚刚 for anything under a minute', () => {
    expect(formatRelativeTime(iso(0), now)).toBe('刚刚')
    expect(formatRelativeTime(iso(59_000), now)).toBe('刚刚')
  })

  it('clamps future timestamps to 刚刚 instead of a negative figure', () => {
    // 客户端时钟比服务端慢时，刚发布的帖子时间会落在「未来」。
    expect(formatRelativeTime(iso(-120_000), now)).toBe('刚刚')
  })

  it('steps through minutes, hours and days', () => {
    expect(formatRelativeTime(iso(3 * 60_000), now)).toBe('3 分钟前')
    expect(formatRelativeTime(iso(5 * 3600_000), now)).toBe('5 小时前')
    expect(formatRelativeTime(iso(3 * 86400_000), now)).toBe('3 天前')
  })

  it('falls back to a local date after a week', () => {
    const date = new Date(now - 30 * 86400_000)
    expect(formatRelativeTime(date, now)).toBe(date.toLocaleDateString())
  })

  it('returns an empty string for missing or unparseable values', () => {
    expect(formatRelativeTime('')).toBe('')
    expect(formatRelativeTime(null)).toBe('')
    expect(formatRelativeTime(undefined)).toBe('')
    expect(formatRelativeTime('not a date', now)).toBe('')
  })
})
