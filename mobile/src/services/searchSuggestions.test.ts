import { describe, expect, it } from 'vitest'
import {
  MAX_SUGGESTIONS,
  MAX_SUGGESTIONS_PER_GROUP,
  normalizeSuggestions
} from './searchSuggestions'

describe('search suggestion normalization', () => {
  it('treats a plain string array as song suggestions', () => {
    expect(normalizeSuggestions(['七里香', '晴天'])).toEqual([
      { kind: 'songs', text: '七里香' },
      { kind: 'songs', text: '晴天' }
    ])
  })

  it('reads a paged { items } response', () => {
    expect(normalizeSuggestions({ items: [{ name: '稻香' }, { title: '夜曲' }] })).toEqual([
      { kind: 'songs', text: '稻香' },
      { kind: 'songs', text: '夜曲' }
    ])
  })

  it('keeps the desktop group order for grouped payloads', () => {
    // 桌面版按 单曲 / 歌手 / 专辑 / 歌单 渲染，不跟随对象键顺序。
    const items = normalizeSuggestions({
      order: ['playlists', 'songs', 'artists'],
      playlists: [{ name: '周杰伦精选' }],
      songs: [{ name: '晴天' }],
      artists: [{ name: '周杰伦' }]
    })
    expect(items.map((item) => item.kind)).toEqual(['songs', 'artists', 'playlists'])
  })

  it('shows the artist as a hint without duplicating the text', () => {
    expect(
      normalizeSuggestions({ songs: [{ name: '晴天', artist: { name: '周杰伦' } }] })
    ).toEqual([{ kind: 'songs', text: '晴天', hint: '周杰伦' }])
    // 歌手的 name 与 artist 相同（插件常见写法）时不要重复显示两遍。
    expect(
      normalizeSuggestions({ artists: [{ name: '周杰伦', artist: '周杰伦' }] })
    ).toEqual([{ kind: 'artists', text: '周杰伦' }])
  })

  it('caps each group and the list overall', () => {
    // 手机屏幕放不下几十条建议；面板过高会把搜索框顶出视野。
    const many = Array.from({ length: 10 }, (_, index) => ({ name: `歌${index}` }))
    const items = normalizeSuggestions({ songs: many })
    expect(items).toHaveLength(MAX_SUGGESTIONS_PER_GROUP)

    const grouped = normalizeSuggestions({
      songs: many,
      artists: many,
      albums: many,
      playlists: many
    })
    expect(grouped.length).toBe(MAX_SUGGESTIONS)
  })

  it('deduplicates repeats within a group', () => {
    expect(
      normalizeSuggestions({ songs: [{ name: '晴天' }, { name: '晴天' }, { name: '夜曲' }] })
    ).toHaveLength(2)
  })

  it('returns nothing for unusable payloads instead of throwing', () => {
    expect(normalizeSuggestions(null)).toEqual([])
    expect(normalizeSuggestions({})).toEqual([])
    expect(normalizeSuggestions(42)).toEqual([])
    expect(normalizeSuggestions([null, {}, { name: '   ' }])).toEqual([])
  })
})
