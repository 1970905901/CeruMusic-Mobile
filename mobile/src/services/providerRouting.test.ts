import { describe, expect, it } from 'vitest'
import { describeSourceRouting, summarizeSourceRouting } from './providerRouting'

const source = {
  id: 'wy',
  name: '网易云',
  implementations: [
    { pluginKey: 'p1', pluginName: '插件一' },
    { pluginKey: 'p2', pluginName: '插件二' }
  ]
}

describe('describeSourceRouting', () => {
  it('reports the explicit selection', () => {
    const view = describeSourceRouting(source, 'p2')
    expect(view.current?.pluginKey).toBe('p2')
    expect(view.subtitle).toBe('当前使用 插件二')
    expect(view.hasChoice).toBe(true)
  })

  it('reports automatic selection when nothing is chosen', () => {
    expect(describeSourceRouting(source, undefined).subtitle).toBe('自动（插件一）')
    expect(describeSourceRouting(source, '').subtitle).toBe('自动（插件一）')
  })

  it('falls back to automatic when the saved plugin is gone', () => {
    const view = describeSourceRouting(source, 'uninstalled')
    expect(view.current?.pluginKey).toBe('p1')
    expect(view.subtitle).toBe('自动（插件一）')
  })

  it('marks single-implementation and empty sources', () => {
    const single = describeSourceRouting(
      { id: 'tx', name: 'QQ', implementations: [{ pluginKey: 'p1', pluginName: '插件一' }] },
      undefined
    )
    expect(single.hasChoice).toBe(false)
    expect(single.subtitle).toBe('自动（插件一）')

    const empty = describeSourceRouting({ id: 'none', name: '空', implementations: [] }, 'p1')
    expect(empty.current).toBeUndefined()
    expect(empty.subtitle).toBe('没有可用实现')
  })
})

describe('summarizeSourceRouting', () => {
  it('summarises switchable sources', () => {
    const views = [
      describeSourceRouting(source, undefined),
      describeSourceRouting(
        { id: 'tx', name: 'QQ', implementations: [{ pluginKey: 'p1', pluginName: '插件一' }] },
        undefined
      )
    ]
    expect(summarizeSourceRouting(views)).toBe('1 个音源可切换实现')
  })

  it('handles single-implementation-only and empty lists', () => {
    expect(
      summarizeSourceRouting([
        describeSourceRouting(
          { id: 'tx', name: 'QQ', implementations: [{ pluginKey: 'p1', pluginName: '插件一' }] },
          undefined
        )
      ])
    ).toBe('1 个音源，均只有唯一实现')
    expect(summarizeSourceRouting([])).toBe('还没有可路由的音源')
  })
})