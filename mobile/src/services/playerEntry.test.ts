import { describe, expect, it } from 'vitest'
import { planPlayerEntry } from './playerEntry'

const prefs = { showLyricsInPlayer: true, autoPlayOnOpen: true }

describe('planPlayerEntry', () => {
  it('expands lyrics according to the preference', () => {
    expect(
      planPlayerEntry({ ...prefs, showLyricsInPlayer: true }, { hasTrack: true, status: 'idle' })
        .expandLyrics
    ).toBe(true)
    expect(
      planPlayerEntry({ ...prefs, showLyricsInPlayer: false }, { hasTrack: true, status: 'idle' })
        .expandLyrics
    ).toBe(false)
  })

  it('autoplays only when a paused track exists', () => {
    expect(planPlayerEntry(prefs, { hasTrack: true, status: 'paused' }).autoPlay).toBe(true)
    expect(planPlayerEntry(prefs, { hasTrack: false, status: 'paused' }).autoPlay).toBe(false)
    expect(planPlayerEntry(prefs, { hasTrack: true, status: 'playing' }).autoPlay).toBe(false)
    expect(planPlayerEntry(prefs, { hasTrack: true, status: 'loading' }).autoPlay).toBe(false)
    expect(planPlayerEntry(prefs, { hasTrack: true, status: 'ended' }).autoPlay).toBe(false)
    expect(planPlayerEntry(prefs, { hasTrack: true, status: 'error' }).autoPlay).toBe(false)
  })

  it('never autoplays when the preference is off', () => {
    expect(
      planPlayerEntry({ ...prefs, autoPlayOnOpen: false }, { hasTrack: true, status: 'paused' })
        .autoPlay
    ).toBe(false)
  })

  it('keeps lyrics independent from autoplay', () => {
    const plan = planPlayerEntry(
      { showLyricsInPlayer: true, autoPlayOnOpen: false },
      { hasTrack: true, status: 'paused' }
    )
    expect(plan).toEqual({ expandLyrics: true, autoPlay: false })
  })
})