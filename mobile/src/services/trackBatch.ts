import { computed, ref } from 'vue'
import type { Track } from '@/types/music'

export interface TrackBatchSelectionOptions {
  /** Tracks visible in the current list; select-all follows search and sort state. */
  source: () => Track[]
  /** Resolution order for selected tracks; defaults to the visible list. */
  order?: () => Track[]
}

/**
 * Selection state shared by list views that support batch operations
 * (playlist detail and the library segments).
 */
export function useTrackBatchSelection(options: TrackBatchSelectionOptions) {
  const active = ref(false)
  const selectedKeys = ref<Set<string>>(new Set())

  const allTracks = computed(() => options.order?.() ?? options.source())
  const selectedTracks = computed(() =>
    allTracks.value.filter((track) => selectedKeys.value.has(track.key))
  )
  const selectedCount = computed(() => selectedKeys.value.size)
  const allSelected = computed(
    () => options.source().length > 0 && selectedKeys.value.size >= options.source().length
  )

  function isSelected(track: Track): boolean {
    return selectedKeys.value.has(track.key)
  }

  function toggleSelect(track: Track): void {
    const next = new Set(selectedKeys.value)
    if (next.has(track.key)) {
      next.delete(track.key)
    } else {
      next.add(track.key)
    }
    selectedKeys.value = next
  }

  function toggleSelectAll(): void {
    selectedKeys.value = allSelected.value
      ? new Set()
      : new Set(options.source().map((track) => track.key))
  }

  function enter(): void {
    if (!allTracks.value.length) return
    active.value = true
    selectedKeys.value = new Set()
  }

  function exit(): void {
    active.value = false
    selectedKeys.value = new Set()
  }

  return {
    active,
    selectedKeys,
    selectedTracks,
    selectedCount,
    allSelected,
    isSelected,
    toggleSelect,
    toggleSelectAll,
    enter,
    exit
  }
}

export type TrackBatchSelection = ReturnType<typeof useTrackBatchSelection>
