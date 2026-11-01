import { describe, expect, it, vi } from 'vitest'
import { HttpError, createHttpClient } from '@shiqianjiang/ceru-plugin-sdk'
import { createHostHttpRequest } from './hostHttp'

/**
 * 插件的 HTTP 出口。
 *
 * 桌面端有两条口径，移动端此前把两条合成了一条，两头都不对：
 * - **低层** `ctx.http.request(...)` 原样返回状态码（文档：「低层请求通常保留
 *   非 2xx 状态；业务自行处理」）。移动端直接抛错，插件想读 429 的响应体
 *   （限流重试、错误码）拿不到。
 * - **便捷客户端** `ctx.http.create(...).get(...)` 才在非 2xx 抛 `HttpError`，
 *   日志里 `error instanceof HttpError` 的写法依赖它。移动端既没有 `HttpError`，
 *   又把 payload 叫 `data`，SDK 客户端读 `body` 只能拿到 undefined。
 */
function setup(response: any, permission: 'granted' | 'denied' = 'granted') {
  const rpc = vi.fn(async () => response)
  const ensurePermission = async () => {
    if (permission !== 'granted') throw new Error('网络权限未授予')
  }
  return { rpc, request: createHostHttpRequest({ rpc, ensurePermission }) }
}

describe('low-level ctx.http.request', () => {
  it('passes a non-2xx response through untouched', async () => {
    const { request } = setup({ status: 429, headers: {}, body: '{"code":429}' })
    const result = await request({ url: 'https://example.com/tracks', permissionKey: 'api' })
    expect(result.status).toBe(429)
    expect(result.body).toBe('{"code":429}')
  })

  it('forwards the request fields the host needs', async () => {
    const { rpc, request } = setup({ status: 200, headers: {}, body: {} })
    await request({
      url: 'https://example.com/a',
      method: 'POST',
      headers: { 'x-test': '1' },
      query: { q: 'a' },
      json: { ok: true },
      timeoutMs: 5000,
      permissionKey: 'api'
    })
    expect(rpc).toHaveBeenCalledWith('http.request', {
      url: 'https://example.com/a',
      method: 'POST',
      headers: { 'x-test': '1' },
      query: { q: 'a' },
      json: { ok: true },
      form: undefined,
      body: undefined,
      timeoutMs: 5000,
      responseType: undefined,
      permissionKey: 'api'
    })
  })

  it('refuses before spending a request when the permission is denied', async () => {
    const { rpc, request } = setup({ status: 200, headers: {}, body: {} }, 'denied')
    await expect(request({ url: 'https://example.com/a', permissionKey: 'api' })).rejects.toThrow(
      '网络权限未授予'
    )
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects a request with no url', async () => {
    const { request } = setup({ status: 200, headers: {}, body: {} })
    await expect(request({ permissionKey: 'api' })).rejects.toThrow('HTTP 请求缺少 URL')
  })
})

describe('convenient client over the host request', () => {
  it('throws HttpError the way plugins detect rate limits', async () => {
    const { request } = setup({ status: 429, headers: {}, body: { code: 429 } })
    const client = createHttpClient(
      {
        http: { request: request as any },
        permissions: {
          query: async () => ({ status: 'granted' }),
          request: async () => ({ status: 'granted' })
        }
      } as any,
      { permissionKey: 'api', requestPermission: true }
    )
    const operation = {
      id: 'op-1',
      deadlineAt: Date.now() + 1000,
      signal: new AbortController().signal
    }
    await expect(client.get('https://example.com/tracks', { operation })).rejects.toBeInstanceOf(
      HttpError
    )
  })

  it('hands back the parsed payload, not undefined', async () => {
    const { request } = setup({ status: 200, headers: {}, body: { items: [{ id: 'a' }] } })
    const client = createHttpClient(
      {
        http: { request: request as any },
        permissions: {
          query: async () => ({ status: 'granted' }),
          request: async () => ({ status: 'granted' })
        }
      } as any,
      { permissionKey: 'api', requestPermission: true }
    )
    const page = await client.get<{ items: { id: string }[] }>('https://example.com/tracks', {
      operation: {
        id: 'op-1',
        deadlineAt: Date.now() + 1000,
        signal: new AbortController().signal
      }
    })
    expect(page).toEqual({ items: [{ id: 'a' }] })
  })
})
