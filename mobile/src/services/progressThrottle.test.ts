import { describe, expect, it } from 'vitest'
import { createProgressThrottle, PROGRESS_PERSIST_INTERVAL_MS } from './progressThrottle'

describe('download progress throttle', () => {
  it('writes the first progress update immediately', () => {
    const throttle = createProgressThrottle(800)
    expect(throttle.shouldWrite('a', false, 1000)).toBe(true)
  })

  it('drops progress updates inside the interval', () => {
    const throttle = createProgressThrottle(800)
    throttle.shouldWrite('a', false, 1000)
    expect(throttle.shouldWrite('a', false, 1100)).toBe(false)
    expect(throttle.shouldWrite('a', false, 1799)).toBe(false)
    expect(throttle.shouldWrite('a', false, 1800)).toBe(true)
  })

  it('always writes a status change, even mid-interval', () => {
    // 完成/取消不能等：应用被杀后任务若还停在 running，重开就会重复下载。
    const throttle = createProgressThrottle(800)
    throttle.shouldWrite('a', false, 1000)
    expect(throttle.shouldWrite('a', true, 1050)).toBe(true)
  })

  it('restarts the interval after a status change', () => {
    const throttle = createProgressThrottle(800)
    throttle.shouldWrite('a', true, 1000)
    expect(throttle.shouldWrite('a', false, 1500)).toBe(false)
    expect(throttle.shouldWrite('a', false, 1800)).toBe(true)
  })

  it('tracks each task independently', () => {
    const throttle = createProgressThrottle(800)
    throttle.shouldWrite('a', false, 1000)
    expect(throttle.shouldWrite('b', false, 1010)).toBe(true)
  })

  it('never blocks when the interval is zero or invalid', () => {
    for (const interval of [0, -5, Number.NaN]) {
      const throttle = createProgressThrottle(interval)
      expect(throttle.shouldWrite('a', false, 1000)).toBe(true)
      expect(throttle.shouldWrite('a', false, 1000)).toBe(true)
    }
  })

  it('exposes a sensible default interval', () => {
    // 秒级足够：进度条不需要更细，插件也按秒级刷新。
    expect(PROGRESS_PERSIST_INTERVAL_MS).toBeGreaterThanOrEqual(500)
    expect(PROGRESS_PERSIST_INTERVAL_MS).toBeLessThanOrEqual(2000)
  })
})
