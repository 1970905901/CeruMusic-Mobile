import { describe, expect, it } from 'vitest'
import { candidatePlaylists, resolvePickedPlaylist, type HostPlaylistRow } from './pluginPlaylistPicker'

/**
 * `ui.dialogs.pickPlaylist(request)` 的 `location` / `writable` 是 SDK 契约的一部分。
 *
 * 移动端此前一律只列本地歌单，还忽略了 `writable` 过滤：插件要选「一张可以
 * 写进去的云歌单」时，用户看到的是本地列表，选完之后导入自然落到别的地方。
 */

function row(id: string, location: 'local' | 'cloud', writable = true): HostPlaylistRow {
  return { ref: { id, location }, name: id, trackCount: 0, writable }
}

describe('playlist picker candidates', () => {
  it('only offers local playlists for a local request', () => {
    // 云端清单要发网络请求，没被要求时就不该拉。
    expect(candidatePlaylists({ location: 'local', local: [row('a', 'local')], cloud: [] })).toEqual([
      row('a', 'local')
    ])
  })

  it('offers cloud playlists and marks their location when asked', () => {
    const candidates = candidatePlaylists({
      location: 'cloud',
      local: [row('a', 'local')],
      cloud: [row('c', 'cloud')]
    })
    expect(candidates.map((item) => item.ref.location)).toEqual(['local', 'cloud'])
    expect(candidates[1].ref.id).toBe('c')
  })

  it('filters out read-only targets when the plugin needs a writable one', () => {
    expect(
      candidatePlaylists({
        location: 'cloud',
        writable: true,
        local: [row('a', 'local')],
        cloud: [row('c', 'cloud', false), row('d', 'cloud', true)]
      }).map((item) => item.ref.id)
    ).toEqual(['a', 'd'])
  })

  it('defaults to local and keeps read-only entries when writable is not requested', () => {
    const candidates = candidatePlaylists({
      local: [row('a', 'local', false)],
      cloud: []
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0].ref.location).toBe('local')
  })
})

describe('picked playlist result', () => {
  it('returns the LibraryPlaylist shape the SDK declares', () => {
    // `ref` + `writable` 必填：此前只回 `{ id, name }`，插件解构 `ref.id` 会拿到 undefined。
    const picked = resolvePickedPlaylist({ selected: row('a', 'local') })
    expect(picked).toEqual(row('a', 'local'))
    expect(picked?.ref).toEqual({ id: 'a', location: 'local' })
  })

  it('returns null when the user cancels', () => {
    expect(resolvePickedPlaylist({})).toBeNull()
  })
})
