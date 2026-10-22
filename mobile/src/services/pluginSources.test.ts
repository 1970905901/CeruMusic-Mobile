import { describe, expect, it } from 'vitest'
import { pluginSourceTags, summarizePluginSources } from './pluginSources'

const manifest = (providers: Array<{ id: string; name: string }>) =>
  ({ contributes: { providers } }) as any

describe('plugin source tags', () => {
  it('lists the declared provider names in order', () => {
    expect(
      pluginSourceTags(manifest([
        { id: 'netease', name: '网易云' },
        { id: 'qq', name: 'QQ 音乐' }
      ]))
    ).toEqual([
      { id: 'netease', name: '网易云' },
      { id: 'qq', name: 'QQ 音乐' }
    ])
  })

  it('falls back to the id when a provider has no name', () => {
    expect(pluginSourceTags(manifest([{ id: 'kugou', name: '' }]))).toEqual([
      { id: 'kugou', name: 'kugou' }
    ])
  })

  it('deduplicates the same provider id', () => {
    expect(
      pluginSourceTags(manifest([
        { id: 'a', name: 'A' },
        { id: 'a', name: 'A again' }
      ]))
    ).toEqual([{ id: 'a', name: 'A' }])
  })

  it('ignores entries without an id and handles a missing manifest', () => {
    expect(pluginSourceTags(manifest([{ id: '', name: 'x' }]))).toEqual([])
    expect(pluginSourceTags(undefined)).toEqual([])
    expect(pluginSourceTags({} as any)).toEqual([])
  })
})

describe('plugin source summary', () => {
  const many = manifest([
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D' },
    { id: 'e', name: 'E' }
  ])

  it('folds the extras into an overflow count', () => {
    // 十几个音源全铺开会把插件卡片撑得很乱。
    const summary = summarizePluginSources(many, 3)
    expect(summary.tags.map((tag) => tag.id)).toEqual(['a', 'b', 'c'])
    expect(summary.overflow).toBe(2)
    expect(summary.total).toBe(5)
  })

  it('shows everything when it fits', () => {
    const summary = summarizePluginSources(manifest([{ id: 'a', name: 'A' }]), 3)
    expect(summary).toEqual({ tags: [{ id: 'a', name: 'A' }], overflow: 0, total: 1 })
  })

  it('treats a zero or invalid limit as "show none"', () => {
    expect(summarizePluginSources(many, 0).tags).toEqual([])
    expect(summarizePluginSources(many, 0).overflow).toBe(5)
  })
})
