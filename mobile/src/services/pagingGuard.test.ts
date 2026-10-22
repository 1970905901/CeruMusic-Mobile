import { describe, expect, it } from 'vitest'
import { BARREN_PAGE_LIMIT, nextBarrenCount, pagingShouldContinue } from './pagingGuard'

describe('paging guard', () => {
  it('resets the streak as soon as a page adds something', () => {
    expect(nextBarrenCount(3, 1)).toBe(0)
    expect(nextBarrenCount(1, 0)).toBe(0)
  })

  it('counts consecutive pages that add nothing', () => {
    expect(nextBarrenCount(0, 0)).toBe(1)
    expect(nextBarrenCount(0, 1)).toBe(2)
  })

  it('tolerates one empty page because sources filter unavailable items', () => {
    // 音源常见的做法：整页条目都被过滤掉，但给了正确的下一页游标。
    // 只因一页没新增就停会漏掉后面所有歌曲。
    expect(pagingShouldContinue(true, nextBarrenCount(0, 0))).toBe(true)
  })

  it('stops after the streak reaches the limit', () => {
    expect(pagingShouldContinue(true, BARREN_PAGE_LIMIT)).toBe(false)
    expect(pagingShouldContinue(true, BARREN_PAGE_LIMIT + 5)).toBe(false)
  })

  it('stops when there is no cursor, however healthy the pages were', () => {
    expect(pagingShouldContinue(false, 0)).toBe(false)
  })

  it('treats a negative or dirty count as zero rather than stalling', () => {
    expect(nextBarrenCount(0, -3)).toBe(1)
    expect(nextBarrenCount(0, Number.NaN)).toBe(1)
  })
})
