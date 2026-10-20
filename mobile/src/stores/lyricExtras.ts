import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  clampOffset,
  enforceOffsetCap,
  normalizeOffsetMap,
  type OffsetEntry,
  type OffsetMapRaw
} from '@/services/lyricExtras'

const STORAGE_KEY = 'ceru-mobile-lyric-extras-v1'

function load(): Record<string, OffsetEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as OffsetMapRaw
    return enforceOffsetCap(normalizeOffsetMap(parsed))
  } catch {
    return {}
  }
}

export const useLyricExtrasStore = defineStore('lyricExtras', () => {
  const offsetMap = ref<Record<string, OffsetEntry>>(load())

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(offsetMap.value))
    } catch {
      // ignore localStorage quota or serialization issues
    }
  }

  watch(offsetMap, persist, { deep: true })

  function getOffset(trackKey: string | null | undefined): number {
    if (!trackKey) return 0
    const entry = offsetMap.value[trackKey]
    if (!entry) return 0
    return entry.value || 0
  }

  function setOffset(trackKey: string | null | undefined, ms: number): void {
    if (!trackKey) return
    const clamped = clampOffset(ms)
    const next = { ...offsetMap.value }
    if (clamped === 0) {
      delete next[trackKey]
    } else {
      next[trackKey] = { value: clamped, updatedAt: Date.now() }
    }
    offsetMap.value = enforceOffsetCap(normalizeOffsetMap(next))
  }

  function bumpOffset(trackKey: string | null | undefined, deltaMs: number): void {
    if (!trackKey) return
    const current = getOffset(trackKey)
    setOffset(trackKey, current + deltaMs)
  }

  function resetOffset(trackKey: string | null | undefined): void {
    if (!trackKey) return
    setOffset(trackKey, 0)
  }

  function pruneOffsets(): number {
    const before = Object.keys(offsetMap.value).length
    const normalized = normalizeOffsetMap(offsetMap.value)
    const capped = enforceOffsetCap(normalized)
    offsetMap.value = capped
    return before - Object.keys(capped).length
  }

  function clearAllOffsets(): void {
    offsetMap.value = {}
  }

  const adjustedCount = computed(() => Object.keys(offsetMap.value).length)

  return {
    offsetMap,
    getOffset,
    setOffset,
    bumpOffset,
    resetOffset,
    pruneOffsets,
    clearAllOffsets,
    adjustedCount
  }
})