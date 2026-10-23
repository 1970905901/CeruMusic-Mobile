import { describe, expect, it } from 'vitest'
import {
  buildMediaCacheRequestUrl,
  computeEvictionScores,
  isTrackCacheable,
  mediaCacheKeyForTrack,
  qualityRank,
  qualitySatisfiesRequest,
  shouldCacheQuality
} from './mediaCache'
import type { Track } from '@/types/music'

const track: Track = {
  key: 'plugin:test:track:1',
  pluginKey: 'plugin',
  ref: { pluginId: 'plugin', providerId: 'test', kind: 'track', id: '1', scope: 'provider' },
  title: 'Song',
  artists: ['Artist'],
  qualities: ['128k', '320k', 'flac'],
  playable: true,
  raw: {},
  source: 'plugin'
}

describe('mobile media cache policy', () => {
  it('builds stable request URLs and keys for public tracks', () => {
    const key = mediaCacheKeyForTrack(track)
    expect(key).toBe(JSON.stringify(['mobile-audio', 'public', '', 'test', '1']))
    expect(buildMediaCacheRequestUrl(key)).toBe(
      'https://cache.ceru.local/audio/' + encodeURIComponent(key)
    )
    expect(buildMediaCacheRequestUrl(key)).toBe(buildMediaCacheRequestUrl(mediaCacheKeyForTrack({ ...track })))
    const privateTrack = { ...track, ref: { ...track.ref, scope: undefined } }
    expect(mediaCacheKeyForTrack(privateTrack)).toBe(
      JSON.stringify(['mobile-audio', 'private', 'plugin', 'test', '1'])
    )
  })

  it('only caches online plugin tracks, not local or downloaded files', () => {
    expect(isTrackCacheable(track)).toBe(true)
    expect(isTrackCacheable({ ...track, localUri: 'file:///song.mp3' })).toBe(false)
    expect(isTrackCacheable({ ...track, downloadedPath: 'file:///song.mp3' })).toBe(false)
  })

  it('ranks qualities and enforces the configured cache quality cap', () => {
    expect(qualityRank('320k', track.qualities)).toBe(1)
    expect(qualityRank('unknown', track.qualities)).toBe(-1)
    expect(shouldCacheQuality('128k', track.qualities, '320k')).toBe(true)
    expect(shouldCacheQuality('flac', track.qualities, '320k')).toBe(false)
    expect(shouldCacheQuality('flac', track.qualities, '')).toBe(true)
    expect(shouldCacheQuality('flac', track.qualities, '不限制')).toBe(true)
    // 曲目未包含 flac 时（如仅有 128k/320k），不能因上限为 flac 而判定不可缓存
    expect(shouldCacheQuality('320k', ['128k', '320k'], 'flac')).toBe(true)
    expect(shouldCacheQuality('128k', ['128k', '320k'], 'flac')).toBe(true)
  })

  it('evaluates whether cached quality satisfies requested quality', () => {
    expect(qualitySatisfiesRequest('320k', '320k', track.qualities)).toBe(true)
    expect(qualitySatisfiesRequest('flac', '320k', track.qualities)).toBe(true)
    expect(qualitySatisfiesRequest('128k', '320k', track.qualities)).toBe(false)
    expect(qualitySatisfiesRequest('320k', '', track.qualities)).toBe(true)
    // 无法比较时允许命中缓存，避免重复拉取
    expect(qualitySatisfiesRequest('320k', 'flac', ['128k', '320k'])).toBe(true)
  })

  it('scores cache entries by frequency and recency for eviction', () => {
    const now = Date.now()
    const entries = [
      { hits: 10, lastAccess: now - 1000 },
      { hits: 1, lastAccess: now },
      { hits: 1, lastAccess: now - 100000 }
    ]
    const scores = computeEvictionScores(entries)
    expect(scores.get(entries[0])!).toBeGreaterThan(scores.get(entries[2])!)
    expect(scores.get(entries[1])!).toBeGreaterThan(scores.get(entries[2])!)
  })
})
