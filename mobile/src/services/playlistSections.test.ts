import { describe, expect, it } from 'vitest'
import { collectPlaylistSections } from './playlistSections'
import type { PluginRecord } from '@/types/plugin'

/**
 * 桌面 `pluginState.playlistSections` 有两条约束移动端此前都没做：
 * 只接受 `kind: 'native'` 的 Surface（栏目要嵌进歌单页自己的布局），并按
 * `order` 排序。移动端只要声明了 view 就列一个按钮，web Surface 点开是一个
 * 与歌单页无关的整页，而且声明顺序被当成了展示顺序。
 */
function plugin(
  key: string,
  name: string,
  sections: Array<{ id: string; title: string; view: string; order?: number }>,
  surfaces: Array<{ id: string; kind: 'native' | 'web' | 'schema' }>
): PluginRecord {
  return {
    key,
    enabled: true,
    manifest: {
      id: 'com.example.' + key,
      name,
      version: '1.0.0',
      manifestVersion: 2,
      modules: {
        surfaces: surfaces.map((surface) => ({ ...surface, entry: surface.id }))
      },
      contributes: { playlistSections: sections }
    }
  } as PluginRecord
}

describe('playlist sections', () => {
  it('only accepts native surfaces', () => {
    const entries = collectPlaylistSections([
      plugin(
        'a',
        'A',
        [
          { id: 'native-one', title: '原生', view: 'native-one' },
          { id: 'web-one', title: '网页', view: 'web-one' }
        ],
        [
          { id: 'native-one', kind: 'native' },
          { id: 'web-one', kind: 'web' }
        ]
      )
    ])
    expect(entries.map((entry) => entry.id)).toEqual(['native-one'])
  })

  it('drops sections whose surface is not declared at all', () => {
    const entries = collectPlaylistSections([
      plugin('a', 'A', [{ id: 'ghost', title: '幽灵', view: 'ghost' }], [])
    ])
    expect(entries).toEqual([])
  })

  it('sorts by order before anything else', () => {
    const entries = collectPlaylistSections([
      plugin('a', 'A', [{ id: 'late', title: 'Later', view: 'late', order: 5 }], [{ id: 'late', kind: 'native' }]),
      plugin('b', 'B', [{ id: 'early', title: 'Earlier', view: 'early', order: 1 }], [{ id: 'early', kind: 'native' }])
    ])
    expect(entries.map((entry) => entry.id)).toEqual(['early', 'late'])
  })

  it('builds a stable key from plugin and section id', () => {
    const [entry] = collectPlaylistSections([
      plugin('a', 'A', [{ id: 'x', title: 'X', view: 'x' }], [{ id: 'x', kind: 'native' }])
    ])
    expect(entry.key).toBe(JSON.stringify(['a', 'x']))
  })

  it('skips disabled plugins', () => {
    const record = plugin(
      'a',
      'A',
      [{ id: 'x', title: 'X', view: 'x' }],
      [{ id: 'x', kind: 'native' }]
    )
    record.enabled = false
    expect(collectPlaylistSections([record])).toEqual([])
  })
})
