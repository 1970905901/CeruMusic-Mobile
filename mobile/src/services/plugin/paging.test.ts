import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, paginate } from './paging'

const items = Array.from({ length: 250 }, (_, index) => index)

describe('host paging', () => {
  it('returns the first page with a cursor when more remain', () => {
    const page = paginate(items, undefined, 100)
    expect(page?.items).toHaveLength(100)
    expect(page?.items[0]).toBe(0)
    expect(page?.nextCursor).toBe('p:100')
    expect(page?.totalEstimate).toBe(250)
  })

  it('walks to the end and omits the cursor on the last page', () => {
    // 有 nextCursor 才会继续翻；最后一页必须没有，否则插件会再要一次空页。
    const second = paginate(items, 'p:100', 100)
    expect(second?.items[0]).toBe(100)
    expect(second?.nextCursor).toBe('p:200')
    const last = paginate(items, 'p:200', 100)
    expect(last?.items).toHaveLength(50)
    expect(last?.nextCursor).toBeUndefined()
  })

  it('clamps the page size instead of trusting the plugin', () => {
    // 数据比上限多时才看得出夹取生效。
    const many = Array.from({ length: MAX_PAGE_SIZE + 40 }, (_, index) => index)
    expect(paginate(many, undefined, 10_000)?.items).toHaveLength(MAX_PAGE_SIZE)
    expect(paginate(items, undefined, 0)?.items).toHaveLength(DEFAULT_PAGE_SIZE)
    expect(paginate(items, undefined, -5)?.items).toHaveLength(DEFAULT_PAGE_SIZE)
    expect(paginate(items, undefined, Number.NaN)?.items).toHaveLength(DEFAULT_PAGE_SIZE)
  })

  it('treats an empty cursor as the start', () => {
    expect(paginate(items, '', 5)?.items).toEqual([0, 1, 2, 3, 4])
    expect(paginate(items, '   ', 5)?.items).toEqual([0, 1, 2, 3, 4])
  })

  it('rejects a tampered cursor instead of silently restarting', () => {
    // 静默从头返回会让「翻到空为止」的插件死循环。
    expect(paginate(items, 'p:abc', 10)).toBeNull()
    expect(paginate(items, 'nonsense', 10)).toBeNull()
    expect(paginate(items, 'p:-1', 10)).toBeNull()
  })

  it('handles an offset past the end and an empty list', () => {
    expect(paginate(items, 'p:999', 10)?.items).toEqual([])
    expect(paginate(items, 'p:999', 10)?.nextCursor).toBeUndefined()
    expect(paginate([], undefined, 10)).toEqual({ items: [], totalEstimate: 0 })
  })
})
