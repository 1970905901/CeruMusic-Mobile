import { describe, expect, it, vi } from 'vitest'
import {
  createThrottleRegistry,
  describeThrottle,
  throttleSignalOf
} from './pluginThrottle'

/**
 * 插件限流，对齐桌面 `PluginHost.getMusicUrl` → `onThrottle` → 主进程
 * `setThrottleHandler` → 渲染进程 `globaPlayList` 的三段链路：
 *
 * - 插件解析地址失败且 `error.recovery.mode` 是 `await-user` / `stop-current` /
 *   `retry-later` 时，桌面会**暂停全部下载**、提示「插件请求受限」，
 *   并在这段时间内**不再自动换源**（`_isThrottled` 提前退出候选循环）。
 * - 只有 `recovery.mode` 明确要求停下时才限流；普通失败（`NOT_FOUND`、
 *   没有 `recovery`）不限流，否则一次坏歌就把整个音源停掉。
 * - 带 `retryAfterMs` 的按时间自动恢复，不带的一直持续到用户手动恢复。
 *
 * 移动端此前完全没有这层：插件被平台风控后，移动端仍会一首接一首地重试、
 * 换源、继续下载，把风控时间越拖越长，用户只看到「所有歌都播不了」。
 */

describe('throttleSignalOf', () => {
  it('recognises the three recovery modes desktop treats as throttling', () => {
    for (const mode of ['await-user', 'stop-current', 'retry-later']) {
      expect(
        throttleSignalOf('p1', { code: 'RATE_LIMITED', message: '请求过于频繁', recovery: { mode } })
      ).toMatchObject({ pluginKey: 'p1', reason: '请求过于频繁' })
    }
  })

  it('ignores ordinary failures that do not ask the host to stop', () => {
    // `NOT_FOUND` 只是这一首歌没有，不该停掉整个音源。
    expect(throttleSignalOf('p1', { code: 'NOT_FOUND', message: '歌曲不存在' })).toBeNull()
    expect(
      throttleSignalOf('p1', { code: 'NETWORK_ERROR', message: '网络错误', recovery: { mode: 'default' } })
    ).toBeNull()
  })

  it('carries the plugin-provided retry window when there is one', () => {
    const signal = throttleSignalOf('p1', {
      code: 'RATE_LIMITED',
      message: '稍后再试',
      retryAfterMs: 30_000,
      recovery: { mode: 'retry-later' }
    })
    expect(signal?.durationMs).toBe(30_000)
  })

  it('treats a missing or nonsense retry window as "until the user clears it"', () => {
    // 桌面把没有 duration 的限流当作「已暂停换源」，不设自动恢复。
    for (const retryAfterMs of [undefined, 0, -5, Number.NaN, 'soon' as any]) {
      const signal = throttleSignalOf('p1', {
        code: 'AUTH_REQUIRED',
        message: '需要登录',
        retryAfterMs,
        recovery: { mode: 'await-user' }
      })
      expect(signal?.durationMs).toBe(0)
    }
  })
})

describe('describeThrottle', () => {
  it('mirrors the desktop wording, including the countdown when one exists', () => {
    expect(describeThrottle({ pluginKey: 'p', reason: '请求过于频繁', durationMs: 0 })).toBe(
      '插件请求受限：请求过于频繁，已暂停换源'
    )
    expect(describeThrottle({ pluginKey: 'p', reason: '请求过于频繁', durationMs: 30_000 })).toBe(
      '插件请求受限：请求过于频繁，30秒后自动恢复'
    )
  })
})

describe('throttle registry', () => {
  function setup(now = 1_000) {
    let clock = now
    const pauseDownloads = vi.fn()
    const notify = vi.fn()
    const registry = createThrottleRegistry({
      now: () => clock,
      pauseDownloads,
      notify
    })
    return {
      registry,
      pauseDownloads,
      notify,
      advance: (ms: number) => {
        clock += ms
      }
    }
  }

  it('pauses downloads and tells the user when a plugin is throttled', () => {
    const { registry, pauseDownloads, notify } = setup()
    registry.throttle({ pluginKey: 'p1', reason: '请求过于频繁', durationMs: 0 })
    expect(pauseDownloads).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ reason: '请求过于频繁' })
    )
    expect(registry.isThrottled('p1')).toBe(true)
  })

  it('stays throttled until the retry window elapses', () => {
    const { registry, advance } = setup()
    registry.throttle({ pluginKey: 'p1', reason: '稍后再试', durationMs: 30_000 })
    advance(29_999)
    expect(registry.isThrottled('p1')).toBe(true)
    advance(1)
    expect(registry.isThrottled('p1')).toBe(false)
  })

  it('stays throttled indefinitely when the plugin gave no retry window', () => {
    const { registry, advance } = setup()
    registry.throttle({ pluginKey: 'p1', reason: '需要登录', durationMs: 0 })
    advance(60 * 60 * 1000)
    expect(registry.isThrottled('p1')).toBe(true)
    registry.clear('p1')
    expect(registry.isThrottled('p1')).toBe(false)
  })

  it('scopes throttling to the offending plugin', () => {
    // 桌面用 pluginId 作键：一个音源被风控，不该连累用户换用的另一个音源。
    const { registry } = setup()
    registry.throttle({ pluginKey: 'p1', reason: '请求过于频繁', durationMs: 0 })
    expect(registry.isThrottled('p1')).toBe(true)
    expect(registry.isThrottled('p2')).toBe(false)
  })

  it('extends the window instead of letting an older expiry win', () => {
    // 风控通常连续触发；第二次给的窗口从第二次算起。
    const { registry, advance } = setup()
    registry.throttle({ pluginKey: 'p1', reason: '稍后再试', durationMs: 10_000 })
    advance(5_000)
    registry.throttle({ pluginKey: 'p1', reason: '稍后再试', durationMs: 10_000 })
    advance(9_000)
    expect(registry.isThrottled('p1')).toBe(true)
    advance(1_000)
    expect(registry.isThrottled('p1')).toBe(false)
  })
})
