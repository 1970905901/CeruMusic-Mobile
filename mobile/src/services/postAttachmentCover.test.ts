import { describe, expect, it } from 'vitest'
import {
  createRemoteCoverCache,
  localAttachmentCover,
  needsRemoteCover
} from './postAttachmentCover'

describe('local attachment cover', () => {
  it('uses the song artwork for a song attachment', () => {
    expect(localAttachmentCover({ type: 'song', song: { img: 'a.jpg' } })).toBe('a.jpg')
  })

  it('prefers the playlist cover, then the first preview artwork', () => {
    expect(
      localAttachmentCover({ type: 'playlist', cover: 'p.jpg', preview: [{ img: 'x.jpg' }] })
    ).toBe('p.jpg')
    expect(localAttachmentCover({ type: 'playlist', preview: [{ img: 'x.jpg' }] })).toBe('x.jpg')
  })

  it('ignores blank and non-string values instead of rendering an empty img', () => {
    expect(localAttachmentCover({ type: 'song', song: { img: '   ' } })).toBe('')
    expect(localAttachmentCover({ type: 'song', song: { img: 42 } })).toBe('')
    expect(localAttachmentCover(null)).toBe('')
  })
})

describe('remote cover fallback', () => {
  it('is only needed for playlists with nothing local but a list id', () => {
    // 单曲没有远端兜底：song.img 就是它的封面，缺了说明这条帖子本来就没图。
    expect(needsRemoteCover({ type: 'song', listId: 'l1' })).toBe(false)
    expect(needsRemoteCover({ type: 'playlist', listId: 'l1' })).toBe(true)
    expect(needsRemoteCover({ type: 'playlist', listId: 'l1', cover: 'c.jpg' })).toBe(false)
    expect(needsRemoteCover({ type: 'playlist', listId: '' })).toBe(false)
    expect(needsRemoteCover({ type: 'playlist' })).toBe(false)
    expect(needsRemoteCover(null)).toBe(false)
  })
})

describe('remote cover cache', () => {
  it('remembers both hits and misses', () => {
    // 失败也要缓存，否则每次滚动都重试一个拿不到封面的歌单。
    const cache = createRemoteCoverCache()
    cache.set('a', 'cover.jpg')
    cache.set('b', '')
    expect(cache.get('a')).toBe('cover.jpg')
    expect(cache.get('b')).toBe('')
    expect(cache.get('c')).toBeUndefined()
  })

  it('evicts the oldest entry past the limit', () => {
    const cache = createRemoteCoverCache(2)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('c', '3')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe('2')
    expect(cache.size).toBe(2)
  })

  it('refreshes recency on overwrite', () => {
    const cache = createRemoteCoverCache(2)
    cache.set('a', '1')
    cache.set('b', '2')
    cache.set('a', '1b')
    cache.set('c', '3')
    expect(cache.get('a')).toBe('1b')
    expect(cache.get('b')).toBeUndefined()
  })
})
