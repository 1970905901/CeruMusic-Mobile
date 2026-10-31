import { describe, expect, it, vi } from 'vitest'
import { MAX_IMPORT_CACHE, importCacheKey, importOnce, type ImportCacheEntry } from './importIdempotency'

/**
 * `library.playlists.import` 的 `requestId` 幂等：同一批重试要拿到同一个结果。
 *
 * 移动端此前只校验了 requestId 的形状就丢掉它：插件网络抖动后重试同一批，
 * 歌被导入两次，`added` 还是第二遍的数字。
 */
function cache<T>(): Map<string, ImportCacheEntry<T>> {
  return new Map()
}

describe('import cache key', () => {
  it('scopes the key by request id and target', () => {
    // 同一批歌导入到两张不同歌单是两个独立操作。
    expect(importCacheKey('batch-1', { id: 'a', location: 'local' })).toBe(
      'batch-1|["a","local"]'
    )
    expect(importCacheKey('batch-1', { id: 'b', location: 'cloud' })).toBe(
      'batch-1|["b","cloud"]'
    )
    // 没有目标时由宿主选（可能新建），仍然要有稳定的键。
    expect(importCacheKey('batch-1', undefined)).toBe('batch-1|none')
  })

  it('rejects a missing or over-long request id', () => {
    expect(importCacheKey('', undefined)).toBeNull()
    expect(importCacheKey('   ', undefined)).toBeNull()
    expect(importCacheKey(undefined, undefined)).toBeNull()
    expect(importCacheKey(42, undefined)).toBeNull()
    expect(importCacheKey('x'.repeat(257), undefined)).toBeNull()
  })
})

describe('import once', () => {
  it('runs the import only once for the same request id', async () => {
    const store = cache<string>()
    const run = vi.fn(async () => 'result')
    const first = importOnce(store, 'batch-1|none', run)
    const second = importOnce(store, 'batch-1|none', run)
    await Promise.all([first, second])
    expect(run).toHaveBeenCalledTimes(1)
    await expect(first).resolves.toBe('result')
    await expect(second).resolves.toBe('result')
  })

  it('runs a different request id separately', async () => {
    const store = cache<string>()
    const run = vi.fn(async () => 'result')
    await importOnce(store, 'batch-1|none', run)
    await importOnce(store, 'batch-2|none', run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('drops a failed entry so a retry can succeed', async () => {
    // 一次临时失败不能被永久缓存成一个失败的 Promise。
    const store = cache<string>()
    await expect(
      importOnce(store, 'batch-1|none', async () => {
        throw new Error('网络失败')
      })
    ).rejects.toThrow('网络失败')
    expect(store.size).toBe(0)
    await expect(importOnce(store, 'batch-1|none', async () => 'ok')).resolves.toBe('ok')
  })

  it('keeps at most the documented number of entries', async () => {
    const store = cache<string>()
    for (let index = 0; index < MAX_IMPORT_CACHE + 10; index++) {
      await importOnce(store, `batch-${index}|none`, async () => String(index))
    }
    expect(store.size).toBe(MAX_IMPORT_CACHE)
    // 最旧的条目被淘汰，最近的还在。
    expect(store.has('batch-0|none')).toBe(false)
    expect(store.has(`batch-${MAX_IMPORT_CACHE + 9}|none`)).toBe(true)
  })
})
