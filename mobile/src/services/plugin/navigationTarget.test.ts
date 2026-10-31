import { describe, expect, it } from 'vitest'
import { playlistSectionPath } from './navigationTarget'

/**
 * `ui.navigation.open({ page: 'playlist', sectionId })` 必须落到插件自己声明的
 * 歌单栏目。移动端此前校验完 sectionId 就把它丢了，用户被带到歌单列表的默认视图。
 */
const manifest = {
  contributes: {
    playlistSections: [
      { id: 'daily', title: '每日推荐', view: 'sections/daily' },
      { id: 'no-view', title: '只有标题' }
    ]
  }
} as any

describe('playlist section navigation', () => {
  it('opens the plugin surface for a declared section', () => {
    expect(playlistSectionPath('plugin-key', manifest, 'daily')).toBe(
      '/plugin-surface/plugin-key/sections%2Fdaily'
    )
  })

  it('encodes the plugin key so slashes cannot escape the route', () => {
    expect(playlistSectionPath('a/b', manifest, 'daily')).toBe(
      '/plugin-surface/a%2Fb/sections%2Fdaily'
    )
  })

  it('returns null for an unknown section so the caller can fall back', () => {
    expect(playlistSectionPath('plugin-key', manifest, 'missing')).toBeNull()
  })

  it('returns null when the section declares no view', () => {
    // 目录页只能打开真实的 Surface；没有 view 的栏目没有可跳转的目标。
    expect(playlistSectionPath('plugin-key', manifest, 'no-view')).toBeNull()
  })

  it('returns null without a section id or manifest', () => {
    expect(playlistSectionPath('plugin-key', manifest, undefined)).toBeNull()
    expect(playlistSectionPath('plugin-key', null, 'daily')).toBeNull()
  })
})
