import { describe, expect, it } from 'vitest'
import { planBulkAppend } from './bulkQueueAppend'
import type { Track } from '@/types/music'

function track(key: string): Track {
  return {
    key,
    ref: { providerId: 'wy', kind: 'track', id: key } as Track['ref'],
    title: key,
    artists: [],
    qualities: [],
    playable: true,
    raw: {}
  }
}

describe('bulk queue append', () => {
  it('appends everything when the queue does not already hold the tracks', () => {
    const plan = planBulkAppend([], [track('a'), track('b')])
    expect(plan.toAdd.map((item) => item.key)).toEqual(['a', 'b'])
    expect(plan.skipped).toBe(0)
  })

  it('skips tracks already in the queue, like the desktop addToPlaylistEnd', () => {
    // 桌面版遇到已在列表里的歌只提示「歌曲已在播放列表中」，不会加第二份。
    const plan = planBulkAppend(['a'], [track('a'), track('b')])
    expect(plan.toAdd.map((item) => item.key)).toEqual(['b'])
    expect(plan.skipped).toBe(1)
  })

  it('deduplicates repeats inside the same batch', () => {
    // 多选来自不同分段时同一首可能出现两次；不加这层就会在队尾排两份。
    const plan = planBulkAppend([], [track('a'), track('a'), track('b')])
    expect(plan.toAdd.map((item) => item.key)).toEqual(['a', 'b'])
    expect(plan.skipped).toBe(1)
  })

  it('drops entries without a key instead of pushing unusable rows', () => {
    const plan = planBulkAppend([], [{ ...track('x'), key: '' } as Track, track('y')])
    expect(plan.toAdd.map((item) => item.key)).toEqual(['y'])
    expect(plan.skipped).toBe(1)
  })

  it('reports an empty plan when everything is already queued', () => {
    const plan = planBulkAppend(['a', 'b'], [track('a'), track('b')])
    expect(plan.toAdd).toEqual([])
    expect(plan.skipped).toBe(2)
  })
})
