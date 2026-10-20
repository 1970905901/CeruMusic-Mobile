import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLibraryStore } from '@/stores/library'
import { blobToDataUrl, compressAndCropToSquare } from '@/services/imageUtils'
import type { Track } from '@/types/music'

const mockDbStore: Record<string, any[]> = {
  favorites: [],
  playlists: [],
  history: [],
  localTracks: [],
  tracks: []
}

vi.mock('@/services/db', () => ({
  toPlain: (val: any) => JSON.parse(JSON.stringify(val)),
  getDb: vi.fn(async () => ({
    getAll: vi.fn(async (name: string) => mockDbStore[name] || []),
    put: vi.fn(async (name: string, val: any) => {
      mockDbStore[name] = mockDbStore[name] || []
      const existingIdx = mockDbStore[name].findIndex(
        (x: any) => (x.key && x.key === val.key) || (x.id && x.id === val.id)
      )
      if (existingIdx >= 0) mockDbStore[name][existingIdx] = val
      else mockDbStore[name].push(val)
    }),
    delete: vi.fn(async (name: string, id: string) => {
      mockDbStore[name] = (mockDbStore[name] || []).filter((x: any) => x.id !== id && x.key !== id)
    })
  }))
}))

vi.mock('@/services/cloudSongList', () => ({
  cloudSongListApi: {
    updateUserSongList: vi.fn(async () => ({ success: true }))
  },
  playlistTracksToCloud: vi.fn(() => [])
}))

describe('Playlist Details & Custom Cover', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockDbStore.playlists = []
    mockDbStore.tracks = []
    mockDbStore.localTracks = []
  })

  it('updates playlist name and description', async () => {
    const library = useLibraryStore()
    const pl = library.createPlaylist('原歌单名称', '原描述')

    const updated = await library.updatePlaylist(pl.id, {
      name: '新歌单名称',
      description: '新描述文本'
    })

    expect(updated).not.toBeNull()
    expect(updated?.name).toBe('新歌单名称')
    expect(updated?.description).toBe('新描述文本')

    const inList = library.playlists.find((item) => item.id === pl.id)
    expect(inList?.name).toBe('新歌单名称')
    expect(inList?.description).toBe('新描述文本')
  })

  it('sets, updates, and clears custom cover', async () => {
    const library = useLibraryStore()
    const pl = library.createPlaylist('我的歌单')

    // 默认无封面
    expect(library.getPlaylistCover(pl.id)).toBeUndefined()

    // 设置自定义封面
    const customCover = 'data:image/jpeg;base64,mockCoverData'
    await library.updatePlaylist(pl.id, { cover: customCover })

    const updatedPl = library.playlists.find((item) => item.id === pl.id)
    expect(updatedPl?.cover).toBe(customCover)
    expect(library.getPlaylistCover(pl.id)).toBe(customCover)

    // 添加一首带有自身封面的歌曲
    const trackWithArt: Track = {
      key: 'test:song-1',
      ref: { id: 'song-1', kind: 'song', providerId: 'test-provider' },
      title: '歌曲1',
      artists: ['歌手'],
      artworkUrl: 'https://example.com/song1.jpg',
      qualities: [],
      playable: true,
      raw: {}
    }
    await library.addTrackToPlaylist(pl.id, trackWithArt)

    // 有自定义封面时，优先使用自定义封面
    expect(library.getPlaylistCover(pl.id)).toBe(customCover)

    // 清除自定义封面 (传入 null 或空字符串)
    await library.updatePlaylist(pl.id, { cover: null })
    expect(library.playlists.find((item) => item.id === pl.id)?.cover).toBeUndefined()

    // 清除后，自动降级为第一首歌的封面
    expect(library.getPlaylistCover(pl.id)).toBe('https://example.com/song1.jpg')
  })

  it('renamePlaylist delegates to updatePlaylist seamlessly', async () => {
    const library = useLibraryStore()
    const pl = library.createPlaylist('旧名称')

    await library.renamePlaylist(pl.id, '通过rename方法修改')
    expect(library.playlists.find((item) => item.id === pl.id)?.name).toBe('通过rename方法修改')
  })

  it('blobToDataUrl and compressAndCropToSquare fallback gracefully in Node environment', async () => {
    const textBlob = new Blob(['hello image'], { type: 'text/plain' })
    const dataUrl = await blobToDataUrl(textBlob)
    expect(dataUrl).toContain('data:text/plain;base64,')

    const file = new File(['fake image bytes'], 'test.jpg', { type: 'image/jpeg' })
    const compressed = await compressAndCropToSquare(file, 400, 0.8)
    expect(compressed).toContain('data:image/jpeg;base64,')
  })
})