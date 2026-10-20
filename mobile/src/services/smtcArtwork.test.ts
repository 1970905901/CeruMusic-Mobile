import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SMTC_HIRES_TARGET_SIZE,
  SMTC_HIRES_TIMEOUT_MS,
  hiresSourceArtworkUrl,
  resolveHiresCover,
  supportsHiresCover
} from './smtcArtwork'
import type { Track } from '@/types/music'

function track(overrides: Partial<Track> = {}): Track {
  return {
    key: 'k',
    pluginKey: 'plugin-a',
    ref: { pluginId: 'plugin-a', providerId: 'netease', kind: 'track', id: '1', scope: 'provider' },
    title: 'song',
    artists: ['a'],
    qualities: [],
    playable: true,
    raw: { metadata: { artworkUrl: 'https://cdn.example/cover.jpg' } },
    artworkUrl: 'https://cdn.example/cover.jpg',
    source: 'plugin',
    ...overrides
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('smtc hires cover source url', () => {
  it('prefers the upstream http artwork url', () => {
    expect(hiresSourceArtworkUrl(track())).toBe('https://cdn.example/cover.jpg')
  })

  it('rejects local cache and blob addresses', () => {
    const local = track({
      artworkUrl: 'blob:app/abc',
      raw: { metadata: { artworkUrl: 'file:///data/cover.jpg' } }
    })
    expect(hiresSourceArtworkUrl(local)).toBeUndefined()
  })

  it('ignores missing tracks', () => {
    expect(hiresSourceArtworkUrl(null)).toBeUndefined()
  })
})

describe('smtc hires cover eligibility', () => {
  it('accepts online plugin tracks with a provider', () => {
    expect(supportsHiresCover(track())).toBe(true)
  })

  it('rejects local files and downloads', () => {
    expect(supportsHiresCover(track({ localUri: 'file:///song.flac' }))).toBe(false)
    expect(supportsHiresCover(track({ downloadedPath: '/data/song.flac' }))).toBe(false)
  })

  it('rejects tracks without a source provider', () => {
    expect(supportsHiresCover(track({ ref: { providerId: '' } as Track['ref'] }))).toBe(false)
    expect(supportsHiresCover(null)).toBe(false)
  })
})

describe('smtc hires cover resolution', () => {
  it('returns the plugin url and sends the upstream artwork and target size', async () => {
    const invokeProvider = vi.fn().mockResolvedValue('https://cdn.example/hires.jpg')
    await expect(resolveHiresCover(track(), true, { invokeProvider })).resolves.toBe(
      'https://cdn.example/hires.jpg'
    )
    expect(invokeProvider).toHaveBeenCalledWith('netease', 'tracks.artworkHires', [
      expect.objectContaining({ providerId: 'netease' }),
      {
        song: expect.objectContaining({ metadata: expect.anything() }),
        artworkUrl: 'https://cdn.example/cover.jpg',
        targetSize: SMTC_HIRES_TARGET_SIZE
      }
    ])
  })

  it('does not call the plugin when the switch is off or the track is local', async () => {
    const invokeProvider = vi.fn().mockResolvedValue('https://cdn.example/hires.jpg')
    await expect(resolveHiresCover(track(), false, { invokeProvider })).resolves.toBeUndefined()
    await expect(
      resolveHiresCover(track({ localUri: 'file:///a.flac' }), true, { invokeProvider })
    ).resolves.toBeUndefined()
    expect(invokeProvider).not.toHaveBeenCalled()
  })

  it('falls back when the plugin is missing, returns junk or throws', async () => {
    await expect(
      resolveHiresCover(track(), true, { invokeProvider: vi.fn().mockResolvedValue('') })
    ).resolves.toBeUndefined()
    await expect(
      resolveHiresCover(track(), true, { invokeProvider: vi.fn().mockResolvedValue(42) })
    ).resolves.toBeUndefined()
    await expect(
      resolveHiresCover(track(), true, {
        invokeProvider: vi.fn().mockRejectedValue(new Error('not implemented'))
      })
    ).resolves.toBeUndefined()
  })

  it('gives up after the timeout instead of blocking metadata', async () => {
    vi.useFakeTimers()
    const pending = resolveHiresCover(track(), true, {
      invokeProvider: () => new Promise(() => undefined)
    })
    await vi.advanceTimersByTimeAsync(SMTC_HIRES_TIMEOUT_MS)
    await expect(pending).resolves.toBeUndefined()
  })
})
