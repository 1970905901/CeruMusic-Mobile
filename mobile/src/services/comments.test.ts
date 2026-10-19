import { describe, expect, it } from 'vitest'
import {
  buildCommentSong,
  commentPageHasMore,
  mergeCommentPages,
  normalizeCommentPage
} from './comments'
import type { Track } from '@/types/music'

const track: Track = {
  key: 'plugin:test:track:42',
  pluginKey: 'plugin',
  ref: {
    pluginId: 'plugin',
    providerId: 'test',
    kind: 'track',
    id: '42'
  },
  title: '测试歌曲',
  artists: ['歌手甲', '歌手乙'],
  album: '测试专辑',
  albumId: 'album-7',
  durationMs: 185000,
  artworkUrl: 'https://example.com/cover.jpg',
  qualities: ['128k', '320k'],
  qualitySizes: { '320k': 1024000 },
  playable: true,
  raw: {
    ref: {
      data: {
        song: {
          name: '旧名称',
          singer: '旧歌手',
          albumName: '旧专辑',
          interval: '03:05',
          lrc: '[00:00]测试歌词',
          _types: { '128k': { size: '3.2MB' } }
        }
      }
    },
    metadata: { hash: 'abc123' }
  },
  source: 'plugin'
}

describe('comments compatibility', () => {
  it('normalizes legacy comment fields, replies and pagination', () => {
    const page = normalizeCommentPage(
      {
        source: 'test',
        page: 2,
        limit: 20,
        total: 41,
        maxPage: 3,
        comments: [
          {
            commentId: 7,
            content: '第一条评论',
            time: 1710000000,
            nickname: '小明',
            avatarUrl: 'https://example.com/a.jpg',
            likeCount: 12,
            ipLocation: '上海',
            pics: ['https://example.com/1.jpg'],
            replies: [{ commentId: 8, content: '回复', username: '小红' }]
          }
        ]
      },
      { source: 'fallback', page: 1, limit: 20 }
    )

    expect(page.source).toBe('test')
    expect(page.page).toBe(2)
    expect(page.total).toBe(41)
    expect(page.maxPage).toBe(3)
    expect(page.comments[0]).toMatchObject({
      id: '7',
      text: '第一条评论',
      userName: '小明',
      avatar: 'https://example.com/a.jpg',
      likedCount: 12,
      location: '上海',
      images: ['https://example.com/1.jpg']
    })
    expect(page.comments[0].reply[0]).toMatchObject({ id: '8', text: '回复', userName: '小红' })
  })

  it('derives pagination when a plugin omits maxPage and total', () => {
    const comments = Array.from({ length: 20 }, (_, index) => ({ id: index, text: '评论' }))
    const page = normalizeCommentPage(
      { comments, page: 1, limit: 20 },
      { source: 'test', page: 1, limit: 20 }
    )
    expect(page.total).toBe(0)
    expect(page.maxPage).toBe(1)
    expect(commentPageHasMore(page, page.comments.length)).toBe(false)
  })

  it('honors maxPage when a plugin omits total', () => {
    const page = normalizeCommentPage(
      {
        comments: Array.from({ length: 20 }, (_, index) => ({ id: index, text: '评论' })),
        page: 1,
        limit: 20,
        maxPage: 3
      },
      { source: 'test', page: 1, limit: 20 }
    )
    expect(page.total).toBe(0)
    expect(page.maxPage).toBe(3)
    expect(commentPageHasMore(page, page.comments.length)).toBe(true)
  })

  it('keeps an empty response explicit and rejects malformed responses', () => {
    expect(
      normalizeCommentPage(
        { comments: [], total: 0, page: 1, limit: 20, maxPage: 0 },
        { source: 'test', page: 1, limit: 20 }
      ).comments
    ).toEqual([])
    expect(() => normalizeCommentPage(null, { source: 'test', page: 1, limit: 20 })).toThrow(
      '插件返回了无效的评论数据'
    )
    expect(() =>
      normalizeCommentPage({ comments: {} }, { source: 'test', page: 1, limit: 20 })
    ).toThrow('插件返回了无效的评论数据')
  })

  it('deduplicates comments across pages without dropping order', () => {
    const first = normalizeCommentPage(
      {
        comments: [
          { id: 1, text: '一' },
          { id: 2, text: '二' }
        ],
        total: 4,
        page: 1,
        limit: 2,
        maxPage: 2
      },
      { source: 'test', page: 1, limit: 2 }
    )
    const second = normalizeCommentPage(
      {
        comments: [
          { id: 2, text: '二' },
          { id: 3, text: '三' }
        ],
        total: 4,
        page: 2,
        limit: 2,
        maxPage: 2
      },
      { source: 'test', page: 2, limit: 2 }
    )
    expect(mergeCommentPages(first.comments, second.comments).map((item) => item.id)).toEqual([
      '1',
      '2',
      '3'
    ])
  })

  it('builds the legacy MusicItem action payload with the mobile track ref', () => {
    const song = buildCommentSong(track, 'test')
    expect(song).toMatchObject({
      songmid: '42',
      source: 'test',
      name: '测试歌曲',
      singer: '歌手甲、歌手乙',
      albumName: '测试专辑',
      albumId: 'album-7',
      interval: '03:05',
      img: 'https://example.com/cover.jpg',
      hash: 'abc123',
      lrc: '[00:00]测试歌词',
      pluginResource: track.ref
    })
    expect(song.types).toEqual([{ type: '128k' }, { type: '320k', sizeBytes: 1024000 }])
  })
})
