import { describe, expect, it } from 'vitest'
import {
  base64Bytes,
  buildDataUrl,
  createCoverMemoryCache,
  isCacheableCoverUrl,
  selectEvictions,
  splitDataUrl,
  type CoverCacheEntry
} from './coverCache'

const entry = (url: string, bytes: number, usedAt: number): CoverCacheEntry => ({
  url,
  data: 'x',
  mime: 'image/jpeg',
  bytes,
  usedAt
})

describe('cover cache admission', () => {
  it('only caches remote http(s) images', () => {
    expect(isCacheableCoverUrl('https://cdn.example/a.jpg')).toBe(true)
    expect(isCacheableCoverUrl('http://cdn.example/a.jpg')).toBe(true)
  })

  it('skips data urls, local files and junk', () => {
    // data: 本身就是内联数据，blob:/文件路径不经过网络，重复缓存只是浪费空间。
    expect(isCacheableCoverUrl('data:image/png;base64,AAA')).toBe(false)
    expect(isCacheableCoverUrl('blob:https://x/1')).toBe(false)
    expect(isCacheableCoverUrl('file:///storage/a.jpg')).toBe(false)
    expect(isCacheableCoverUrl('')).toBe(false)
    expect(isCacheableCoverUrl(undefined)).toBe(false)
    expect(isCacheableCoverUrl(null)).toBe(false)
    expect(isCacheableCoverUrl(42)).toBe(false)
  })
})

describe('cover cache eviction', () => {
  it('does nothing while under the limit', () => {
    expect(selectEvictions([entry('a', 10, 1), entry('b', 10, 2)], 100)).toEqual([])
  })

  it('evicts oldest first until back under the limit', () => {
    const entries = [entry('new', 40, 300), entry('old', 40, 100), entry('mid', 40, 200)]
    const victims = selectEvictions(entries, 80)
    expect(victims.map((item) => item.url)).toEqual(['old'])
  })

  it('keeps evicting when one entry is not enough', () => {
    const entries = [entry('a', 50, 100), entry('b', 50, 200), entry('c', 50, 300)]
    expect(selectEvictions(entries, 50).map((item) => item.url)).toEqual(['a', 'b'])
  })

  it('evicts everything for a zero budget', () => {
    expect(selectEvictions([entry('a', 10, 1)], 0)).toHaveLength(1)
  })
})

describe('cover memory cache', () => {
  it('returns what it stored and keeps least-recently-used eviction order', () => {
    const cache = createCoverMemoryCache(30)
    cache.set('a', 'aaaaaaaaaa') // 10
    cache.set('b', 'bbbbbbbbbb') // 10
    cache.set('c', 'cccccccccc') // 10
    expect(cache.get('a')).toBe('aaaaaaaaaa') // 提升 a
    cache.set('d', 'dddddddddd')
    // 淘汰最久未用的 b，a 刚被读过应保留
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('aaaaaaaaaa')
  })

  it('refuses an entry larger than the whole budget', () => {
    const cache = createCoverMemoryCache(10)
    cache.set('big', 'x'.repeat(50))
    expect(cache.get('big')).toBeUndefined()
  })

  it('replacing the same url does not double count', () => {
    const cache = createCoverMemoryCache(100)
    cache.set('a', 'x'.repeat(40))
    cache.set('a', 'y'.repeat(40))
    expect(cache.size).toBe(1)
    expect(cache.get('a')).toBe('y'.repeat(40))
  })
})

describe('data url helpers', () => {
  it('splits a data url into mime and payload', () => {
    expect(splitDataUrl('data:image/png;base64,QUJD')).toEqual({ mime: 'image/png', data: 'QUJD' })
  })

  it('rejects non data urls', () => {
    expect(splitDataUrl('https://x/a.jpg')).toBeNull()
    expect(splitDataUrl('data:no-comma')).toBeNull()
  })

  it('round-trips through buildDataUrl', () => {
    const parts = splitDataUrl(buildDataUrl('image/jpeg', 'QUJD'))!
    expect(parts).toEqual({ mime: 'image/jpeg', data: 'QUJD' })
  })

  it('computes base64 byte length including padding', () => {
    expect(base64Bytes('')).toBe(0)
    expect(base64Bytes('QUJD')).toBe(3) // 4 chars, no padding
    expect(base64Bytes('QUJDRA==')).toBe(4) // 8 chars, 2 padding
    expect(base64Bytes('QUJDRQ==')).toBe(4)
  })
})
