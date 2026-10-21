import { describe, expect, it } from 'vitest'
import {
  LYRIC_CACHE_LIMIT,
  getLyricCache,
  hasLyrics,
  putLyricCache,
  shouldCacheLyrics
} from './lyricProvider'
import type { LyricDocument } from '@/types/music'

function doc(text: string): LyricDocument {
  return { lines: [{ startMs: 0, text }], format: 'lrc' }
}

describe('lyric cache admission', () => {
  it('never caches an empty document', () => {
    // 插件把「暂时取不到」返回成空文档时，缓存它会让这首歌之后一直没歌词。
    expect(shouldCacheLyrics({ lines: [], format: 'plain' })).toBe(false)
    expect(shouldCacheLyrics(null)).toBe(false)
    expect(shouldCacheLyrics({ lines: [], plainText: '   ', format: 'plain' })).toBe(false)
  })

  it('caches a document with timed lines or plain text', () => {
    expect(shouldCacheLyrics(doc('hello'))).toBe(true)
    expect(shouldCacheLyrics({ lines: [], plainText: 'untimed', format: 'plain' })).toBe(true)
  })

  it('treats an empty document as "no lyrics" for the caller to retry', () => {
    expect(hasLyrics({ lines: [], format: 'plain' })).toBe(false)
  })
})

describe('lyric cache eviction', () => {
  it('drops the oldest entry once the limit is exceeded', () => {
    const cache = new Map<string, LyricDocument>()
    for (let i = 0; i < 4; i++) putLyricCache(cache, `k${i}`, doc(`line ${i}`), 3)
    expect([...cache.keys()]).toEqual(['k1', 'k2', 'k3'])
  })

  it('keeps recently read entries when the limit is hit', () => {
    const cache = new Map<string, LyricDocument>()
    putLyricCache(cache, 'a', doc('a'), 2)
    putLyricCache(cache, 'b', doc('b'), 2)
    expect(getLyricCache(cache, 'a')).toBeTruthy()
    putLyricCache(cache, 'c', doc('c'), 2)
    // a 刚被读过，应该淘汰 b
    expect([...cache.keys()]).toEqual(['a', 'c'])
  })

  it('does not store an empty document even when the key is new', () => {
    const cache = new Map<string, LyricDocument>()
    putLyricCache(cache, 'empty', { lines: [], format: 'plain' })
    expect(cache.has('empty')).toBe(false)
  })

  it('defaults to a bounded size', () => {
    const cache = new Map<string, LyricDocument>()
    for (let i = 0; i < LYRIC_CACHE_LIMIT + 5; i++) putLyricCache(cache, `k${i}`, doc(String(i)))
    expect(cache.size).toBe(LYRIC_CACHE_LIMIT)
  })

  it('returns undefined for a miss without mutating the cache', () => {
    const cache = new Map<string, LyricDocument>()
    putLyricCache(cache, 'a', doc('a'))
    expect(getLyricCache(cache, 'missing')).toBeUndefined()
    expect([...cache.keys()]).toEqual(['a'])
  })
})
