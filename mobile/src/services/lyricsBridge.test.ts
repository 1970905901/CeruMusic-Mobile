import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  onCurrentLyrics,
  publishCurrentLyrics,
  resetLyricsBridge
} from './lyricsBridge'

const doc = { lines: [], format: 'plain' as const }

afterEach(() => resetLyricsBridge())

describe('lyrics bridge', () => {
  it('delivers the document to every subscriber', () => {
    const first = vi.fn()
    const second = vi.fn()
    onCurrentLyrics(first)
    onCurrentLyrics(second)
    publishCurrentLyrics(doc)
    expect(first).toHaveBeenCalledWith(doc)
    expect(second).toHaveBeenCalledWith(doc)
  })

  it('stops delivering after unsubscribe', () => {
    // 插件被停用后必须停止收到事件，否则会在已销毁的 worker 上继续投递。
    const listener = vi.fn()
    const off = onCurrentLyrics(listener)
    off()
    publishCurrentLyrics(doc)
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps delivering to others when one subscriber throws', () => {
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    onCurrentLyrics(bad)
    onCurrentLyrics(good)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(() => publishCurrentLyrics(doc)).not.toThrow()
    expect(good).toHaveBeenCalledWith(doc)
    warn.mockRestore()
  })

  it('forwards a null document when lyrics are cleared', () => {
    const listener = vi.fn()
    onCurrentLyrics(listener)
    publishCurrentLyrics(null)
    expect(listener).toHaveBeenCalledWith(null)
  })
})
