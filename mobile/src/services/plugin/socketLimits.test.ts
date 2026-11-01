import { describe, expect, it } from 'vitest'
import {
  MAX_SOCKET_CONNECTIONS,
  MAX_SOCKET_MESSAGE_BYTES,
  MAX_SOCKET_SENDS_PER_SECOND,
  RESERVED_SOCKET_EVENTS,
  SocketSendLimiter,
  assertSocketMessageSize,
  assertSocketSlots,
  assertSocketEventName
} from './socketLimits'

/**
 * Socket 的配额与桌面 SocketBroker 同口径。
 *
 * 移动端此前只有一条「单条负载 1 MiB」的校验，条数、速率、事件名一概不管：
 * 插件可以开几十条连接、每秒灌几百条消息，把 socket.io 客户端和主线程拖住；
 * 还能注册 `connect` / `disconnect` / `error` / `connect_error` 这些保留事件，
 * 直接把库自己的生命周期回调打乱。
 */
describe('socket limits', () => {
  it('uses the desktop numbers', () => {
    expect(MAX_SOCKET_CONNECTIONS).toBe(8)
    expect(MAX_SOCKET_MESSAGE_BYTES).toBe(65536)
    expect(MAX_SOCKET_SENDS_PER_SECOND).toBe(100)
    expect([...RESERVED_SOCKET_EVENTS]).toEqual([
      'connect',
      'connect_error',
      'disconnect',
      'disconnecting',
      'error',
      'message'
    ])
  })

  it('refuses once eight sockets are held, counting the connecting ones', () => {
    // 桌面 `connections.size + connecting >= 8` 就是这个边界：第 8 条能连上，
    // 之后（以及已有 7 条时正在连第 8 条）一律拒绝。正在连接的也计入，
    // 否则插件并发发起就能越线。
    expect(() => assertSocketSlots(7, 0)).not.toThrow()
    expect(() => assertSocketSlots(7, 1)).toThrow('Socket 连接数已达上限')
    expect(() => assertSocketSlots(8, 0)).toThrow('Socket 连接数已达上限')
  })

  it('measures message size in UTF-8 bytes', () => {
    expect(() => assertSocketMessageSize('x'.repeat(MAX_SOCKET_MESSAGE_BYTES))).not.toThrow()
    expect(() => assertSocketMessageSize('x'.repeat(MAX_SOCKET_MESSAGE_BYTES + 1))).toThrow(
      'Socket 消息超过'
    )
    // 中文一字三字节：按 length 算会放过 3 倍超限的消息。
    expect(() => assertSocketMessageSize('音'.repeat(MAX_SOCKET_MESSAGE_BYTES / 3 + 1))).toThrow(
      'Socket 消息超过'
    )
  })

  it('serialises objects before measuring, like the desktop broker does', () => {
    expect(() => assertSocketMessageSize({ payload: '音'.repeat(30000) })).toThrow(
      'Socket 消息超过'
    )
    expect(() => assertSocketMessageSize({ ok: true })).not.toThrow()
    expect(() => assertSocketMessageSize(null)).not.toThrow()
  })

  it('refuses values that cannot be serialised', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => assertSocketMessageSize(circular)).toThrow('无法序列化')
  })

  it('blocks the events socket.io owns', () => {
    expect(() => assertSocketEventName('connect')).toThrow('保留事件')
    expect(() => assertSocketEventName('message')).toThrow('保留事件')
    expect(() => assertSocketEventName('song')).not.toThrow()
    expect(() => assertSocketEventName('song.updated')).not.toThrow()
  })

  it('rejects an over-long event name', () => {
    expect(() => assertSocketEventName('e'.repeat(128))).not.toThrow()
    expect(() => assertSocketEventName('e'.repeat(129))).toThrow('事件名')
    expect(() => assertSocketEventName('')).toThrow('事件名')
  })
})

describe('send rate limiter', () => {
  it('allows up to the per-second budget', () => {
    const limiter = new SocketSendLimiter()
    for (let i = 0; i < MAX_SOCKET_SENDS_PER_SECOND; i++) limiter.count(Date.now())
    expect(() => limiter.count(Date.now())).toThrow('发送过快')
  })

  it('resets the budget after a second', () => {
    const limiter = new SocketSendLimiter()
    const start = 1_000_000
    for (let i = 0; i < MAX_SOCKET_SENDS_PER_SECOND; i++) limiter.count(start)
    expect(() => limiter.count(start + 1000)).not.toThrow()
  })

  it('keeps counting within the same window', () => {
    const limiter = new SocketSendLimiter()
    const start = 1_000_000
    for (let i = 0; i < MAX_SOCKET_SENDS_PER_SECOND; i++) limiter.count(start)
    expect(() => limiter.count(start + 500)).toThrow('发送过快')
  })
})
