import { describe, expect, it } from 'vitest'
import {
  MAX_STORAGE_KEY_LENGTH,
  checkStorageKey,
  storageValueBytes
} from './pluginStorage'

describe('plugin storage keys', () => {
  it('accepts ordinary keys', () => {
    expect(checkStorageKey('token')).toBeNull()
    expect(checkStorageKey('a/b:c.d-e_f')).toBeNull()
    expect(checkStorageKey('中文键')).toBeNull()
  })

  it('rejects empty, non-string and over-long keys', () => {
    expect(checkStorageKey('')).not.toBeNull()
    expect(checkStorageKey(undefined)).not.toBeNull()
    expect(checkStorageKey(42)).not.toBeNull()
    expect(checkStorageKey('x'.repeat(MAX_STORAGE_KEY_LENGTH + 1))).not.toBeNull()
    expect(checkStorageKey('x'.repeat(MAX_STORAGE_KEY_LENGTH))).toBeNull()
  })

  it('rejects prototype-polluting names', () => {
    // 这些键会被拼进对象属性与 IndexedDB 主键，必须先挡掉。
    expect(checkStorageKey('__proto__')).not.toBeNull()
    expect(checkStorageKey('constructor')).not.toBeNull()
    expect(checkStorageKey('prototype')).not.toBeNull()
  })

  it('rejects control characters', () => {
    expect(checkStorageKey('a\u0000b')).not.toBeNull()
    expect(checkStorageKey('a\nb')).not.toBeNull()
  })
})

describe('plugin storage values', () => {
  it('measures UTF-8 bytes rather than character count', () => {
    // 中文一个字符占 3 字节，按字符数算会严重低估。
    expect(storageValueBytes('abc')).toBe(5)
    expect(storageValueBytes('中文')).toBe(8)
  })

  it('returns null for values that cannot be serialised', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(storageValueBytes(circular)).toBeNull()
    expect(storageValueBytes(undefined)).toBeNull()
    expect(storageValueBytes(() => undefined)).toBeNull()
  })
})
