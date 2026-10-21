import { describe, expect, it } from 'vitest'
import {
  MOBILE_ROUTABLE_CAPABILITIES,
  buildCapabilityGroups,
  resolveCapabilityOwner
} from './capabilityRouting'

const sources = [
  {
    id: 'wy',
    name: '网易云',
    implementations: [
      { pluginKey: 'p1', pluginName: '插件一' },
      { pluginKey: 'p2', pluginName: '插件二' },
      { pluginKey: 'p3', pluginName: '无评论插件' }
    ]
  },
  {
    id: 'tx',
    name: 'QQ 音乐',
    implementations: [{ pluginKey: 'p1', pluginName: '插件一' }]
  }
]

const actions: Record<string, string[]> = {
  p1: ['comments.hot'],
  p2: ['comments.hot', 'comments.get'],
  p3: ['search']
}

describe('buildCapabilityGroups', () => {
  it('only lists capabilities that at least one implementation declares', () => {
    const groups = buildCapabilityGroups({ sources, actionsOf: (key) => actions[key] ?? [] })
    expect(groups.map((group) => group.source)).toEqual(['wy', 'tx'])
    expect(groups[0].rows.map((row) => row.capability)).toEqual([
      'action:comments.hot',
      'action:comments.get'
    ])
    // tx only has p1, which implements hot comments.
    expect(groups[1].rows.map((row) => row.capability)).toEqual(['action:comments.hot'])
  })

  it('marks a row selectable only when two or more plugins implement it', () => {
    const groups = buildCapabilityGroups({ sources, actionsOf: (key) => actions[key] ?? [] })
    const hot = groups[0].rows.find((row) => row.capability === 'action:comments.hot')!
    const latest = groups[0].rows.find((row) => row.capability === 'action:comments.get')!
    expect(hot.selectable).toBe(true)
    expect(hot.implementations.map((item) => item.pluginKey)).toEqual(['p1', 'p2'])
    expect(latest.selectable).toBe(false)
    expect(latest.implementations.map((item) => item.pluginKey)).toEqual(['p2'])
  })

  it('dedupes repeated providers from the same plugin', () => {
    const groups = buildCapabilityGroups({
      sources: [
        {
          id: 'wy',
          name: '网易云',
          implementations: [
            { pluginKey: 'p1', pluginName: '插件一' },
            { pluginKey: 'p1', pluginName: '插件一' }
          ]
        }
      ],
      actionsOf: () => ['comments.hot']
    })
    expect(groups[0].rows[0].implementations).toHaveLength(1)
    expect(groups[0].rows[0].selectable).toBe(false)
  })

  it('skips sources with no routable capability and tolerates unknown plugins', () => {
    const groups = buildCapabilityGroups({
      sources: [{ id: 'none', name: '空', implementations: [{ pluginKey: 'ghost', pluginName: 'x' }] }],
      actionsOf: (key) => actions[key] ?? []
    })
    expect(groups).toEqual([])
    expect(buildCapabilityGroups({ sources: [], actionsOf: () => [] })).toEqual([])
  })

  it('honours a custom capability list', () => {
    const groups = buildCapabilityGroups({
      sources,
      actionsOf: (key) => actions[key] ?? [],
      capabilities: [{ capability: 'action:comments.get', label: '最新', description: '', action: 'comments.get' }]
    })
    expect(groups[0].rows.map((row) => row.label)).toEqual(['最新'])
    expect(groups[1]).toBeUndefined()
  })
})

describe('resolveCapabilityOwner', () => {
  const implementations = [
    { pluginKey: 'p1', pluginName: '插件一' },
    { pluginKey: 'p2', pluginName: '插件二' }
  ]

  it('prefers an explicit valid selection', () => {
    expect(resolveCapabilityOwner(implementations, 'p2')?.pluginKey).toBe('p2')
  })

  it('falls back to the first implementation for empty or stale selections', () => {
    expect(resolveCapabilityOwner(implementations, '')?.pluginKey).toBe('p1')
    expect(resolveCapabilityOwner(implementations, undefined)?.pluginKey).toBe('p1')
    expect(resolveCapabilityOwner(implementations, 'uninstalled')?.pluginKey).toBe('p1')
    expect(resolveCapabilityOwner([], 'p1')).toBeUndefined()
  })
})

describe('mobile routable capability table', () => {
  it('only lists capabilities the mobile host actually consumes', () => {
    // The mobile comments path reads settings.capabilityOwner for these actions.
    expect(MOBILE_ROUTABLE_CAPABILITIES.map((item) => item.action)).toEqual([
      'comments.hot',
      'comments.get'
    ])
    expect(MOBILE_ROUTABLE_CAPABILITIES.every((item) => item.capability.startsWith('action:'))).toBe(
      true
    )
  })
})