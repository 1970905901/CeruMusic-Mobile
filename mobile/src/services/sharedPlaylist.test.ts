import { describe, expect, it } from 'vitest'
import type { ProviderEntry } from '@/types/plugin'
import {
  fetchSharedPlaylistSongs,
  mergeSharedPlaylistSongs,
  parseSharedPlaylistInput,
  parseSharedPlaylistInputs,
  sharedPlaylistNextPos,
  sharedPlaylistSongKey,
  sharedPlaylistTrack,
  sharedPlaylistTracks
} from '@/services/sharedPlaylist'

const provider: ProviderEntry = {
  pluginKey: 'plugin-a',
  pluginId: 'plugin.a',
  pluginName: 'Plugin A',
  providerId: 'wy',
  providerName: 'Netease',
  protocols: [],
  qualities: ['320k']
}

describe('shared playlist mapping', () => {
  it('maps songs through installed providers', () => {
    const song = {
      songmid: 42,
      name: 'Song',
      singer: 'Artist A / Artist B',
      albumName: 'Album',
      source: 'wy',
      interval: '03:20',
      img: 'https://example.com/cover.jpg'
    } as any
    const track = sharedPlaylistTrack(song, { providers: [provider], shareId: 'share-1' })
    expect(track).toMatchObject({
      key: 'plugin-a:wy:42',
      pluginKey: 'plugin-a',
      ref: { providerId: 'wy', kind: 'track', id: '42', scope: 'provider' },
      title: 'Song',
      artists: ['Artist A', 'Artist B'],
      album: 'Album',
      durationMs: 200000,
      playable: true,
      source: 'plugin'
    })
    expect(track.artists).toEqual(['Artist A', 'Artist B'])
  })

  it('keeps unmatched songs visible but not playable', () => {
    const song = { songmid: '9', name: 'Song', singer: '', source: 'missing' } as any
    const track = sharedPlaylistTrack(song, { providers: [provider], shareId: 'share-1' })
    expect(track.playable).toBe(false)
    expect(track.source).toBeUndefined()
    expect(track.key).toBe('share:missing:9')
  })

  it('maps pages and reads the last position cursor', () => {
    const songs = [
      { songmid: '1', source: 'wy', pos: 7 },
      { songmid: '2', source: 'wy', pos: 13 }
    ] as any[]
    expect(sharedPlaylistTracks(songs, { providers: [provider], shareId: 's' })).toHaveLength(2)
    expect(sharedPlaylistNextPos(songs)).toBe(13)
    expect(sharedPlaylistNextPos([])).toBeUndefined()
  })
})

describe('shared playlist links', () => {
  it('accepts raw ids and every supported share link shape', () => {
    expect(parseSharedPlaylistInput('abc123')).toBe('abc123')
    expect(parseSharedPlaylistInput('cerumusic://playlist/share/xyz789')).toBe('xyz789')
    expect(parseSharedPlaylistInput('cerumusic://share/playlist/abc-123')).toBe('abc-123')
    expect(parseSharedPlaylistInput('https://ceru.shiqianjiang.cn/share/playlist/qwe123')).toBe(
      'qwe123'
    )
    expect(parseSharedPlaylistInput('https://example.com/playlist/share/foo_bar?x=1')).toBe(
      'foo_bar'
    )
    expect(parseSharedPlaylistInput('https://example.com/s?shareId=zzz111')).toBe('zzz111')
  })

  it('rejects empty input and links without a playlist share id', () => {
    expect(() => parseSharedPlaylistInput('')).toThrow('请输入歌单分享链接或 ID')
    expect(() => parseSharedPlaylistInput('not a url')).toThrow('无法识别的歌单分享链接')
    expect(() => parseSharedPlaylistInput('https://example.com/foo/bar')).toThrow(
      '链接中缺少歌单分享 ID'
    )
  })

  it('parses a multi-line paste and reports duplicates and invalid lines', () => {
    const entries = parseSharedPlaylistInputs(
      [
        'cerumusic://playlist/share/aaa111',
        'https://ceru.shiqianjiang.cn/share/playlist/bbb222',
        'cerumusic://playlist/share/aaa111',
        'https://example.com/nope'
      ].join('\n')
    )
    expect(entries).toHaveLength(4)
    expect(entries[0]).toMatchObject({ id: 'aaa111' })
    expect(entries[1]).toMatchObject({ id: 'bbb222' })
    expect(entries[2]).toMatchObject({ error: '重复的分享链接' })
    expect(entries[3]).toMatchObject({ error: '链接中缺少歌单分享 ID' })
    expect(() => parseSharedPlaylistInputs('  \n ')).toThrow('请输入至少一个歌单分享链接')
  })
})

