import { describe, expect, it } from 'vitest'
import { collectHomeSections } from './homeSections'
import type { PluginRecord } from '@/types/plugin'

/**
 * 桌面 `homeSections` 对 `playlists` / `charts` 这类内置 kind 只保留**一个**插件，
 * `custom` 不受限制。移动端此前把每个插件声明的栏目全列出来：两个插件都提供
 * 「每日推荐」时，首页出现两个几乎一样、内容却来自不同平台的栏目。
 */
function plugin(
  key: string,
  name: string,
  sections: Array<{ id: string; title: string; kind?: string; view?: string; order?: number }>,
  enabled = true
): PluginRecord {
  return {
    key,
    enabled,
    manifest: {
      id: 'com.example.' + key,
      name,
      version: '1.0.0',
      manifestVersion: 2,
      contributes: {
        homeSections: sections.map((section) => ({
          kind: 'custom',
          view: 'sections/' + section.id,
          ...section
        }))
      }
    }
  } as PluginRecord
}

describe('home sections', () => {
  it('keeps only one plugin per built-in kind', () => {
    const entries = collectHomeSections([
      plugin('a', 'A', [{ id: 'daily-a', title: '每日 A', kind: 'playlists' }]),
      plugin('b', 'B', [{ id: 'daily-b', title: '每日 B', kind: 'playlists' }])
    ])
    expect(entries).toHaveLength(1)
    // 没有用户选择时取排序最前的那个（这里插件名 A 在前）。
    expect(entries[0].pluginKey).toBe('a')
  })

  it('follows the user selection for a kind', () => {
    const entries = collectHomeSections(
      [
        plugin('a', 'A', [{ id: 'daily-a', title: '每日 A', kind: 'playlists' }]),
        plugin('b', 'B', [{ id: 'daily-b', title: '每日 B', kind: 'playlists' }])
      ],
      { selection: { 'home:playlists': 'b' } }
    )
    expect(entries.map((entry) => entry.pluginKey)).toEqual(['b'])
  })

  it('shows every custom section from every plugin', () => {
    // 自定义栏目是插件各自的内容，不参与「同 kind 只留一个」。
    const entries = collectHomeSections([
      plugin('a', 'A', [{ id: 'x', title: 'X' }]),
      plugin('b', 'B', [{ id: 'y', title: 'Y' }])
    ])
    expect(entries.map((entry) => entry.title).sort()).toEqual(['X', 'Y'])
  })

  it('skips sections without a view', () => {
    // 没有 view 的栏目要靠宿主原生界面渲染，移动端没有对应实现。
    const entries = collectHomeSections([
      plugin('a', 'A', [
        { id: 'native', title: '原生栏目', kind: 'charts', view: undefined }
      ])
    ])
    expect(entries).toEqual([])
  })

  it('skips disabled plugins and sorts by order', () => {
    const entries = collectHomeSections([
      plugin('off', 'Off', [{ id: 'o', title: 'O' }], false),
      plugin('later', 'Later', [{ id: 'l', title: 'L', order: 5 }]),
      plugin('first', 'First', [{ id: 'f', title: 'F', order: 1 }])
    ])
    expect(entries.map((entry) => entry.id)).toEqual(['f', 'l'])
  })
})
