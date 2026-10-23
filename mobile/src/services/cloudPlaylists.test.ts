import { describe, expect, it } from 'vitest'
import { cloudPlaylistIdFromRoute, cloudPlaylistKey, mergeCloudPlaylists } from './cloudPlaylists'
import type { CloudSongList } from './cloudSongList'

const cloud = (overrides: Partial<CloudSongList> = {}): CloudSongList => ({
  id: 'c1',
  name: '云端歌单',
  describe: '描述',
  cover: 'https://example.com/cover.jpg',
  localId: '',
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...overrides
})

describe('cloud playlist merge', () => {
  it('lists cloud playlists that have no local counterpart', () => {
    const result = mergeCloudPlaylists([], [cloud()])
    expect(result.cloudOnly).toEqual([
      {
        id: 'c1',
        name: '云端歌单',
        description: '描述',
        cover: 'https://example.com/cover.jpg',
        updatedAt: '2026-10-20T00:00:00.000Z'
      }
    ])
    expect(result.links).toEqual([])
  })

  it('hides cloud copies of playlists already present locally', () => {
    // 本地这条已经认领了 cloudId，再列一份云端条目会让同一个歌单出现两次。
    const result = mergeCloudPlaylists([{ id: 'p1', cloudId: 'c1' }], [cloud()])
    expect(result.cloudOnly).toEqual([])
  })

  it('relinks a cloud record to its local playlist instead of duplicating it', () => {
    // 旧版本上传后没把 cloudId 写回本地：本地缺关联，但云端记着 localId。
    const result = mergeCloudPlaylists([{ id: 'p1' }], [cloud({ localId: 'p1' })])
    expect(result.cloudOnly).toEqual([])
    expect(result.links).toEqual([{ localId: 'p1', cloudId: 'c1' }])
  })

  it('treats a cloud localId that no longer exists as cloud-only', () => {
    const result = mergeCloudPlaylists([{ id: 'p1' }], [cloud({ localId: 'deleted' })])
    expect(result.cloudOnly.map((item) => item.id)).toEqual(['c1'])
    expect(result.links).toEqual([])
  })

  it('keeps the first record when the cloud repeats an id', () => {
    // 重复 key 会让列表复用错节点：点开一张歌单却看到另一张的内容。
    const result = mergeCloudPlaylists(
      [],
      [cloud({ name: '第一份' }), cloud({ name: '重复的那份' })]
    )
    expect(result.cloudOnly).toHaveLength(1)
    expect(result.cloudOnly[0].name).toBe('第一份')
  })

  it('skips records without an id instead of rendering a keyless row', () => {
    const result = mergeCloudPlaylists([], [cloud({ id: '' }), cloud({ id: 'c2' })])
    expect(result.cloudOnly.map((item) => item.id)).toEqual(['c2'])
  })

  it('falls back to a readable name when the cloud name is missing', () => {
    const result = mergeCloudPlaylists([], [cloud({ name: '' })])
    expect(result.cloudOnly[0].name).toBe('未命名歌单')
  })

  it('survives a missing or malformed cloud response', () => {
    expect(mergeCloudPlaylists([{ id: 'p1' }], null).cloudOnly).toEqual([])
    expect(mergeCloudPlaylists([{ id: 'p1' }], undefined).cloudOnly).toEqual([])
    expect(
      mergeCloudPlaylists([{ id: 'p1' }], 'nope' as unknown as CloudSongList[]).cloudOnly
    ).toEqual([])
  })

  it('keeps local order untouched and only appends cloud extras', () => {
    const result = mergeCloudPlaylists(
      [{ id: 'p1', cloudId: 'c1' }, { id: 'p2' }],
      [cloud({ id: 'c1' }), cloud({ id: 'c2' }), cloud({ id: 'c3' })]
    )
    expect(result.cloudOnly.map((item) => item.id)).toEqual(['c2', 'c3'])
  })
})

describe('cloud playlist routing', () => {
  it('round-trips a cloud id through the route prefix', () => {
    expect(cloudPlaylistIdFromRoute(cloudPlaylistKey('c1'))).toBe('c1')
  })

  it('ignores local and remote playlist ids', () => {
    expect(cloudPlaylistIdFromRoute('playlist-abc')).toBeNull()
    expect(cloudPlaylistIdFromRoute('remote-wy-123')).toBeNull()
    expect(cloudPlaylistIdFromRoute('')).toBeNull()
  })

  it('rejects the bare prefix so it cannot open an empty playlist', () => {
    expect(cloudPlaylistIdFromRoute('cloud-')).toBeNull()
  })
})
