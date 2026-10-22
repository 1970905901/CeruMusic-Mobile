import { describe, expect, it } from 'vitest'
import { assertOwnedRefs, checkOwnedRef } from './ownership'

const context = {
  manifestId: 'com.example.source',
  manifest: {
    id: 'com.example.source',
    contributes: { providers: [{ id: 'wy' }, { id: 'tx' }] }
  }
}

const ref = (overrides: Record<string, unknown> = {}) => ({
  kind: 'track',
  providerId: 'wy',
  id: '123',
  ...overrides
})

describe('plugin resource ownership', () => {
  it('accepts a public provider-scoped track', () => {
    // 公共 provider 资源可以省略 pluginId——SDK 注释明确允许。
    expect(checkOwnedRef(ref(), 'track', context)).toBeNull()
  })

  it('accepts a private resource tagged with the same plugin', () => {
    expect(checkOwnedRef(ref({ pluginId: 'com.example.source' }), 'track', context)).toBeNull()
  })

  it('rejects a ref belonging to another plugin', () => {
    // 否则任何插件都能把别的插件的私有歌曲推进播放队列。
    expect(checkOwnedRef(ref({ pluginId: 'com.other' }), 'track', context)).toContain('自己声明的资源')
  })

  it('rejects a provider the plugin does not declare', () => {
    expect(checkOwnedRef(ref({ providerId: 'kg' }), 'track', context)).toContain('自己声明的资源')
  })

  it('rejects a mismatched kind', () => {
    expect(checkOwnedRef(ref({ kind: 'playlist' }), 'track', context)).toContain('自己声明的资源')
  })

  it('rejects malformed refs instead of crashing', () => {
    expect(checkOwnedRef(null, 'track', context)).not.toBeNull()
    expect(checkOwnedRef('track', 'track', context)).not.toBeNull()
    expect(checkOwnedRef(ref({ id: '' }), 'track', context)).not.toBeNull()
    expect(checkOwnedRef(ref({ providerId: 42 }), 'track', context)).not.toBeNull()
  })

  it('treats a manifest without providers as owning nothing', () => {
    expect(checkOwnedRef(ref(), 'track', { manifestId: 'x', manifest: {} })).not.toBeNull()
    expect(checkOwnedRef(ref(), 'track', { manifestId: 'x', manifest: null })).not.toBeNull()
  })

  it('throws on the first offending ref in a batch', () => {
    expect(() =>
      assertOwnedRefs([ref(), ref({ providerId: 'nope' })], 'track', context)
    ).toThrow('自己声明的资源')
    expect(() => assertOwnedRefs([ref(), ref({ id: '456' })], 'track', context)).not.toThrow()
  })
})
