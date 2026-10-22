import { describe, expect, it } from 'vitest'
import { dedupeByKey } from './listMerge'

describe('list merge dedupe', () => {
  it('keeps the first occurrence and drops later duplicates', () => {
    // 分页边界重复返回上一页最后一首时，不能让它在列表里出现两次。
    const items = [{ key: 'a' }, { key: 'b' }, { key: 'a' }, { key: 'c' }]
    expect(dedupeByKey(items, (item) => item.key).map((item) => item.key)).toEqual([
      'a',
      'b',
      'c'
    ])
  })

  it('preserves the original order', () => {
    const items = [{ key: 'b' }, { key: 'a' }, { key: 'b' }]
    expect(dedupeByKey(items, (item) => item.key).map((item) => item.key)).toEqual(['b', 'a'])
  })

  it('keeps entries whose key cannot be resolved', () => {
    // 无 key 的条目无法判重；保留比静默丢弃安全。
    const items = [{ key: '' }, { key: null }, { key: 'a' }]
    expect(dedupeByKey(items, (item) => item.key)).toHaveLength(3)
  })

  it('handles an empty list and a single item', () => {
    expect(dedupeByKey([], (item: { key: string }) => item.key)).toEqual([])
    expect(dedupeByKey([{ key: 'x' }], (item) => item.key)).toHaveLength(1)
  })

  it('does not mutate the input array', () => {
    const items = [{ key: 'a' }, { key: 'a' }]
    dedupeByKey(items, (item) => item.key)
    expect(items).toHaveLength(2)
  })
})
