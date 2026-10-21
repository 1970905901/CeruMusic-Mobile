import { describe, expect, it } from 'vitest'
import { chatSharePlaylistView, chatShareSongView } from './chatShareCards'

describe('chat share card views', () => {
  it('renders song fields with share attribution', () => {
    const view = chatShareSongView({
      username: '小林',
      song: { name: '晴天', singer: '周杰伦', img: 'https://img/x.jpg' }
    } as any)
    expect(view).toEqual({
      kind: 'song',
      title: '晴天',
      subtitle: '周杰伦',
      meta: '单曲 · 由 小林 分享',
      cover: 'https://img/x.jpg',
      tracks: []
    })
  })

  it('falls back for missing song fields', () => {
    const view = chatShareSongView({ username: '', song: {} } as any)
    expect(view.title).toBe('分享歌曲')
    expect(view.subtitle).toBe('未知歌手')
    expect(view.meta).toBe('单曲 · 由 音乐同好 分享')
    expect(view.cover).toBe('')
  })

  it('previews at most three playlist tracks and keeps total', () => {
    const view = chatSharePlaylistView({
      username: '小林',
      playlist: {
        name: '夜跑',
        total: 42,
        cover: 'https://img/p.jpg',
        songs: [
          { name: 'A', singer: 'a' },
          { name: 'B' },
          { name: 'C', singer: 'c' },
          { name: 'D', singer: 'd' }
        ]
      }
    } as any)
    expect(view.kind).toBe('playlist')
    expect(view.title).toBe('夜跑')
    expect(view.subtitle).toBe('歌单 · 42 首')
    expect(view.tracks).toHaveLength(3)
    expect(view.tracks[1]).toEqual({ name: 'B', singer: '' })
  })

  it('tolerates a missing playlist payload', () => {
    const view = chatSharePlaylistView({} as any)
    expect(view.title).toBe('分享歌单')
    expect(view.subtitle).toBe('歌单 · 0 首')
    expect(view.tracks).toEqual([])
  })
})
