import { describe, expect, it } from 'vitest'
import { createHttpClient } from '@shiqianjiang/ceru-plugin-sdk'
import { httpResponseShape } from './hostModules'

/**
 * 宿主 `http.request` 的返回值字段名必须和 SDK 一致。
 *
 * SDK 的 `PluginContext['http'].request` 声明返回 `{ status, headers, body }`，
 * SDK 自带的 `createHttpClient` 与 `createLegacyHttpBridge` 读的正是 `result.body`
 * （再包成便捷客户端的 `data`）。移动端宿主此前返回的是 `{ status, headers, data }`，
 * 于是插件用 `ctx.http.create({...}).get(...)` 拿到的永远是 `undefined`：搜索、
 * 歌词、解析这些走便捷客户端的地方在手机上静默变成「没有结果」，而日志里看不到
 * 任何错误——`undefined` 不是错，只是空。
 */
describe('host http response shape', () => {
  it('names the payload `body`, the way the SDK declares it', () => {
    expect(httpResponseShape({ status: 200, headers: {}, data: { a: 1 } })).toEqual({
      status: 200,
      headers: {},
      body: { a: 1 }
    })
  })

  it('keeps status and headers untouched', () => {
    expect(
      httpResponseShape({ status: 404, headers: { 'content-type': 'text/plain' }, body: 'gone' })
    ).toEqual({ status: 404, headers: { 'content-type': 'text/plain' }, body: 'gone' })
  })

  it('does not invent a body when the host sent none', () => {
    expect(httpResponseShape({ status: 204, headers: {} }).body).toBeUndefined()
  })

  it('feeds a convenient client the payload it expects', async () => {
    // 这条把 SDK 的便捷客户端真接上，验证的不是我们的假设，而是它的读取方式。
    const client = createHttpClient(
      {
        http: {
          request: async () =>
            httpResponseShape({ status: 200, headers: {}, data: { items: [{ id: 'a' }] } })
        },
        permissions: {
          query: async () => ({ status: 'granted' }),
          request: async () => ({ status: 'granted' })
        }
      } as any,
      { permissionKey: 'network', requestPermission: true }
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
