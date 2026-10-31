import { describe, expect, it } from 'vitest'
import {
  LOCKED_NETWORK_GLOBALS,
  lockNetworkGlobals,
  networkDenied
} from './networkLockdown'

/**
 * 插件脚本在宿主 RPC 所在的**同一个 Worker**里求值，能直接拿到原生网络原语。
 * `ctx.http` 的授权检查因此只对「愿意走 ctx 的插件」有效。
 *
 * 封锁必须在两个方向都成立：
 * - 锁住的全局一旦调用就报错（而不是静默返回 undefined，让插件以为没网）；
 * - 插件自己再 `defineProperty` 一次也换不回来（否则封锁等于没做）。
 */
describe('plugin network lockdown', () => {
  it('covers every primitive that can open a network path', () => {
    // `Worker` / `SharedWorker` / `importScripts` 能开出新 realm——漏掉一个，
    // 插件把 fetch 放进 Blob URL 的脚本就能绕过其余所有锁。
    expect([...LOCKED_NETWORK_GLOBALS]).toEqual([
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'Worker',
      'SharedWorker',
      'importScripts'
    ])
  })

  it('replaces each global with a refusing function', () => {
    const target: Record<string, unknown> = {
      fetch: () => 'real',
      XMLHttpRequest: class {},
      WebSocket: class {}
    }
    const locked = lockNetworkGlobals(target)
    expect(locked).toEqual([...LOCKED_NETWORK_GLOBALS])
    for (const name of LOCKED_NETWORK_GLOBALS) {
      expect(typeof target[name]).toBe('function')
      expect(() => (target[name] as () => unknown)()).toThrow('不能直接使用')
    }
  })

  it('names the primitive and points at the supported route', () => {
    expect(() => networkDenied('fetch')()).toThrow('fetch')
    expect(() => networkDenied('fetch')()).toThrow('ctx.http')
  })

  it('cannot be replaced again by plugin code', () => {
    const target: Record<string, unknown> = {}
    lockNetworkGlobals(target)
    // 插件拿到的是同一个全局对象；再 defineProperty / 直接赋值都应当失败。
    expect(() =>
      Object.defineProperty(target, 'fetch', { value: () => 'real', configurable: true })
    ).toThrow(TypeError)
    expect(() => {
      'use strict'
      target.fetch = () => 'real'
    }).toThrow(TypeError)
    expect(() => (target.fetch as () => unknown)()).toThrow('不能直接使用')
  })

  it('skips a global the runtime refuses to redefine without failing the rest', () => {
    const blocked: Record<string, unknown> = new Proxy(
      { fetch: () => 'real' },
      {
        defineProperty() {
          throw new TypeError('cannot redefine')
        }
      }
    )
    const seen: string[] = []
    const locked = lockNetworkGlobals(blocked, (name) => seen.push(name))
    // 一个不可重定义的属性不该让整轮封锁中断；调用方也拿得到失败清单。
    expect(locked.length).toBeLessThan(LOCKED_NETWORK_GLOBALS.length)
    expect(seen).toContain('fetch')
  })
})
