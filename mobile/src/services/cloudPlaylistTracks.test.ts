import { describe, expect, it } from 'vitest'
import { cloudSongToTrack, durationMsOf } from './cloudPlaylistTracks'
import type { CloudSongDto } from './cloudSongList'

const song = (overrides: Partial<CloudSongDto> = {}): CloudSongDto => ({
  songmid: '123',
  name: '晴天',
  singer: '周杰伦',
  albumId: '9',
  albumName: '叶惠美',
  source: 'wy',
  interval: '4:29',
  img: 'cover.jpg',
  types: [{ type: '320k', size: '10MB' }],
  ...overrides
})

const provider = { pluginKey: 'wy-plugin', providerId: 'wy', qualities: ['128k', '320k', 'flac'] }

describe('duration parsing', () => {
  it('parses mm:ss and plain seconds', () => {
    expect(durationMsOf('4:29')).toBe(269000)
    expect(durationMsOf('65')).toBe(65000)
    expect(durationMsOf('1:05:41')).toBeUndefined()
  })

  it('returns undefined for junk instead of NaN', () => {
    // NaN 传进播放器会让进度条与媒体会话一起坏掉。
    expect(durationMsOf('abc')).toBeUndefined()
    expect(durationMsOf('')).toBeUndefined()
    expect(durationMsOf('0')).toBeUndefined()
    expect(durationMsOf(null)).toBeUndefined()
  })
})

describe('cloud song to track', () => {
  it('uses the provider plugin and its quality order', () => {
    const track = cloudSongToTrack(song(), [provider])
    expect(track.key).toBe('wy-plugin:wy:123')
    expect(track.pluginKey).toBe('wy-plugin')
    expect(track.qualities).toEqual(['128k', '320k', 'flac'])
    expect(track.playable).toBe(true)
    expect(track.durationMs).toBe(269000)
  })

  it('falls back to the cloud quality list when no plugin is installed', () => {
    const track = cloudSongToTrack(song(), [])
    expect(track.playable).toBe(false)
    expect(track.qualities).toEqual(['320k'])
    expect(track.key).toBe('cloud:wy:123')
  })

  it('keeps the private plugin resource when the source provided one', () => {
    // 私有协议的歌曲靠 pluginResource 才能在别的设备上解析。
    const resource = { providerId: 'guest-a', kind: 'track', id: 'abc', scope: 'plugin' }
    const track = cloudSongToTrack(song({ pluginResource: resource }), [provider])
    expect(track.ref).toEqual(resource)
  })

  it('splits artist strings the same way the shared playlist page does', () => {
    const track = cloudSongToTrack(song({ singer: 'A/B、C，D' }), [provider])
    expect(track.artists).toEqual(['A', 'B', 'C', 'D'])
  })

  it('does not invent values for missing fields', () => {
    const track = cloudSongToTrack(song({ name: '', singer: '', interval: '', img: '' }), [])
    expect(track.title).toBe('未知歌曲')
    expect(track.artists).toEqual([])
    expect(track.durationMs).toBeUndefined()
    expect(track.artworkUrl).toBeUndefined()
  })
})
