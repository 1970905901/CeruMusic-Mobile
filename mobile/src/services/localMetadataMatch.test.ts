import { describe, expect, it, vi } from 'vitest'
import type { Track } from '@/types/music'
import {
  buildMatchQuery,
  hasUnknownArtist,
  hasUnknownTitle,
  needsMetadataMatch,
  pickBestMatch,
  runLocalMetadataMatch,
  scoreMatch
} from '@/services/localMetadataMatch'

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    key: 'local:1',
    ref: { providerId: 'local', kind: 'track', id: 'local:1', scope: 'provider' },
    title: '夜曲',
    artists: ['周杰伦'],
    album: '十一月的萧邦',
    durationMs: 227000,
    artworkUrl: 'app://cover.jpg',
    qualities: [],
    playable: true,
    raw: {},
    source: 'local',
    ...overrides
  }
}

describe('local metadata match', () => {
  it('flags tracks with a missing cover, album, or unknown artist', () => {
    expect(needsMetadataMatch(makeTrack())).toBe(false)
    expect(needsMetadataMatch(makeTrack({ artworkUrl: undefined }))).toBe(true)
    expect(needsMetadataMatch(makeTrack({ album: undefined }))).toBe(true)
    expect(needsMetadataMatch(makeTrack({ title: '未知曲目' }))).toBe(true)
    expect(needsMetadataMatch(makeTrack({ artists: ['未知艺术家'] }))).toBe(true)
  })

  it('reports which identity fields still need an online fill', () => {
    expect(hasUnknownTitle(makeTrack())).toBe(false)
    expect(hasUnknownArtist(makeTrack())).toBe(false)
    expect(hasUnknownTitle(makeTrack({ title: '未知曲目' }))).toBe(true)
    expect(hasUnknownArtist(makeTrack({ artists: ['未知艺术家'] }))).toBe(true)
    expect(hasUnknownArtist(makeTrack({ artists: [] }))).toBe(true)
  })

  it('falls back to the file name when embedded tags are unknown', () => {
    const track = makeTrack({
      title: '未知曲目',
      artists: ['未知艺术家'],
      localPath: 'file:///data/music/周杰伦 - 夜曲.mp3'
    })
    expect(buildMatchQuery(track)).toBe('周杰伦 - 夜曲')
  })

  it('prefers the better title and artist match over a closer duration', () => {
    const track = makeTrack()
    const exact = makeTrack({ key: 'plugin:1', title: '夜曲', artists: ['周杰伦'], durationMs: 200000 })
    const wrong = makeTrack({ key: 'plugin:2', title: '稻香', artists: ['周杰伦'], durationMs: 227000 })
    expect(scoreMatch(track, exact)).toBeGreaterThan(scoreMatch(track, wrong))
    expect(pickBestMatch(track, [wrong, exact])?.key).toBe('plugin:1')
  })

  it('rejects candidates below the score floor', () => {
    const track = makeTrack()
    const unrelated = makeTrack({ key: 'plugin:9', title: '完全不同的歌曲', artists: ['别人'], durationMs: 227000 })
    expect(pickBestMatch(track, [unrelated])).toBeNull()
  })

  it('applies matched metadata and keeps running past failures', async () => {
    const tracks = [makeTrack({ key: 'local:a' }), makeTrack({ key: 'local:b', title: '晴天' })]
    const search = vi.fn(async (query: string) => {
      if (query.includes('晴天')) throw new Error('network down')
      return [makeTrack({ key: 'plugin:a', title: '夜曲', artists: ['周杰伦'], durationMs: 227000 })]
    })
    const apply = vi.fn(async () => true)
    const progress: number[] = []

    const result = await runLocalMetadataMatch({
      tracks,
      search,
      lyrics: async () => '[00:00.00]lyric',
      apply,
      onProgress: (snapshot) => progress.push(snapshot.processed)
    })

    expect(result).toEqual({ processed: 2, total: 2, matched: 1 })
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(
      tracks[0],
      expect.objectContaining({ key: 'plugin:a' }),
      { cover: 'app://cover.jpg', lyrics: '[00:00.00]lyric' }
    )
    expect(progress.at(-1)).toBe(2)
  })

  it('continues matching when the source has no lyrics', async () => {
    const result = await runLocalMetadataMatch({
      tracks: [makeTrack()],
      search: async () => [makeTrack({ key: 'plugin:a', durationMs: 227000 })],
      lyrics: async () => {
        throw new Error('no lyrics')
      },
      apply: async () => true
    })

    expect(result.matched).toBe(1)
  })
})
