import { describe, expect, it } from 'vitest'
import { HISTORY_PAGE_SIZE, LOCAL_MUSIC_PAGE_SIZE, clampPageLimit } from './pageLimits'

/**
 * 文档里的每页上限：`history.list` 最多 50 条、`localMusic.list` 100 条
 * （桌面宿主固定切这么长）。移动端此前两者都吃到分页兜底的 500，
 * 插件一次就能拿走全部历史，按 50 条写好的翻页逻辑反而以为后面还有。
 */
describe('service page limits', () => {
  it('clamps an oversized history page request', () => {
    expect(clampPageLimit(500, HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE)).toBe(50)
    expect(clampPageLimit(100, HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE)).toBe(50)
  })

  it('keeps a smaller requested size', () => {
    // 插件主动要少一点是合理用法，不该被抬到上限。
    expect(clampPageLimit(10, HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE)).toBe(10)
    expect(clampPageLimit(20, LOCAL_MUSIC_PAGE_SIZE, LOCAL_MUSIC_PAGE_SIZE)).toBe(20)
  })

  it('falls back for missing or invalid sizes instead of returning zero rows', () => {
    // 0 / 负数 / NaN 不能变成「每页 0 条」——插件会一直翻不到东西。
    expect(clampPageLimit(undefined, HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE)).toBe(50)
    expect(clampPageLimit(0, HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE)).toBe(50)
    expect(clampPageLimit(-3, HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE)).toBe(50)
    expect(clampPageLimit('abc', HISTORY_PAGE_SIZE, HISTORY_PAGE_SIZE)).toBe(50)
  })

  it('floors fractional sizes', () => {
    expect(clampPageLimit(12.9, LOCAL_MUSIC_PAGE_SIZE, LOCAL_MUSIC_PAGE_SIZE)).toBe(12)
  })

  it('keeps the two documented sizes distinct', () => {
    expect(HISTORY_PAGE_SIZE).toBe(50)
    expect(LOCAL_MUSIC_PAGE_SIZE).toBe(100)
  })
})
