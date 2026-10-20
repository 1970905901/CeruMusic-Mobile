import { describe, expect, it } from 'vitest'
import type { ProviderEntry } from '@/types/plugin'
import type { Track } from '@/types/music'
import {
  decryptPlaylistText,
  encryptPlaylistTracks,
  packPlaylistFile,
  parsePlaylistFile,
  playlistFileTracks,
  unpackPlaylistFile
} from '@/services/playlistFiles'

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
    qualities: ['128k'],
    qualitySizes: { '128k': 1024 },
    playable: true,
    raw: {},
    source: 'plugin',
    ...overrides
  }
}

const provider: ProviderEntry = {
  pluginKey: 'plugin-a',
  pluginId: 'plugin-a',
  pluginName: 'Plugin A',
  providerId: 'wy',
  providerName: 'Wy',
  protocols: ['wy'],
  qualities: ['128k', '320k']
}

describe('playlist files', () => {
  it('round-trips an encrypted .cpl payload', () => {
    const encrypted = encryptPlaylistTracks([makeTrack()])
    const songs = parsePlaylistFile('backup.cpl', new TextEncoder().encode(encrypted))
    expect(songs).toHaveLength(1)
    expect(songs[0]).toMatchObject({
      songmid: '42',
      source: 'wy',
      name: 'Song',
      singer: 'Artist A / Artist B'
    })
  })

  it('round-trips a gzipped .cmpl payload', () => {
    const encrypted = encryptPlaylistTracks([makeTrack()])
    const packed = packPlaylistFile(encrypted)
    expect(unpackPlaylistFile(packed)).toBe(encrypted)
    const songs = parsePlaylistFile('backup.cmpl', packed)
    expect(songs[0].songmid).toBe('42')
  })

  it('drops local and downloaded tracks before encrypting', () => {
    const encrypted = encryptPlaylistTracks([
      makeTrack({ key: 'a', source: 'local' }),
      makeTrack({ key: 'b', localUri: 'file:///a.mp3' }),
      makeTrack({ key: 'c' })
    ])
    const songs = decryptPlaylistText(encrypted)
    expect(songs).toHaveLength(1)
    expect(songs[0].songmid).toBe('42')
  })

  it('rejects exporting when only local tracks exist', () => {
    expect(() => encryptPlaylistTracks([makeTrack({ source: 'local' })])).toThrow('没有可导出的在线歌曲')
  })

  it('keeps a private plugin resource reference', () => {
    const encrypted = encryptPlaylistTracks([
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
    expect(decryptPlaylistText(encrypted)[0].pluginResource).toMatchObject({
      pluginId: 'plugin-a',
      providerId: 'wy',
      id: '42'
    })
  })

  it('maps imported songs onto installed providers', () => {
    const tracks = playlistFileTracks(
      [
        { songmid: '42', source: 'wy', name: 'Song', singer: 'Artist', interval: '03:20', img: 'cover' },
        { songmid: '7', source: 'tx', name: 'Other', singer: 'B', interval: '01:00', img: '' }
      ],
      [provider]
    )
    expect(tracks).toHaveLength(2)
    expect(tracks[0]).toMatchObject({
      key: 'plugin-a:wy:42',
      title: 'Song',
      durationMs: 200000,
      playable: true,
      source: 'plugin'
    })
    expect(tracks[1].playable).toBe(false)
    expect(tracks[1].key).toBe('share:tx:7')
  })

  it('rejects unknown file types and bad payloads', () => {
    expect(() => parsePlaylistFile('backup.json', new Uint8Array())).toThrow('请选择')
    expect(() => decryptPlaylistText('not-encrypted')).toThrow('解密播放列表失败')
  })
})
