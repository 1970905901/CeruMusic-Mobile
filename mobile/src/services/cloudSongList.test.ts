import { describe, expect, it } from 'vitest'
import type { Track } from '@/types/music'
import {
  assertLegacySongIdentities,
  playlistTracksToCloud,
  trackToCloudSong
} from '@/services/cloudSongList'

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    key: 'plugin-a:wy:42',
    ref: { providerId: 'wy', kind: 'track', id: '42', scope: 'provider' },
    title: 'Song',
    artists: ['Artist A', 'Artist B'],
    album: 'Album',
    albumId: '99',
    durationMs: 200000,
    artworkUrl: 'https://example.com/cover.jpg',
    qualities: ['128k', '320k'],
    qualitySizes: { '128k': 1024, '320k': 4096 },
    playable: true,
    raw: { hash: 'abc', metadata: { hash: 'meta-hash' } },
    source: 'plugin',
    ...overrides
  }
}

describe('playlistTracksToCloud', () => {
  it('maps a track to the cloud DTO', () => {
    const [song] = playlistTracksToCloud([makeTrack()])
    expect(song).toMatchObject({
      songmid: '42',
      name: 'Song',
      singer: 'Artist A / Artist B',
      albumId: '99',
      albumName: 'Album',
      source: 'wy',
      interval: '03:20',
      img: 'https://example.com/cover.jpg',
      hash: 'meta-hash',
      types: [
        { type: '128k', size: '1.0 KB' },
        { type: '320k', size: '4.0 KB' }
      ]
    })
    expect(song.pluginResource).toBeUndefined()
  })

  it('drops local and downloaded tracks', () => {
    const songs = playlistTracksToCloud([
      makeTrack({ key: 'a', source: 'local' }),
      makeTrack({ key: 'b', localUri: 'file:///a.mp3' }),
      makeTrack({ key: 'c', downloadedPath: '/data/c.mp3' }),
      makeTrack({ key: 'd' })
    ])
    expect(songs).toHaveLength(1)
    expect(songs[0].songmid).toBe('42')
  })

  it('keeps a private resource reference for plugin-scoped tracks', () => {
    const [song] = playlistTracksToCloud([
      makeTrack({
        ref: {
          pluginId: 'plugin-a',
          providerId: 'wy',
          kind: 'track',
          id: '42',
          data: { x: 1 }
        } as any
      })
    ])
    expect(song.pluginResource).toMatchObject({
      pluginId: 'plugin-a',
      providerId: 'wy',
      id: '42'
    })
  })

  it('falls back to defaults when metadata is missing', () => {
    const song = trackToCloudSong(
      makeTrack({
        durationMs: undefined,
        artworkUrl: undefined,
        album: undefined,
        albumId: undefined,
        qualities: [],
        qualitySizes: undefined,
        raw: {}
      })
    )
    expect(song.interval).toBe('00:00')
    expect(song.img).toBe('default-cover')
    expect(song.albumName).toBe('未知专辑')
    expect(song.types).toEqual([])
  })
})

describe('legacy cloud identities', () => {
  it('rejects the same songmid from two sources', () => {
    expect(() =>
      assertLegacySongIdentities([
        { songmid: '1', source: 'wy' },
        { songmid: '1', source: 'tx' }
      ] as any)
    ).toThrow('同 ID 的不同来源歌曲')
  })

  it('allows the same songmid from the same source', () => {
    expect(() =>
      assertLegacySongIdentities([
        { songmid: '1', source: 'wy' },
        { songmid: '1', source: 'wy' }
      ] as any)
    ).not.toThrow()
  })
})
