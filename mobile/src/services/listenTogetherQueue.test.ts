import { describe, expect, it } from 'vitest'
import {
  formatQueueAddedAt,
  queueMoveTarget,
  queueRemoveHint,
  queueRequesterLabel,
  queueRequesterName
} from './listenTogetherQueue'
import type { QueueItem } from './listenTogetherApi'

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    itemId: 'q1',
    song: { songmid: '1', source: 'wy' },
    requesterId: 'u2',
    requesterName: '小林',
    addedAt: 0,
    ...overrides
  } as QueueItem
}

describe('room queue requester', () => {
  it('prefers requesterName and falls back to the addedBy profile', () => {
    expect(queueRequesterName(item())).toBe('小林')
    expect(
      queueRequesterName(item({ requesterName: undefined, addedBy: { userId: 'u3', nickname: '阿初' } }))
    ).toBe('阿初')
  })

  it('never leaves the line blank for anonymous entries', () => {
    expect(queueRequesterLabel(item({ requesterName: '' }))).toBe('由成员添加')
    expect(queueRequesterLabel(item())).toBe('由 小林 添加')
  })
})

describe('room queue added time', () => {
  it('formats a valid timestamp as a clock time', () => {
    const ts = new Date(2026, 9, 30, 21, 5).getTime()
    expect(formatQueueAddedAt(ts)).toMatch(/\d{2}:\d{2}/)
  })

  it('hides unusable timestamps instead of printing Invalid Date', () => {
    expect(formatQueueAddedAt(undefined)).toBe('')
    expect(formatQueueAddedAt(0)).toBe('')
    expect(formatQueueAddedAt('not a number')).toBe('')
  })
})

describe('room queue move', () => {
  it('returns the adjacent index inside the list', () => {
    expect(queueMoveTarget(1, -1, 4)).toBe(0)
    expect(queueMoveTarget(1, 1, 4)).toBe(2)
  })

  it('refuses moves past either end', () => {
    expect(queueMoveTarget(0, -1, 4)).toBeNull()
    expect(queueMoveTarget(3, 1, 4)).toBeNull()
  })

  it('refuses an index outside the list', () => {
    expect(queueMoveTarget(-1, 1, 4)).toBeNull()
    expect(queueMoveTarget(9, -1, 4)).toBeNull()
  })
})

describe('room queue remove hint', () => {
  it('separates managing the shared list from cancelling your own request', () => {
    expect(queueRemoveHint(true)).toBe('从共享列表移除')
    expect(queueRemoveHint(false)).toBe('取消我的点歌')
  })
})
