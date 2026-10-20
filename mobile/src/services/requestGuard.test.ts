import { describe, expect, it } from 'vitest'
import { createRequestGuard } from './requestGuard'

describe('request guard', () => {
  it('accepts only the newest token from beginLatest', () => {
    const guard = createRequestGuard()
    const first = guard.beginLatest('song-a')
    const second = guard.beginLatest('song-a')
    expect(guard.isCurrent(second, 'song-a')).toBe(true)
    expect(guard.isCurrent(first, 'song-a')).toBe(false)
  })

  it('keeps concurrent capture tokens valid until invalidated', () => {
    const guard = createRequestGuard()
    const hot = guard.capture('song-a')
    const latest = guard.capture('song-a')
    expect(guard.isCurrent(hot, 'song-a')).toBe(true)
    expect(guard.isCurrent(latest, 'song-a')).toBe(true)
    guard.invalidate()
    expect(guard.isCurrent(hot, 'song-a')).toBe(false)
    expect(guard.isCurrent(latest, 'song-a')).toBe(false)
  })

  it('treats a changed identity as stale', () => {
    const guard = createRequestGuard()
    const token = guard.capture('song-a')
    expect(guard.isCurrent(token, 'song-a')).toBe(true)
    expect(guard.isCurrent(token, 'song-b')).toBe(false)
  })

  it('invalidates every token after dispose and stays disposed', () => {
    const guard = createRequestGuard()
    const token = guard.beginLatest('song-a')
    expect(guard.disposed).toBe(false)
    guard.dispose()
    expect(guard.disposed).toBe(true)
    expect(guard.isCurrent(token, 'song-a')).toBe(false)
    expect(guard.isCurrent(guard.beginLatest('song-a'), 'song-a')).toBe(false)
  })

  it('rejects missing tokens', () => {
    const guard = createRequestGuard()
    expect(guard.isCurrent(null, 'song-a')).toBe(false)
    expect(guard.isCurrent(undefined, 'song-a')).toBe(false)
  })

  it('keeps older capture tokens valid when a newer beginLatest starts', () => {
    const guard = createRequestGuard()
    const paging = guard.capture('search-a')
    guard.beginLatest('search-b')
    expect(guard.isCurrent(paging, 'search-a')).toBe(false)
  })

  it('separates identities that share an epoch', () => {
    const guard = createRequestGuard()
    const tracks = guard.capture('source|tracks|query')
    const playlists = guard.capture('source|playlists|query')
    expect(guard.isCurrent(tracks, 'source|tracks|query')).toBe(true)
    expect(guard.isCurrent(playlists, 'source|playlists|query')).toBe(true)
    expect(guard.isCurrent(tracks, 'source|playlists|query')).toBe(false)
  })

  it('treats an empty identity as a valid default', () => {
    const guard = createRequestGuard()
    const token = guard.capture()
    expect(token.identity).toBe('')
    expect(guard.isCurrent(token, '')).toBe(true)
    expect(guard.isCurrent(token, 'song-a')).toBe(false)
  })
})
