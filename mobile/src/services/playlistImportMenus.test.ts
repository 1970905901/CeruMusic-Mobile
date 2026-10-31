import { describe, expect, it } from 'vitest'
import { collectPlaylistImportMenus } from './playlistImportMenus'
import type { PluginRecord } from '@/types/plugin'

/**
 * `playlist.import` 菜单项：插件在宿主「选择导入方式」面板里加的入口。
 *
 * 移动端此前完全没有消费这个 slot——插件声明了入口，用户在手机上永远看不到，
 * 桌面版却能直接点开。这里把「哪些入口该出现」钉住。
 */
function plugin(overrides: Partial<PluginRecord> = {}): PluginRecord {
  return {
    key: 'plugin-a',
    enabled: true,
    manifest: {
      id: 'com.example.a',
      name: '示例音源',
      version: '1.0.0',
      manifestVersion: 2,
      contributes: {
        commands: [{ id: 'import-cmd', title: '导入歌单', action: 'playlist.import' }],
        menus: [
          { id: 'import-menu', slot: 'playlist.import', title: '从示例站导入', commandId: 'import-cmd' }
        ],
        playlistImporters: [{ id: 'import-menu', title: '示例站' }]
      }
    } as any,
    ...overrides
  } as PluginRecord
}

describe('playlist import menus', () => {
  it('exposes a declared playlist.import menu', () => {
    const entries = collectPlaylistImportMenus([plugin()], {
      runtimeInfo: { 'plugin-a': { providers: [], actions: ['playlist.import'], importers: ['import-menu'], converters: [] } }
    })
    expect(entries).toHaveLength(1)
    expect(entries[0].title).toBe('从示例站导入')
    expect(entries[0].action).toBe('playlist.import')
    expect(entries[0].importerId).toBe('import-menu')
  })

  it('ignores menus on other slots', () => {
    const p = plugin()
    p.manifest.contributes!.menus = [
      { id: 'track-menu', slot: 'track.actions', title: '歌曲菜单', commandId: 'import-cmd' }
    ]
    expect(collectPlaylistImportMenus([p], { authenticated: true })).toEqual([])
  })

  it('drops a menu whose command is not registered at runtime', () => {
    // 声明了菜单却没注册 action（插件加载失败/降级）时不该出现一个点了报错的入口。
    const entries = collectPlaylistImportMenus([plugin()], {
      runtimeInfo: { 'plugin-a': { providers: [], actions: [], importers: [], converters: [] } }
    })
    expect(entries).toEqual([])
  })

  it('keeps the entry while runtime info is not reported yet', () => {
    // 插件刚启用、还没激活完成时没有 runtimeInfo；此时不该判死。
    expect(collectPlaylistImportMenus([plugin()])).toHaveLength(1)
  })

  it('honours when.loggedIn', () => {
    const p = plugin()
    p.manifest.contributes!.menus![0] = {
      ...p.manifest.contributes!.menus![0],
      when: { loggedIn: true }
    }
    expect(collectPlaylistImportMenus([p], { authenticated: false })).toEqual([])
    expect(collectPlaylistImportMenus([p], { authenticated: true })).toHaveLength(1)
  })

  it('ignores disabled plugins', () => {
    expect(collectPlaylistImportMenus([plugin({ enabled: false })])).toEqual([])
  })
})
