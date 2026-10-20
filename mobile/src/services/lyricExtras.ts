export interface OffsetEntry {
  value: number
  updatedAt: number
}

export type OffsetMapRaw = Record<string, OffsetEntry | number>

export const MAX_OFFSET_ENTRIES = 200
export const OFFSET_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days
export const OFFSET_MIN_MS = -10000
export const OFFSET_MAX_MS = 10000

export function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(OFFSET_MIN_MS, Math.min(OFFSET_MAX_MS, Math.round(value)))
}

export function normalizeOffsetMap(raw: OffsetMapRaw, now: number = Date.now()): Record<string, OffsetEntry> {
  const out: Record<string, OffsetEntry> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue
    const v = raw[k]
    if (v === null || v === undefined) continue
    let entry: OffsetEntry
    if (typeof v === 'number') {
      if (v === 0 || !Number.isFinite(v)) continue
      entry = { value: clampOffset(v), updatedAt: now }
    } else {
      if (!v || typeof v.value !== 'number' || v.value === 0) continue
      if (typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt)) {
        entry = { value: clampOffset(v.value), updatedAt: now }
      } else if (now - v.updatedAt > OFFSET_TTL_MS) {
        continue
      } else {
        entry = { value: clampOffset(v.value), updatedAt: v.updatedAt }
      }
    }
    out[k] = entry
  }
  return out
}

export function enforceOffsetCap(map: Record<string, OffsetEntry>): Record<string, OffsetEntry> {
  const keys = Object.keys(map)
  if (keys.length <= MAX_OFFSET_ENTRIES) return map
  const sorted = keys
    .map((k) => [k, map[k].updatedAt] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_OFFSET_ENTRIES)
  const out: Record<string, OffsetEntry> = {}
  for (const [k] of sorted) {
    out[k] = map[k]
  }
  return out
}