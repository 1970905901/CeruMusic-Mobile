import { describe, expect, it } from 'vitest'
import {
  MAX_PENDING_AVATARS,
  formatPendingTime,
  pendingAvatarOverflow,
  pendingRequesterLabel,
  pendingRequesterTitle,
  pendingRequesters,
  visiblePendingAvatars
} from './listenTogetherPending'
import type { PendingItem } from './listenTogetherApi'

function item(overrides: Partial<PendingItem> = {}): PendingItem {
  return {
    reqId: 'r1',
    song: { songmid: '1', source: 'wy' },
    requesterId: 'u2',
    requesterName: '小林',
    requestedAt: 0,
    ...overrides
  } as PendingItem
}

describe('pending requesters', () => {
  it('falls back to the single legacy requester when requesters are absent', () => {
    // 旧服务端不并发下 requesters；没有回落就等于「无申请人」，提示全空。
    expect(pendingRequesters(item())).toEqual([{ userId: 'u2', nickname: '小林' }])
    expect(pendingRequesters(item({ requesters: [] }))).toEqual([{ userId: 'u2', nickname: '小林' }])
  })

  it('uses the full requester list when the server sends one', () => {
    const merged = item({
      requesters: [
        { userId: 'u2', nickname: '小林' },
        { userId: 'u3', nickname: '阿初' }
      ]
    })
    expect(pendingRequesters(merged)).toHaveLength(2)
    expect(pendingRequesterTitle(merged)).toBe('小林、阿初')
  })

  it('labels a single request with the nickname and a merged one with the count', () => {
    // 多人申请时显示第一个人的名字，会让管理员以为只有他在等。
    expect(pendingRequesterLabel(item())).toBe('小林')
    expect(
      pendingRequesterLabel(
        item({
          requesters: [
            { userId: 'u2', nickname: '小林' },
            { userId: 'u3', nickname: '阿初' }
          ]
        })
      )
    ).toBe('2 人申请')
  })

  it('never prints a blank label for anonymous requesters', () => {
    expect(pendingRequesterLabel(item({ requesterName: '' }))).toBe('某人')
  })

  it('caps the avatar stack and reports the overflow', () => {
    const many = item({
      requesters: Array.from({ length: MAX_PENDING_AVATARS + 2 }, (_, index) => ({
        userId: `u${index}`,
        nickname: `人${index}`
      }))
    })
    expect(visiblePendingAvatars(many)).toHaveLength(MAX_PENDING_AVATARS)
    expect(pendingAvatarOverflow(many)).toBe(2)
    expect(pendingAvatarOverflow(item())).toBe(0)
  })
})

describe('pending request time', () => {
  const now = new Date(2026, 9, 30, 14, 5, 0).getTime()

  it('counts up from just now to minutes', () => {
    expect(formatPendingTime(now - 5_000, now)).toBe('刚刚')
    expect(formatPendingTime(now - 90_000, now)).toBe('1 分钟前')
  })

  it('switches to a clock time after an hour', () => {
    const result = formatPendingTime(now - 3 * 3_600_000, now)
    expect(result).toMatch(/\d{2}:\d{2}/)
  })

  it('hides the time when the timestamp is unusable', () => {
    // 脏时间不该渲染成 Invalid Date，也不该把这一行拆散。
    expect(formatPendingTime(Number.NaN, now)).toBe('')
  })
})