describe('shared playlist pagination', () => {
  it('merges songs across pages and drops cross-page duplicates', () => {
    const merged = mergeSharedPlaylistSongs([
      [
        { songmid: '1', source: 'wy' },
        { songmid: '2', source: 'wy' }
      ],
      [
        { songmid: '2', source: 'wy' },
        { songmid: '3', source: 'tx' }
      ]
    ] as any)
    expect(merged.map((song) => sharedPlaylistSongKey(song))).toEqual(['wy:1', 'wy:2', 'tx:3'])
  })

  it('walks every page until the reported total is reached', async () => {
    const calls: Array<number | undefined> = []
    const loadPage = async (_limit: number, pos?: number): Promise<any> => {
      calls.push(pos)
      const songs =
        pos === undefined
          ? [
              { songmid: '1', source: 'wy', pos: 1 },
              { songmid: '2', source: 'wy', pos: 2 }
            ]
          : [
              { songmid: '3', source: 'wy', pos: 3 },
              { songmid: '4', source: 'wy', pos: 4 }
            ]
      return {
        username: 'tester',
        playlist: { name: 'Shared', total: 4, songs }
      }
    }
    const result = await fetchSharedPlaylistSongs('share-1', loadPage, { pageSize: 2 })
    expect(calls).toEqual([undefined, 2])
    expect(result.detail.playlist.name).toBe('Shared')
    expect(result.songs).toHaveLength(4)
  })

  it('stops on an empty page and on a non-advancing cursor', async () => {
    let page = 0
    const empty = await fetchSharedPlaylistSongs('share-2', async (): Promise<any> => {
      page++
      return { playlist: { total: 10, songs: [] } }
    })
    expect(page).toBe(1)
    expect(empty.songs).toHaveLength(0)

    let cursorCalls = 0
    const stuck = await fetchSharedPlaylistSongs('share-3', async (): Promise<any> => {
      cursorCalls++
      return { playlist: { total: 10, songs: [{ songmid: '1', source: 'wy', pos: 5 }] } }
    })
    expect(cursorCalls).toBe(2)
    expect(stuck.songs).toHaveLength(1)
  })

  it('stops after two pages that add no new songs', async () => {
    let calls = 0
    const progress: number[] = []
    const result = await fetchSharedPlaylistSongs(
      'share-loop',
      async (_limit: number, pos?: number): Promise<any> => {
        calls++
        // 音源返回重复页：pos 一直前进，内容却始终是同一首。
        return { playlist: { total: 500, songs: [{ songmid: '1', source: 'wy', pos: (pos ?? 0) + 1 }] } }
      },
      { pageSize: 1, onProgress: (loaded) => progress.push(loaded) }
    )

expect(calls).toBe(3)
    expect(result.songs).toHaveLength(1)
expect(progress).toEqual([1, 1, 1])
  })

  it('counts only newly added songs toward the reported total', async () => {
    const progress: number[] = []
    const result = await fetchSharedPlaylistSongs(
      'share-dup',
      async (_limit: number, pos?: number): Promise<any> =>
        pos === undefined
          ? { playlist: { total: 4, songs: [{ songmid: '1', source: 'wy', pos: 1 }, { songmid: '2', source: 'wy', pos: 2 }] } }
          : { playlist: { total: 4, songs: [{ songmid: '2', source: 'wy', pos: 3 }, { songmid: '3', source: 'wy', pos: 4 }] } },
      { pageSize: 2, onProgress: (loaded) => progress.push(loaded) }
    )

    expect(result.songs).toHaveLength(3)
expect(progress).toEqual([2, 3, 3])
  })

  it('rejects a missing playlist payload', async () => {
    await expect(fetchSharedPlaylistSongs('share-4', async () => ({}) as any)).rejects.toThrow(
      '歌单分享不存在'
    )
  })
})
