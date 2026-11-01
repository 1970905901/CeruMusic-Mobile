import { describe, expect, it } from 'vitest'
import {
  HTTP_MAX_BODY_BYTES,
  HTTP_MAX_RESPONSE_BYTES,
  assertHttpLimits,
  responseExceedsLimit
} from './httpLimits'

/**
 * HTTP 的体积上限，与桌面 `requestNetwork` 的 axios 配置同口径
 * （`maxContentLength: 16 MiB`、`maxBodyLength: 4 MiB`）。
 *
 * 移动端此前完全没有这道闸：`fetch` 把整个响应读进内存，`CapacitorHttp`
 * 也是整段返回。插件指向一个大文件地址，WebView 或原生桥就会吃满内存，
 * 系统直接杀掉应用——用户只看到闪退，看不出是哪个插件做的。
 */
describe('http size limits', () => {
  it('matches the desktop numbers', () => {
    expect(HTTP_MAX_BODY_BYTES).toBe(4 * 1024 * 1024)
    expect(HTTP_MAX_RESPONSE_BYTES).toBe(16 * 1024 * 1024)
  })

  it('allows a request body up to the limit', () => {
    expect(() =>
      assertHttpLimits({ body: 'x'.repeat(HTTP_MAX_BODY_BYTES) })
    ).not.toThrow()
  })

  it('rejects a request body over the limit', () => {
    expect(() =>
      assertHttpLimits({ body: 'x'.repeat(HTTP_MAX_BODY_BYTES + 1) })
    ).toThrow('请求体超过')
  })

  it('measures json payloads by their serialised size, not their string length', () => {
    // 中文与 emoji 的 UTF-8 字节数大于 `String.length`；按 length 算会放过超限请求。
    expect(() =>
      assertHttpLimits({ json: { text: '音'.repeat(HTTP_MAX_BODY_BYTES / 3 + 1) } })
    ).toThrow('请求体超过')
  })

  it('treats a missing or empty body as fine', () => {
    expect(() => assertHttpLimits({})).not.toThrow()
    expect(() => assertHttpLimits({ body: '' })).not.toThrow()
    expect(() => assertHttpLimits({ json: undefined })).not.toThrow()
  })

  it('rejects when the two body fields disagree about being present', () => {
    // SDK 客户端自己会拦这一条；这里只是让直接调低层 RPC 的插件也撞上同一道闸。
    expect(() => assertHttpLimits({ json: { a: 1 }, body: 'raw' })).toThrow('只能选择一种')
  })

  it('flags a response body over the cap', () => {
    expect(responseExceedsLimit('x'.repeat(HTTP_MAX_RESPONSE_BYTES + 1))).toBe(true)
  })

  it('accepts a response at the cap', () => {
    expect(responseExceedsLimit('x'.repeat(HTTP_MAX_RESPONSE_BYTES))).toBe(false)
    expect(responseExceedsLimit(undefined)).toBe(false)
    expect(responseExceedsLimit({ items: [] })).toBe(false)
  })
})
