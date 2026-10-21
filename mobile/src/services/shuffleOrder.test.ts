import { describe, expect, it } from 'vitest'
import {
  buildShuffleOrder,
  isShuffleOrderValid,
  nextShuffleKey,
  previousShuffleKey
} from './shuffleOrder'

describe('shuffle order construction', () => {
  it('keeps every track exactly once', () => {
    const keys = ['a', 'b', 'c', 'd', 'e']
    const order = buildShuffleOrder(keys)
    expect([...order].sort()).toEqual([...keys].sort())
  })

  it('does not mutate the input', () => {
    const keys = ['a', 'b', 'c']
    buildShuffleOrder(keys, () => 0)
    expect(keys).toEqual(['a', 'b', 'c'])
  })

  it('produces a deterministic order for a fixed random source', () => {
    expect(buildShuffleOrder(['a', 'b', 'c'], () => 0)).toEqual(['b', 'c', 'a'])
  })
})

describe('shuffle order validity', () => {
  it('accepts a reordering of the same tracks', () => {
    expect(isShuffleOrderValid(['c', 'a', 'b'], ['a', 'b', 'c'])).toBe(true)
  })

  it('rejects a stale order after tracks are added or removed', () => {
    // 队列变化后必须重建，否则拿着旧下标会取到别的歌（原实现的 bug）。
    expect(isShuffleOrderValid(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
    expect(isShuffleOrderValid(['a', 'b', 'c'], ['a', 'b'])).toBe(false)
  })

  it('rejects an order naming a track that is no longer queued', () => {
    expect(isShuffleOrderValid(['a', 'x', 'c'], ['a', 'b', 'c'])).toBe(false)
  })

  it('treats two empty queues as valid', () => {
    expect(isShuffleOrderValid([], [])).toBe(true)
  })
})

describe('advancing through the shuffle order', () => {
  it('walks the order rather than picking at random', () => {
    // 逐个抽样会让同一首歌连续出现；游标推进保证一轮听完。
    const order = ['b', 'd', 'a', 'c']
    expect(nextShuffleKey(order, 'b', { wrap: false }).key).toBe('d')
    expect(nextShuffleKey(order, 'd', { wrap: false }).key).toBe('a')
  })

  it('stops at the end when wrapping is off', () => {
    expect(nextShuffleKey(['a', 'b', 'c'], 'c', { wrap: false }).key).toBeNull()
  })

  it('reshuffles when wrapping and starts from the new first track', () => {
    const result = nextShuffleKey(['a', 'b', 'c'], 'c', { wrap: true, random: () => 0 })
    expect(result.order).toEqual(['b', 'c', 'a'])
    expect(result.key).toBe('b')
  })

  it('starts from the top when the current track is not in the order', () => {
    expect(nextShuffleKey(['a', 'b'], 'missing', { wrap: false }).key).toBe('a')
  })

  it('has nothing to play for an empty order', () => {
    expect(nextShuffleKey([], 'a', { wrap: true }).key).toBeNull()
  })
})

describe('stepping backwards', () => {
  it('returns the previous track in the shuffled sequence', () => {
    expect(previousShuffleKey(['b', 'd', 'a'], 'a')).toBe('d')
  })

  it('stays on the first track instead of wrapping', () => {
    expect(previousShuffleKey(['b', 'd', 'a'], 'b')).toBe('b')
    expect(previousShuffleKey([], 'b')).toBeNull()
  })
})
