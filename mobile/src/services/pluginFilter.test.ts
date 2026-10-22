import { describe, expect, it } from 'vitest'
import { filterPlugins, hasActivePluginFilter, pluginSearchText } from './pluginFilter'

const make = (overrides: Record<string, any> = {}) =>
  ({
    key: overrides.key ?? 'p',
    enabled: overrides.enabled ?? true,
    fileName: overrides.fileName ?? 'plugin.js',
    manifest: {
      name: overrides.name ?? '网易云音源',
      author: overrides.author ?? '某人',
      description: overrides.description ?? '',
      contributes: {
        providers: (overrides.providers ?? [{ id: 'netease', name: '网易云' }])
      }
    },
    ...(overrides.lastError ? { lastError: overrides.lastError } : {})
  }) as any

describe('plugin search text', () => {
  it('includes name, author, description, file name and source names', () => {
    // 桌面版允许按音源名搜索；文件名便于定位自己导入的那个构建。
    const text = pluginSearchText(
      make({ name: '聚合音源', author: '老王', description: '整合多家', fileName: 'agg.js' })
    )
    expect(text).toContain('聚合音源')
    expect(text).toContain('老王')
    expect(text).toContain('整合多家')
    expect(text).toContain('agg.js')
    expect(text).toContain('网易云')
  })
})

describe('plugin filtering', () => {
  const enabled = make({ key: 'a', enabled: true, name: '网易云音源' })
  const disabled = make({
    key: 'b',
    enabled: false,
    name: 'QQ 音源',
    providers: [{ id: 'qq', name: 'QQ 音乐' }]
  })
  const all = [enabled, disabled]

  it('returns everything with no query and no status filter', () => {
    expect(filterPlugins(all, '', 'all').map((p) => p.key)).toEqual(['a', 'b'])
  })

  it('filters by enabled state', () => {
    expect(filterPlugins(all, '', 'enabled').map((p) => p.key)).toEqual(['a'])
    expect(filterPlugins(all, '', 'disabled').map((p) => p.key)).toEqual(['b'])
  })

  it('matches case-insensitively on any searchable field', () => {
    expect(filterPlugins(all, 'QQ', 'all').map((p) => p.key)).toEqual(['b'])
    expect(filterPlugins(all, 'qq 音乐', 'all').map((p) => p.key)).toEqual(['b'])
  })

  it('requires every term to match', () => {
    expect(filterPlugins(all, '网易 云', 'all').map((p) => p.key)).toEqual(['a'])
    expect(filterPlugins(all, '网易 qq', 'all')).toEqual([])
  })

  it('combines query and status', () => {
    expect(filterPlugins(all, 'QQ', 'enabled')).toEqual([])
  })

  it('finds a plugin by its contributor source name', () => {
    expect(filterPlugins(all, '网易云', 'all').map((p) => p.key)).toEqual(['a'])
  })
})

describe('active filter detection', () => {
  it('reports a query or a narrowing status as active', () => {
    expect(hasActivePluginFilter('qq', 'all', 3, 1)).toBe(true)
    expect(hasActivePluginFilter('', 'enabled', 3, 1)).toBe(true)
  })

  it('is not active for a blank query and no narrowing', () => {
    // 空查询 + 全部状态时不该显示「清除筛选」。
    expect(hasActivePluginFilter('   ', 'all', 3, 3)).toBe(false)
  })
})
