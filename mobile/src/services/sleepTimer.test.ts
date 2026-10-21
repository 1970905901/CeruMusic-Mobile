import { describe, expect, it } from 'vitest'
import { displayMinutes, planSleepTimer, resumeSleepTimer } from './sleepTimer'

const NOW = 1_700_000_000_000

describe('setting a sleep timer', () => {
  it('turns minutes into an absolute deadline', () => {
    const plan = planSleepTimer(15, NOW)
    expect(plan.deadline).toBe(NOW + 15 * 60_000)
    expect(plan.remainingMs).toBe(15 * 60_000)
    expect(plan.expired).toBe(false)
  })

  it('treats zero, negative and junk as "off"', () => {
    for (const value of [0, -5, null, undefined, Number.NaN]) {
      expect(planSleepTimer(value, NOW).deadline).toBe(0)
    }
  })
})

describe('resuming a sleep timer after a relaunch', () => {
  it('keeps waiting when the deadline is still in the future', () => {
    // 15 分钟的定时在 5 分钟后重启，应该只剩 10 分钟，而不是重新计时 15 分钟。
    const result = resumeSleepTimer(NOW + 10 * 60_000, NOW)
    expect(result.active).toBe(true)
    expect(result.remainingMs).toBe(10 * 60_000)
  })

  it('reports an expired timer instead of silently restarting it', () => {
    const result = resumeSleepTimer(NOW - 1, NOW)
    expect(result.active).toBe(false)
    expect(result.expired).toBe(true)
  })

  it('ignores a missing or malformed deadline', () => {
    for (const value of [null, undefined, '', 'abc', 0, -1]) {
      const result = resumeSleepTimer(value, NOW)
      expect(result.active).toBe(false)
      expect(result.expired).toBe(false)
    }
  })
})

describe('countdown display', () => {
  it('rounds up so the timer never shows 0 while still running', () => {
    expect(displayMinutes(1)).toBe(1)
    expect(displayMinutes(60_000)).toBe(1)
    expect(displayMinutes(60_001)).toBe(2)
  })

  it('shows nothing once finished', () => {
    expect(displayMinutes(0)).toBe(0)
    expect(displayMinutes(-500)).toBe(0)
  })
})
