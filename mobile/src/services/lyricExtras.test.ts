import { describe, expect, it } from 'vitest'
import {
  clampOffset,
  enforceOffsetCap,
  MAX_OFFSET_ENTRIES,
  normalizeOffsetMap,
  OFFSET_TTL_MS
} from './lyricExtras'

describe('lyricExtras service', () => {
  it('clamps offsets within [-10000, 10000]', () => {
    expect(clampOffset(500)).toBe(500)
    expect(clampOffset(15000)).toBe(10000)
    expect(clampOffset(-20000)).toBe(-10000)
    expect(clampOffset(NaN)).toBe(0)
  })

  it('normalizes legacy number format and ignores zero or expired entries', () => {
    const now = 1_700_000_000_000
    const raw = {
      song1: 500, // legacy format
      song2: 0, // zero should be dropped
      song3: { value: -1200, updatedAt: now - 1000 }, // valid entry
      song4: { value: 300, updatedAt: now - OFFSET_TTL_MS - 5000 } // expired entry
    }

    const normalized = normalizeOffsetMap(raw as any, now)
    expect(normalized.song1).toEqual({ value: 500, updatedAt: now })
    expect(normalized.song2).toBeUndefined()
    expect(normalized.song3).toEqual({ value: -1200, updatedAt: now - 1000 })
    expect(normalized.song4).toBeUndefined()
  })

  it('enforces entry cap keeping most recently updated entries', () => {
    const map: Record<string, { value: number; updatedAt: number }> = {}
    for (let i = 0; i < MAX_OFFSET_ENTRIES + 10; i++) {
      map[`song_${i}`] = { value: 100 + i, updatedAt: 1000 + i }
    }

    const capped = enforceOffsetCap(map)
    expect(Object.keys(capped).length).toBe(MAX_OFFSET_ENTRIES)
    // The oldest 10 entries (song_0 to song_9) should have been pruned
    expect(capped.song_0).toBeUndefined()
    expect(capped.song_9).toBeUndefined()
    expect(capped[`song_${MAX_OFFSET_ENTRIES + 9}`]).toBeDefined()
  })
})