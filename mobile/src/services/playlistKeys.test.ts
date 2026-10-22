import { describe, expect, it } from 'vitest'
import { playlistKeyCandidates, playlistKeyMatches } from './playlistKeys'

describe('playlist key candidates', () => {
  it('matches a public provider-scoped track', () => {
    expect(playlistKeyCandidates({ providerId: 'wy', id: '42' })).toEqual(['wy:42'])
  })

  it('also matches the private three-segment form', () => {
    // 私有资源的 key 是 pluginId:providerId:id；只拼两段会导致删不掉。
    expect(playlistKeyCandidates({ pluginId: 'com.x', providerId: 'wy', id: '42' })).toEqual([
      'wy:42',
      'com.x:wy:42'
    ])
  })

  it('includes an explicit key when the entity carries one', () => {
    expect(playlistKeyCandidates({ providerId: 'wy', id: '42' }, 'custom:key')).toEqual([
      'wy:42',
      'custom:key'
    ])
  })

  it('deduplicates and ignores junk', () => {
    expect(playlistKeyCandidates({ providerId: 'wy', id: '42' }, '  wy:42  ')).toEqual(['wy:42'])
    expect(playlistKeyCandidates({ providerId: '', id: '42' })).toEqual([])
    expect(playlistKeyCandidates({ id: 42 })).toEqual([])
    expect(playlistKeyCandidates(null)).toEqual([])
    expect(playlistKeyCandidates(undefined, '  ')).toEqual([])
  })

  it('answers membership without allocating per call', () => {
    const ref = { pluginId: 'com.x', providerId: 'wy', id: '42' }
    expect(playlistKeyMatches('com.x:wy:42', ref)).toBe(true)
    expect(playlistKeyMatches('wy:42', ref)).toBe(true)
    expect(playlistKeyMatches('wy:43', ref)).toBe(false)
  })
})
