import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * `ctx.library.playlists.*` 的 `location` / `target` 是 SDK 契约的一部分：
 * `PlaylistReference` 就是 `{ id, location: 'local' | 'cloud' }`。
 *
 * 移动端此前**完全忽略** `location`：`list({ location: 'cloud' })` 拿回本地
 * 歌单、`getTracks({ target: { location: 'cloud' } })` 按本地 ID 撞一个同名的
 * 本机歌单、`import` 永远新建本地歌单、`removeTracks` / `clearPlaylist` 对云端
 * 目标静默返回成功。插件照契约做双向同步时，云端歌单一首都没变。
 */

const cloudSongs = [
  {
    songmid: '1',
    name: 'Song A',
    singer: 'Artist',
    albumId: '10',
    albumName: 'Album',
    source: 'test',
    interval: '03:00',
    img: '',
    types: []
  }
]

const cloudApi = {
  getUserSongLists: vi.fn(async () => [
    { id: 'cloud-1', name: '云端歌单', describe: '来自云端' }
  ]),
  getSongListDetail: vi.fn(async () => ({ list: [...cloudSongs], total: 1 })),
  updateUserSongList: vi.fn(async (_data: any) => ({ id: 'cloud-1', updatedAt: '' }))
}

vi.mock('@/services/cloudSongList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cloudSongList')>()
  return {
    ...actual,
    cloudSongListApi: {
      ...actual.cloudSongListApi,
      getUserSongLists: cloudApi.getUserSongLists,
      getSongListDetail: cloudApi.getSongListDetail,
      updateUserSongList: cloudApi.updateUserSongList
    }
  }
})

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

/** `updateUserSongList` 最后一次写回的内容（参数类型在 mock 里是 any）。 */
function lastWrittenUpdate(): any {
  const calls = cloudApi.updateUserSongList.mock.calls as unknown as any[][]
  return calls[calls.length - 1]?.[0]
}

describe('host playlist pages', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('lists cloud playlists when the plugin asks for that location', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    const page = await useLibraryStore().asHostPlaylists(undefined, 100, 'cloud')
    expect(page.items).toHaveLength(1)
    expect(page.items[0].ref).toEqual({ id: 'cloud-1', location: 'cloud' })
    expect(page.items[0].name).toBe('云端歌单')
  })

  it('keeps local playlists as the default location', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    const library = useLibraryStore()
    library.createPlaylist('本机歌单')
    const page = await library.asHostPlaylists(undefined, 100, 'local')
    expect(page.items[0].ref.location).toBe('local')
    expect(cloudApi.getUserSongLists).not.toHaveBeenCalled()
  })

  it('reads cloud tracks by cloud id instead of colliding with a local id', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    const page = await useLibraryStore().asHostTracks(
      { id: 'cloud-1', location: 'cloud' },
      undefined,
      100
    )
    expect(cloudApi.getSongListDetail).toHaveBeenCalledWith('cloud-1', 'asc')
    expect(page.items[0].ref.id).toBe('1')
    expect(page.items[0].title).toBe('Song A')
  })

  it('imports into the cloud playlist the plugin named', async () => {
    // 此前一律新建本地歌单：插件往指定云歌单导入，凭空多出一张本地的。
    const { useLibraryStore } = await import('@/stores/library')
    const library = useLibraryStore()
    const result = await library.importHostPlaylist({
      target: { id: 'cloud-1', location: 'cloud' },
      suggestedName: '不该新建',
      items: [
        {
          ref: { providerId: 'test', kind: 'track', id: '2', scope: 'provider' },
          title: 'Song B',
          capabilities: [],
          metadata: { artists: ['Artist'] }
        }
      ]
    })
    expect(result.target).toEqual({ id: 'cloud-1', location: 'cloud' })
    expect(result.added).toBe(1)
    expect(library.playlists).toHaveLength(0)
    expect(cloudApi.updateUserSongList).toHaveBeenCalled()
    const written = lastWrittenUpdate()
    expect(written.listId).toBe('cloud-1')
    expect(written.songlist).toHaveLength(2)
  })

  it('skips songs already in the cloud playlist', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    const result = await useLibraryStore().importHostPlaylist({
      target: { id: 'cloud-1', location: 'cloud' },
      items: [
        {
          ref: { providerId: 'test', kind: 'track', id: '1', scope: 'provider' },
          title: 'Song A',
          capabilities: [],
          metadata: { artists: ['Artist'] }
        }
      ]
    })
    expect(result.added).toBe(0)
    expect(result.skipped).toBe(1)
    expect(cloudApi.updateUserSongList).not.toHaveBeenCalled()
  })

  it('removes cloud tracks and reports removed/notFound', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    const result = await useLibraryStore().removeHostTracks(
      { id: 'cloud-1', location: 'cloud' },
      [
        { ref: { providerId: 'test', kind: 'track', id: '1', scope: 'provider' }, title: 'Song A' },
        { ref: { providerId: 'test', kind: 'track', id: '9', scope: 'provider' }, title: 'Ghost' }
      ]
    )
    expect(result.removed).toBe(1)
    expect(result.notFound).toBe(1)
    const written = lastWrittenUpdate()
    expect(written.songlist).toHaveLength(0)
  })

  it('clears a cloud playlist but keeps the playlist itself', async () => {
    const { useLibraryStore } = await import('@/stores/library')
    await useLibraryStore().clearHostPlaylist({ id: 'cloud-1', location: 'cloud' })
    expect(cloudApi.updateUserSongList).toHaveBeenCalledWith({ listId: 'cloud-1', songlist: [] })
  })
})
