import { describe, expect, it } from 'vitest'
import { targetPositionAt } from './listenTogether'

describe('listen together position sync', () => {
  it('advances by elapsed server time while playing', () => {
    expect(targetPositionAt({ isPlaying: true, anchorAt: 1000, anchorPos: 10 }, 4000)).toBe(13)
  })

  it('does not advance while paused', () => {
    expect(targetPositionAt({ isPlaying: false, anchorAt: 1000, anchorPos: 10 }, 90000)).toBe(10)
  })

  it('never runs backwards when the anchor is in the future', () => {
    expect(targetPositionAt({ isPlaying: true, anchorAt: 10000, anchorPos: 5 }, 9000)).toBe(5)
  })

  it('clamps negative anchors to zero', () => {
    expect(targetPositionAt({ isPlaying: false, anchorPos: -30 }, 1)).toBe(0)
    expect(targetPositionAt({ isPlaying: true, anchorPos: -30, anchorAt: 0 }, 0)).toBe(0)
  })

  it('treats string anchors from the socket payload as numbers', () => {
    const snapshot = { isPlaying: true, anchorAt: '1000' as unknown as number, anchorPos: '2.5' as unknown as number }
    expect(targetPositionAt(snapshot, 3500)).toBe(5)
  })

  it('falls back to zero when the snapshot lacks anchors', () => {
    expect(targetPositionAt({ isPlaying: false }, 1000)).toBe(0)
    expect(targetPositionAt({ isPlaying: true, anchorAt: 1000 }, 2000)).toBe(1)
  })

  it('ignores non-numeric junk instead of producing NaN', () => {
    const snapshot = { isPlaying: true, anchorAt: 'abc' as unknown as number, anchorPos: 'x' as unknown as number }
    const value = targetPositionAt(snapshot, 5000)
    expect(Number.isNaN(value)).toBe(false)
    expect(value).toBeGreaterThanOrEqual(0)
  })
})
