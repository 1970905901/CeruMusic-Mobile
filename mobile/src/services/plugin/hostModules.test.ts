import { describe, expect, it } from 'vitest'
import { zlibSync } from 'fflate'
import { COMPAT_MODULE_NAMES, compatModule, legacyHttpModule } from './hostModules'

/**
 * 插件用 `ctx.modules.require('@ceru/...')` 拿兼容模块时，拿到的东西必须与 SDK
 * 声明的 `BuiltinModules` 一致。
 *
 * 移动端此前四个模块都是手写的替代品：`@ceru/crypto` 直接返回裸 CryptoJS（没有
 * `createHash` / `randomBytes` / `randomUUID`），`@ceru/compression` 返回 fflate 的
 * `gzip/deflate`（契约里根本没有），`@ceru/encoding` 返回 `{encode,base64}`（契约
 * 只有一个 `decode(bytes, encoding)`），`@ceru/legacy-http` 返回的是**函数**而不是
 * `{ createLegacyHttpBridge }`。官方 Navidrome 教程插件第一行就是
 * `ctx.modules.require('@ceru/crypto').randomBytes(16)`——在手机上会直接 TypeError，
 * 而错误看起来像插件自己写错了。
 */
describe('builtin module contracts', () => {
  it('covers exactly the compat modules the SDK publishes', () => {
    expect([...COMPAT_MODULE_NAMES]).toEqual([
      '@ceru/crypto',
      '@ceru/compression',
      '@ceru/encoding'
    ])
    for (const name of COMPAT_MODULE_NAMES) expect(compatModule(name)).toBeTruthy()
  })

  it('returns null for names it does not own', () => {
    // 别的模块（lodash、@ceru/http…）由 worker 自己接，不该在这里悄悄兜底。
    expect(compatModule('lodash')).toBeNull()
    expect(compatModule('@ceru/http')).toBeNull()
    expect(compatModule('@ceru/socket')).toBeNull()
  })
})

describe('@ceru/crypto', () => {
  const crypto = compatModule('@ceru/crypto') as Record<string, any>

  it('exposes the documented helpers', () => {
    for (const name of [
      'createHash',
      'createCipheriv',
      'createDecipheriv',
      'publicEncrypt',
      'randomBytes',
      'randomUUID',
      'constants'
    ]) {
      expect(crypto[name], name).toBeTruthy()
    }
    expect(crypto.constants.RSA_NO_PADDING).toBe(3)
  })

  it('hashes the way the tutorial plugin expects', () => {
    // 期望值是 md5/sha256 的公开测试向量，不是用同一段代码算出来的。
    expect(crypto.createHash('md5').update('abc').digest('hex')).toBe(
      '900150983cd24fb0d6963f7d28e17f72'
    )
    expect(crypto.createHash('sha256').update('abc').digest('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('produces random bytes a Subsonic salt can use', () => {
    const salt = crypto.randomBytes(16)
    expect(salt.length).toBe(16)
    expect(Array.from<unknown>(salt).every((value) => Number(value) >= 0 && Number(value) <= 255)).toBe(
      true
    )
  })

  it('produces a real UUID', () => {
    expect(crypto.randomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('round-trips aes-256-cbc', () => {
    // SDK 的 `update()` 返回 Buffer（不是 Node 那种可链式的 this），
    // 桌面端同一份实现，所以插件也是分两步调。
    const key = crypto.randomBytes(32)
    const iv = crypto.randomBytes(16)
    const text = 'hello 澜音'

    const encryptor = crypto.createCipheriv('aes-256-cbc', key, iv)
    encryptor.update(text)
    const ciphertext = encryptor.final()

    const decryptor = crypto.createDecipheriv('aes-256-cbc', key, iv)
    decryptor.update(ciphertext)
    const plain = decryptor.final()

    expect(plain.toString('utf8')).toBe(text)
  })
})

describe('@ceru/compression', () => {
  const compression = compatModule('@ceru/compression') as Record<string, any>

  it('decompresses a zlib stream', () => {
    const source = new TextEncoder().encode('{"ok":true}')
    expect(Array.from(compression.unzipSync(zlibSync(source)))).toEqual(Array.from(source))
  })

  it('reports inflate through the callback, not a promise', () => {
    const source = new TextEncoder().encode('hello')
    let error: unknown = null
    let received: any = null
    compression.inflate(zlibSync(source), (cause: unknown, bytes: any) => {
      error = cause
      received = bytes
    })
    expect(error).toBeNull()
    expect(Array.from(received)).toEqual(Array.from(source))
  })
})

describe('@ceru/encoding', () => {
  it('decodes bytes with the encoding the plugin asks for', () => {
    const encoding = compatModule('@ceru/encoding') as Record<string, any>
    expect(encoding.decode(new TextEncoder().encode('澜音'), 'utf-8')).toBe('澜音')
  })
})

describe('@ceru/legacy-http', () => {
  const bridge = legacyHttpModule({
    http: {
      request: async () => ({ status: 200, headers: {}, body: '{"ok":true}' })
    },
    permissions: {
      query: async () => ({ status: 'granted' }),
      request: async () => ({ status: 'granted' })
    }
  } as any) as Record<string, any>

  it('is an object with the bridge factory, not the factory itself', () => {
    // 插件按 SDK 写 `const { createLegacyHttpBridge } = require('@ceru/legacy-http')`，
    // 拿到的是函数时只会 TypeError。
    expect(typeof bridge.createLegacyHttpBridge).toBe('function')
    expect(bridge.createLegacyHttpBridge.length).toBe(1)
  })

  it('resolves a legacy httpFetch to the old response shape', async () => {
    const { httpFetch, withOperation } = bridge.createLegacyHttpBridge({
      http: {
        request: async () => ({ status: 200, headers: {}, body: '{"ok":true}' })
      },
      permissions: {
        query: async () => ({ status: 'granted' }),
        request: async () => ({ status: 'granted' })
      }
    })
    const operation = {
      id: 'op-1',
      deadlineAt: Date.now() + 1000,
      signal: new AbortController().signal
    }
    const result = await withOperation(operation, () =>
      httpFetch('https://example.com/api').promise
    )
    expect(result.statusCode).toBe(200)
    expect(result.body).toEqual({ ok: true })
    expect(result.url).toBe('https://example.com/api')
    expect(result.raw).toBe('{"ok":true}')
  })
})
