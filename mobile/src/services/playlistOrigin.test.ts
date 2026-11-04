import { describe, expect, it } from 'vitest'
import { canSyncPlaylist, remotePlaylistOrigin } from './playlistOrigin'

/**
 * 远程歌单保存到本地后的「来源」记录，对齐桌面 `views/music/list.vue` 的
 * `handleSaveToLocal` / `handleSyncPlaylist`：
 *
 * ```ts
 * songListAPI.create(name, desc, source, { playlistId, source, isLeaderboard })
 * ...
 * const detailResult = await requestSdk('getPlaylistDetail', { source, id: playlistId })
 * ```
 *
 * 桌面把 `playlistId` + `source` 记在歌单 meta 上，于是本地歌单能「同步歌单」：
 * 重新拉一遍平台歌单，把新歌追加进来（重复的跳过）。移动端保存到本地时
 * **没有记录任何来源**——存下来的只是一份静态快照，平台歌单后来加歌，
 * 用户只能删掉重存（连带丢失自定义封面与排序）。
 */

describe('remotePlaylistOrigin', () => {
  it('records the source, provider and remote id of a plugin playlist', () => {
    expect(
      remotePlaylistOrigin({
        pluginKey: 'plugin-a',
        source: 'wy',
        providerId: 'wy',
        remoteId: '12345',
        kind: 'playlist'
      })
    ).toEqual({
      source: 'plugin',
      pluginKey: 'plugin-a',
      providerId: 'wy',
      remoteId: '12345'
    })
  })

  it('drops a missing remote id instead of storing an empty one', () => {
    // 空 id 会让「同步歌单」去请求一张不存在的歌单。
    expect(
      remotePlaylistOrigin({ pluginKey: 'p', source: 'wy', providerId: 'wy', remoteId: '', kind: 'playlist' })
        .remoteId
    ).toBeUndefined()
  })

  it('falls back to the source when a provider id is missing', () => {
    expect(
      remotePlaylistOrigin({ pluginKey: 'p', source: 'tx', providerId: '', remoteId: '9', kind: 'playlist' })
        .providerId
    ).toBe('tx')
  })
})

describe('canSyncPlaylist', () => {
  it('accepts a local playlist saved from a plugin playlist', () => {
    expect(
      canSyncPlaylist({
        id: 'p1',
        source: 'plugin',
        pluginKey: 'plugin-a',
        providerId: 'wy',
        remoteId: '12345'
      })
    ).toBe(true)
  })

  it('refuses a purely local playlist', () => {
    expect(canSyncPlaylist({ id: 'p1', source: 'local' })).toBe(false)
  })

  it('refuses a plugin playlist whose source is no longer installed', () => {
    // 记录里有 pluginKey 但插件已卸载：同步按钮只会点出「插件未启用」。
    expect(
      canSyncPlaylist({
        id: 'p1',
        source: 'plugin',
        pluginKey: 'gone',
        providerId: 'wy',
        remoteId: '1'
      }, ['other'])
    ).toBe(false)
  })

  it('refuses a record with no remote id', () => {
    expect(canSyncPlaylist({ id: 'p1', source: 'plugin', providerId: 'wy' })).toBe(false)
  })
})
