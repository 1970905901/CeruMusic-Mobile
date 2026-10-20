import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useTrackBatchSelection } from '@/services/trackBatch'
import type { Track } from '@/types/music'

function makeTrack(id: string): Track {
  return {
    key: `test:${id}`,
    ref: { id, kind: 'song', providerId: 'test' },
    title: `Song ${id}`,
    artists: ['Artist'],
    qualities: [],
    playable: true,
    raw: {}
  }
}

describe('track batch selection', () => {
  it('selects, deselects, and clears individual tracks', () => {
    const tracks = [makeTrack('1'), makeTrack('2'), makeTrack('3')]
    const selection = useTrackBatchSelection({ source: () => tracks })

    selection.enter()
    expect(selection.active.value).toBe(true)
    expect(selection.selectedCount.value).toBe(0)

    selection.toggleSelect(tracks[0])
    selection.toggleSelect(tracks[2])
    expect(selection.selectedCount.value).toBe(2)
    expect(selection.isSelected(tracks[1])).toBe(false)
    expect(selection.selectedTracks.value.map((t) => t.key)).toEqual(['test:1', 'test:3'])

    selection.toggleSelect(tracks[2])
    expect(selection.selectedCount.value).toBe(1)
    expect(selection.isSelected(tracks[2])).toBe(false)
  })

  it('select-all follows the visible source and toggles back off', () => {
    const all = [makeTrack('1'), makeTrack('2')]
    const visible = ref<Track[]>([all[0]])
    const selection = useTrackBatchSelection({ source: () => visible.value })

    selection.enter()
    expect(selection.allSelected.value).toBe(false)

    selection.toggleSelectAll()
    expect(selection.allSelected.value).toBe(true)
    expect(selection.selectedCount.value).toBe(1)

    selection.toggleSelectAll()
    expect(selection.allSelected.value).toBe(false)
    expect(selection.selectedCount.value).toBe(0)
  })

  it('ignores entered state for an empty source and clears on exit', () => {
    const tracks = ref<Track[]>([])
    const selection = useTrackBatchSelection({ source: () => tracks.value })

    selection.enter()
    expect(selection.active.value).toBe(false)

    tracks.value = [makeTrack('1')]
    selection.enter()
    selection.toggleSelect(tracks.value[0])
    expect(selection.selectedCount.value).toBe(1)

    selection.exit()
    expect(selection.active.value).toBe(false)
    expect(selection.selectedCount.value).toBe(0)
  })

  it('resolves selected tracks in the declared order list', () => {
    const visible = [makeTrack('1'), makeTrack('2')]
    const ordered = [visible[1], visible[0]]
    const selection = useTrackBatchSelection({
      source: () => visible,
      order: () => ordered
    })

    selection.enter()
    selection.toggleSelect(visible[0])
    selection.toggleSelect(visible[1])
    expect(selection.selectedTracks.value.map((t) => t.key)).toEqual(['test:2', 'test:1'])
  })
})