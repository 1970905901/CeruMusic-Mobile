import { describe, expect, it } from 'vitest'
import { gzipSync, strToU8 } from 'fflate'
import { gunzipWithLimit } from './gzipLimit'

describe('gzip with output limit', () => {
  it('unpacks a normal payload', () => {
    const packed = gzipSync(strToU8('hello'))
    expect(new TextDecoder().decode(gunzipWithLimit(packed, 1024))).toBe('hello')
  })

  it('refuses a bomb instead of allocating gigabytes', () => {
    // 全零数据压缩比极高：2 MB 的输入解出 2 MB，上限设 1 KB 必须立刻停下。
    const packed = gzipSync(new Uint8Array(2 * 1024 * 1024))
    expect(() => gunzipWithLimit(packed, 1024)).toThrow('解压后过大')
  })

  it('propagates a corrupt stream as an error rather than empty output', () => {
    expect(() => gunzipWithLimit(new Uint8Array([1, 2, 3]), 1024)).toThrow()
  })

  it('returns an empty buffer for an empty archive', () => {
    expect(gunzipWithLimit(gzipSync(new Uint8Array(0)), 1024)).toHaveLength(0)
  })
})
