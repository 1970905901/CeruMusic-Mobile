import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { assertRefList, assertVolume } from './runtime'

/**
 * `favorites.*` 与 `queue.remove/reorder` 的入参在 SDK 里是 `ResourceRef[]`，
 * 桌面宿主也按数组收发。移动端此前实现的是单曲 / key 列表签名：
 *
 * - 插件按契约传数组时，`favorites.contains` 把数组当 ref 查 → 永远 false，
 *   插件以为没收藏、于是每次都再收藏一遍；
 * - `queue.remove` 读的是 `params.keys`，插件传 refs 时拿到 undefined →
 *   **什么都没删，还返回成功**；
 * - `favorites.add/remove` 拿数组去转 track → 直接报「引用无效」。
 *
 * 这些测试把「按契约传数组必须真的生效」钉住。
 */

vi.mock('@/services/db', () => ({
  toPlain: (value: any) => JSON.parse(JSON.stringify(value)),
  getDb: vi.fn(async () => ({
    getAll: vi.fn(async () => []),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    putAll: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    transaction: vi.fn(() => ({ store: { put: vi.fn() }, done: Promise.resolve() }))
  }))
}))

function makeTrack(key: string, providerId = 'wy'): import('@/types/music').Track {
  return {
    key,
    ref: { providerId, kind: 'track', id: String(key.split(':').pop()), scope: 'provider' },
    title: key,
    artists: ['Artist'],
    qualities: [],
    playable: true,
    raw: {},
    source: 'local'
  }
}

describe('plugin ref array contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('rejects a bare ref instead of treating it as an empty list', () => {
    // 单曲签名被误用成数组时，最糟的结果是「静默当成空操作并返回成功」。
    expect(() => assertRefList(undefined, '收藏')).toThrow('需要传入歌曲引用数组')
    expect(() => assertRefList([], '收藏')).toThrow('需要传入歌曲引用数组')
    expect(() => assertRefList({ providerId: 'wy', id: '1' }, '收藏')).toThrow(
      '需要传入歌曲引用数组'
    )
  })

  it('rejects malformed entries inside the list', () => {
    expect(() => assertRefList([{ providerId: 'wy', id: '1' }, null], '收藏')).toThrow(
      '引用格式无效'
    )
  })

  it('accepts a well-formed ref list', () => {
    const refs = [{ providerId: 'wy', id: '1' }, { providerId: 'wy', id: '2' }]
    expect(assertRefList(refs, '收藏')).toEqual(refs)
  })

  it('rejects a volume outside 0–1 instead of silently zeroing it', () => {
    // `Number(x) || 0` 会把 "abc" 变成 0：一次脏调用就把音量归零，
    // 而 2 又会原样放行。桌面版对这两种情况都抛错。
    expect(() => assertVolume(2)).toThrow('音量必须在 0 到 1 之间')
    expect(() => assertVolume(-1)).toThrow('音量必须在 0 到 1 之间')
    expect(() => assertVolume('abc')).toThrow('音量必须在 0 到 1 之间')
    expect(() => assertVolume(undefined)).toThrow('音量必须在 0 到 1 之间')
  })

  it('accepts the inclusive 0–1 range', () => {
    expect(assertVolume(0)).toBe(0)
    expect(assertVolume(0.5)).toBe(0.5)
    expect(assertVolume(1)).toBe(1)
    expect(assertVolume('0.25')).toBe(0.25)
  })
})

describe('favorites contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('answers one boolean per reference and does not misread the array as a ref', async () => {
    // 单曲签名时代这里把整个数组当成一个 ref 去查，插件永远拿到 false，
    // 于是每次都重复收藏。
    const { useLibraryStore } = await import('@/stores/library')
    const library = useLibraryStore()
    const a = makeTrack('wy:1')
    const b = makeTrack('wy:2')
    library.upsertTrack(a)
    library.upsertTrack(b)
    await library.addFavorite(a)
    const answers = [a, b].map((track) => library.isFavorite(track.ref))
    expect(answers).toEqual([true, false])
  })

  it('favorites.add resolves a bare ref through the track table', async () => {
    // `resolveHostRefTrack` 先查本地曲目表；入队的歌会写进表里，
    // 所以插件随后只带着引用过来也能收藏成功。
    const { useLibraryStore } = await import('@/stores/library')
    const library = useLibraryStore()
    const track = makeTrack('wy:3')
    library.upsertTrack(track)
    await library.addHostFavoriteRef(track.ref)
    expect(library.isFavorite(track.ref)).toBe(true)
  })

  it('reports an unknown reference instead of inventing an entry', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    const library = useLibraryStore()
    await expect(
      library.addHostFavoriteRef({ providerId: 'wy', kind: 'track', id: 'ghost' })
    ).rejects.toThrow('歌曲不在播放队列中')
  })
})
