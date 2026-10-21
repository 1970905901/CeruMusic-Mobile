import { describe, expect, it } from 'vitest'
import {
  buildDanmaku,
  danmakuTopPercent,
  isDanmakuCandidate,
  pickDanmakuTrack,
  DANMAKU_TRACK_COUNT,
  DANMAKU_TRACK_COOLDOWN_MS,
  DANMAKU_TEXT_LIMIT
} from './ltDanmaku'
import type { ChatMsg } from './listenTogetherApi'

function chat(overrides: Partial<ChatMsg> = {}): ChatMsg {
  return {
    id: 'm1',
    type: 'text',
    content: '好听',
    from: { userId: 'u1', nickname: '小林' },
    ts: 1,
    ...overrides
  } as ChatMsg
}

describe('pickDanmakuTrack', () => {
  it('picks among the earliest tracks and pushes their lastUsed forward', () => {
    const lastUsed = new Array(DANMAKU_TRACK_COUNT).fill(0)
    lastUsed[3] = 10
    const { track, lastUsed: next } = pickDanmakuTrack(lastUsed, 1000, () => 0)
    expect(track).toBe(0)
    // A stale track only needs to be marked as used at `now`; the cooldown is
    // added on the next pick (desktop uses max(now, lastUsed + cooldown)).
    expect(next[0]).toBe(1000)
    // The untouched track keeps its timestamp; the input array is not mutated.
    expect(next[3]).toBe(10)
    expect(lastUsed[0]).toBe(0)

    // A track still inside its cooldown is pushed to lastUsed + cooldown.
    const cooling = new Array(DANMAKU_TRACK_COUNT).fill(5000)
    expect(pickDanmakuTrack(cooling, 1000, () => 0).lastUsed[0]).toBe(
      5000 + DANMAKU_TRACK_COOLDOWN_MS
    )
  })

  it('handles a cooling track and an empty schedule', () => {
    const lastUsed = new Array(DANMAKU_TRACK_COUNT).fill(5000)
    const { track, lastUsed: next } = pickDanmakuTrack(lastUsed, 100, () => 0.99)
    // 0.99 lands on the 5th earliest track (top-K of 5).
    expect(track).toBe(4)
    expect(next[4]).toBe(5000 + DANMAKU_TRACK_COOLDOWN_MS)
    expect(pickDanmakuTrack([], 0)).toEqual({ track: 0, lastUsed: [] })
  })
})

describe('isDanmakuCandidate', () => {
  it('accepts text and emoji only', () => {
    expect(isDanmakuCandidate(chat())).toBe(true)
    expect(isDanmakuCandidate(chat({ type: 'emoji' }))).toBe(true)
    expect(isDanmakuCandidate(chat({ type: 'sticker', content: 'sticker-1' }))).toBe(false)
    expect(isDanmakuCandidate(chat({ type: 'system' }))).toBe(false)
    expect(isDanmakuCandidate(chat({ content: '   ' }))).toBe(false)
    expect(isDanmakuCandidate(null)).toBe(false)
  })
})

describe('buildDanmaku', () => {
  it('builds a span with nickname, avatar and self flag', () => {
    const span = buildDanmaku(chat({ from: { userId: 'me', nickname: '我', avatar: 'a.png' } }), 2, {
      myUserId: 'me',
      speed: 1,
      fontScale: 1,
      random: () => 0
    })
    expect(span).toMatchObject({
      id: 'm1',
      text: '好听',
      avatar: 'a.png',
      nickname: '我',
      isSelf: true,
      track: 2,
      duration: 6500,
      fontSize: 12
    })
  })

  it('applies speed and font scale and clamps their range', () => {
    const fast = buildDanmaku(chat(), 0, { myUserId: 'x', speed: 2, fontScale: 1.5, random: () => 0 })
    expect(fast?.duration).toBe(3250)
    expect(fast?.fontSize).toBe(18)

    const clamped = buildDanmaku(chat(), 0, { myUserId: 'x', speed: 0, fontScale: 99, random: () => 0 })
    expect(clamped?.duration).toBe(Math.round(6500 / 0.2))
    expect(clamped?.fontSize).toBe(Math.round(12 * 3))
  })

  it('truncates long text and rejects non-danmaku messages', () => {
    const span = buildDanmaku(chat({ content: 'x'.repeat(200) }), 0, {
      myUserId: 'x',
      speed: 1,
      fontScale: 1
    })
    expect(span?.text).toHaveLength(DANMAKU_TEXT_LIMIT)
    expect(buildDanmaku(chat({ type: 'system' }), 0, { myUserId: 'x', speed: 1, fontScale: 1 })).toBeNull()
  })

  it('keeps the track inside the layer bounds', () => {
    expect(buildDanmaku(chat(), 99, { myUserId: 'x', speed: 1, fontScale: 1 })?.track).toBe(
      DANMAKU_TRACK_COUNT - 1
    )
    expect(buildDanmaku(chat(), -3, { myUserId: 'x', speed: 1, fontScale: 1 })?.track).toBe(0)
  })
})

describe('danmakuTopPercent', () => {
  it('distributes tracks evenly and clamps out-of-range input', () => {
    expect(danmakuTopPercent(0)).toBe(0)
    expect(danmakuTopPercent(4)).toBe(50)
    expect(danmakuTopPercent(-1)).toBe(0)
    expect(danmakuTopPercent(99)).toBe(((DANMAKU_TRACK_COUNT - 1) / DANMAKU_TRACK_COUNT) * 100)
  })
})
