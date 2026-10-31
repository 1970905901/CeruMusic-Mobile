import { describe, expect, it } from 'vitest'
import { collectPlaylistTags } from './playlistTags'

/**
 * 插件用 `playlists.categories` 返回平铺标签，靠 `extensions.group` 归组、
 * `extensions.hot` 标记热门（桌面 `getPlaylistTags` 同口径）。移动端此前把这些
 * 标签当卡片平铺，既没有「热门」入口也看不出分组。
 */
function tag(id: string, name: string, extensions: Record<string, any> = {}): any {
  return { ref: { id, kind: 'playlist-category' }, title: name, extensions }
}

describe('playlist tag catalog', () => {
  it('groups tags and keeps the plugin order', () => {
    const catalog = collectPlaylistTags([
      tag('pop', '流行', { group: '风格' }),
      tag('rock', '摇滚', { group: '风格' }),
      tag('morning', '早晨', { group: '场景' })
    ])
    expect(catalog.groups.map((group) => group.name)).toEqual(['风格', '场景'])
    expect(catalog.groups[0].list.map((item) => item.name)).toEqual(['流行', '摇滚'])
  })

  it('collects hot tags separately without dropping them from groups', () => {
    const catalog = collectPlaylistTags([
      tag('hot-pop', '流行', { group: '风格', hot: true }),
      tag('rock', '摇滚', { group: '风格' })
    ])
    expect(catalog.hot.map((item) => item.id)).toEqual(['hot-pop'])
    expect(catalog.groups[0].list).toHaveLength(2)
  })

  it('falls back to a default group name when extensions are missing', () => {
    // 插件不分组时，所有标签进同一个「分类」，而不是每一条一个组。
    const catalog = collectPlaylistTags([tag('a', 'A'), tag('b', 'B')])
    expect(catalog.groups).toHaveLength(1)
    expect(catalog.groups[0].name).toBe('分类')
    expect(catalog.groups[0].list).toHaveLength(2)
  })

  it('dedupes an id appearing twice in the list', () => {
    const catalog = collectPlaylistTags([tag('a', 'A'), tag('a', 'A')])
    expect(catalog.all).toHaveLength(1)
    expect(catalog.groups[0].list).toHaveLength(1)
  })

  it('skips entries with no id or no title', () => {
    // 点开一张没有 ID 的标签只会得到空列表。
    const catalog = collectPlaylistTags([tag('', '无名'), tag('b', '  '), tag('c', 'C')])
    expect(catalog.all.map((item) => item.id)).toEqual(['c'])
  })

  it('tolerates a non-array payload', () => {
    expect(collectPlaylistTags(undefined)).toEqual({ groups: [], hot: [], all: [] })
    expect(collectPlaylistTags(null as any)).toEqual({ groups: [], hot: [], all: [] })
  })
})
