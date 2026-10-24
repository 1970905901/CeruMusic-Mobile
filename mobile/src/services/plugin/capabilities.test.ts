import { describe, expect, it } from 'vitest'
import { PERMISSION_GROUPS, permissionGroup } from '@shiqianjiang/ceru-plugin-sdk'
import { buildCapabilityList } from './runtime'

/**
 * 插件会先读 `capabilities.list` 里的 `permissionGroups`，再决定为自己要哪些权限。
 * 这张表一旦与真正执行的授权校验对不上，插件就会在「以为够用」之后被拒绝。
 */
const byService = (directoryPicking = true) =>
  new Map(buildCapabilityList(directoryPicking).map((entry) => [entry.service, entry]))

const groupNames = Object.keys(PERMISSION_GROUPS)

describe('plugin host capability table', () => {
  it('lists every service the host actually implements', () => {
    expect([...byService().keys()]).toEqual([
      'account',
      'app',
      'library',
      'player',
      'queue',
      'favorites',
      'history',
      'downloads',
      'files',
      'clipboard',
      'localMusic',
      'settings',
      'guests',
      'window',
      'hotkeys',
      'tasks',
      'ai',
      'sharing',
      'rooms',
      'sockets',
      'devices'
    ])
  })

  it('only uses permission group ids the SDK defines', () => {
    for (const entry of buildCapabilityList(true)) {
      for (const group of entry.permissionGroups) {
        expect(groupNames, `${entry.service} declares unknown group ${group}`).toContain(group)
      }
    }
  })

  it('declares the delete group on library, matching the delete-time check', () => {
    const library = byService().get('library')!
    expect(library.permissionGroups).toContain('libraryDelete')
    expect(library.methods).toEqual(
      expect.arrayContaining(['playlists.removeTracks', 'playlists.clearPlaylist'])
    )
  })

  it('declares the socket and private-network groups that connect requires', () => {
    const sockets = byService().get('sockets')!
    expect(sockets.permissionGroups).toEqual(['network', 'localNetwork'])
    // `network.private`（连内网）必须真的落在这两个组里。
    expect(permissionGroup('network.socket')).toBe('network')
    expect(permissionGroup('network.private')).toBe('localNetwork')
  })

  it('declares the guest group that every guest method is gated on', () => {
    expect(byService().get('guests')!.permissionGroups).toEqual(['guestPlugins'])
    expect(permissionGroup('guests.manage')).toBe('guestPlugins')
    expect(permissionGroup('guests.run')).toBe('guestPlugins')
  })

  it('groups match the permission each method actually demands', () => {
    const expectGroup = (service: string, method: string, group: string) => {
      expect(byService().get(service)!.permissionGroups, `${service}.${method}`).toContain(group)
    }
    // 与 runtime 里 requirePermission(...) 的第二参数逐条对照。
    expect(expectGroup('library', 'playlists.list', 'libraryRead')).toBeUndefined()
    expect(expectGroup('library', 'playlists.import', 'libraryManage')).toBeUndefined()
    expect(expectGroup('library', 'playlists.removeTracks', 'libraryDelete')).toBeUndefined()
    expect(expectGroup('player', 'getState', 'playbackRead')).toBeUndefined()
    expect(expectGroup('player', 'play', 'playbackControl')).toBeUndefined()
    expect(expectGroup('favorites', 'contains', 'libraryRead')).toBeUndefined()
    expect(expectGroup('favorites', 'add', 'libraryManage')).toBeUndefined()
    expect(expectGroup('downloads', 'create', 'downloads')).toBeUndefined()
    expect(expectGroup('settings', 'get', 'settingsRead')).toBeUndefined()
    expect(expectGroup('settings', 'update', 'settingsWrite')).toBeUndefined()
    expect(expectGroup('clipboard', 'readText', 'clipboardRead')).toBeUndefined()
    expect(expectGroup('clipboard', 'writeText', 'clipboardWrite')).toBeUndefined()
    expect(expectGroup('rooms', 'getState', 'roomsRead')).toBeUndefined()
    expect(expectGroup('rooms', 'join', 'roomsControl')).toBeUndefined()
    expect(expectGroup('tasks', 'schedule', 'background')).toBeUndefined()
    expect(expectGroup('ai', 'generate', 'ai')).toBeUndefined()
    expect(expectGroup('devices', 'select', 'devices')).toBeUndefined()
  })

  it('marks window unsupported instead of advertising a service it refuses to run', () => {
    const window = byService().get('window')!
    expect(window.available).toBe(false)
    expect(window.reason).toBe('unsupported')
  })

  it('marks hotkeys unsupported so plugins do not plan around a missing host RPC', () => {
    // worker 里的 `hotkeys.register` 直接抛「移动端不支持桌面快捷键」，
    // 宿主也没有对应 RPC；标成可用只会在真调用时失败。
    const hotkeys = byService().get('hotkeys')!
    expect(hotkeys.available).toBe(false)
    expect(hotkeys.reason).toBe('unsupported')
    expect(hotkeys.methods).toEqual(['register'])
    expect(hotkeys.permissionGroups).toEqual(['hotkeys'])
  })

  it('only advertises directory picking where a directory handle can survive', () => {
    expect(byService(true).get('files')!.methods).toContain('pickDirectory')
    expect(byService(false).get('files')!.methods).not.toContain('pickDirectory')
    // 其它方法在两种平台上都应保留：没有 pickDirectory 不代表不能读写用户选的文件。
    expect(byService(false).get('files')!.methods).toEqual(
      expect.arrayContaining(['pick', 'readText', 'readBase64', 'saveText', 'writeText'])
    )
  })
})
