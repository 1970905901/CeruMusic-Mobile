import { describe, expect, it } from 'vitest'
import { subtractUnread } from './notifications'
import type { UnreadCounts } from '@/services/notificationsApi'

const base: UnreadCounts = { all: 9, notice: 3, interaction: 4, comment: 2 }

describe('unread count subtraction', () => {
  it('deducts total and per-category counts', () => {
    expect(subtractUnread(base, ['notice', 'comment'])).toEqual({
      all: 7,
      notice: 2,
      interaction: 4,
      comment: 1
    })
  })

  it('never produces negative badges when the counter lags behind', () => {
    const stale: UnreadCounts = { all: 1, notice: 0, interaction: 0, comment: 0 }
    expect(subtractUnread(stale, ['notice', 'comment', 'interaction'])).toEqual({
      all: 0,
      notice: 0,
      interaction: 0,
      comment: 0
    })
  })

  it('returns the same counts when nothing was read', () => {
    expect(subtractUnread(base, [])).toEqual(base)
  })

  it('treats non-finite stored counters as zero', () => {
    const broken = { all: Number.NaN, notice: undefined as unknown as number, interaction: 5, comment: 0 }
    expect(subtractUnread(broken, ['interaction'])).toEqual({
      all: 0,
      notice: 0,
      interaction: 4,
      comment: 0
    })
  })
})
