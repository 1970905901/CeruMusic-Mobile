import { describe, expect, it } from "vitest"
import { HISTORY_LIMIT, mergeHistoryEntry, planHistoryCleanup } from "./library"

type Entry = { id: string; track: { key: string } }

const entry = (id: string, key: string): Entry => ({ id, track: { key } })

describe("playback history", () => {
  it("keeps a single newest entry per track", () => {
    const current = [entry("a1", "a"), entry("b1", "b"), entry("a2", "a")]
    const merged = mergeHistoryEntry(current, entry("a3", "a"))
    expect(merged.map((item) => item.id)).toEqual(["a3", "b1"])
  })

  it("trims to the desktop limit of 200", () => {
    expect(HISTORY_LIMIT).toBe(200)
    const current = Array.from({ length: 250 }, (_, i) => entry("id" + i, "k" + i))
    const merged = mergeHistoryEntry(current, entry("new", "new"))
    expect(merged).toHaveLength(200)
    expect(merged[0].id).toBe("new")
  })

  it("never drops everything for a non-positive limit", () => {
    const merged = mergeHistoryEntry([], entry("x", "x"), 0)
    expect(merged.map((item) => item.id)).toEqual(["x"])
  })

  it("plans cleanup of all but the newest duplicate", () => {
    const existing = [entry("1", "a"), entry("2", "a"), entry("3", "b"), entry("4", "a")]
    expect(planHistoryCleanup(existing, "a")).toEqual(["1", "2"])
  })

  it("does not plan cleanup when the track appears once or not at all", () => {
    expect(planHistoryCleanup([entry("1", "a")], "a")).toEqual([])
    expect(planHistoryCleanup([entry("1", "a")], "z")).toEqual([])
  })
})

