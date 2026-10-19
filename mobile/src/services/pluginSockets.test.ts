import { describe, expect, it } from 'vitest'
import { parseSocketPayload, socketEventName, validateSocketOptions } from '@/services/pluginSockets'

describe('plugin sockets', () => {
  it('accepts native websocket and socket.io URLs', () => {
    expect(validateSocketOptions({ url: 'wss://example.com/socket', kind: 'websocket' })).toMatchObject({
      permissionKey: 'network.socket',
      kind: 'websocket'
    })
    expect(
      validateSocketOptions({ url: 'https://example.com', kind: 'socket.io', path: '/lt', auth: { token: 'x' }, reconnection: true })
    ).toMatchObject({
      kind: 'socket.io',
      path: '/lt',
      auth: { token: 'x' },
      reconnection: true
    })
  })

  it('rejects invalid kinds and protocols', () => {
    expect(() => validateSocketOptions({ url: 'https://example.com', kind: 'websocket' })).toThrow()
    expect(() => validateSocketOptions({ url: 'wss://example.com', kind: 'socket.io' })).toThrow()
    expect(() => validateSocketOptions({ url: 'example.com', kind: 'websocket' })).toThrow()
  })

  it('builds event names and parses payloads safely', () => {
    expect(socketEventName('s1', 'message')).toBe('socket:s1:message')
    expect(parseSocketPayload({ data: JSON.stringify({ ok: true }) } as MessageEvent)).toEqual({ ok: true })
    expect(parseSocketPayload({ data: 'plain' } as MessageEvent)).toBe('plain')
    expect(parseSocketPayload({ data: '' } as MessageEvent)).toBeNull()
  })
})
