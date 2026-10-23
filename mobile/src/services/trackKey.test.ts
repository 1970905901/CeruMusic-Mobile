import { describe, expect, it } from 'vitest'
import { trackKeyFor } from './trackKey'

describe('track key', () => {
  it('keeps public provider resources free of any plugin prefix', () => {
    // 两个插件声明同一个 provider 时，指向的必须是同一首歌；带上插件前缀
    // 会让同一首歌从不同入口得到不同 key，队列里出现两条。
    expect(trackKeyFor({ providerId: 'wy', id: '42', scope: 'provider' }, 'plugin-a')).toBe('wy:42')
    expect(trackKeyFor({ providerId: 'wy', id: '42', scope: 'provider' }, 'plugin-b')).toBe('wy:42')
    expect(trackKeyFor({ providerId: 'wy', id: '42', scope: 'provider' })).toBe('wy:42')
  })

  it('scopes private resources by the plugin that owns them', () => {
    expect(trackKeyFor({ providerId: 'local', id: '7', scope: 'private' }, 'plugin-a')).toBe(
      'plugin-a:local:7'
    )
  })

  it('prefers the ref own pluginId over the caller hint', () => {
    // 私有资源的 pluginId 是资源的真实归属，调用方传的 pluginKey 只是兜底。
    expect(
      trackKeyFor({ pluginId: 'real-owner', providerId: 'local', id: '7', scope: 'private' }, 'hint')
    ).toBe('real-owner:local:7')
  })

  it('treats a missing scope as private, matching the historical behavior', () => {
    // 旧实现只有 `scope === 'provider'` 才省略前缀，其余一律带插件身份；
    // 这是插件私有资源的默认形态，不能悄悄改变。
    expect(trackKeyFor({ providerId: 'wy', id: '42' }, 'plugin-a')).toBe('plugin-a:wy:42')
  })

  it('does not throw on partial refs', () => {
    expect(trackKeyFor(null, 'plugin-a')).toBe('plugin-a::')
    expect(trackKeyFor({}, 'plugin-a')).toBe('plugin-a::')
  })
})
