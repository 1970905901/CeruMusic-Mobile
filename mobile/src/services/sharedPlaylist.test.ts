import { describe, expect, it } from 'vitest'
import type { ProviderEntry } from '@/types/plugin'
import {
  sharedPlaylistNextPos,
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
