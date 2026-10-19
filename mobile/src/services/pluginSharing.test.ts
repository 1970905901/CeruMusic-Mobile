import { describe, expect, it } from 'vitest'
import {
  createShareDescriptor,
  readShareDescriptor,
  shareDescriptorFromUrl
} from '@/services/pluginSharing'

const ref = { pluginId: 'plugin.test', providerId: 'test', kind: 'track', id: '42' }

describe('plugin sharing', () => {
  it('creates stable data-only app links', () => {
    const first = createShareDescriptor({ track: ref, title: 'Song', artists: ['Artist'] })
    const second = createShareDescriptor({ track: ref, title: 'Song', artists: ['Artist'] })
    expect(first).toEqual(second)
    expect(first.id.startsWith('v2_')).toBe(true)
    expect(first.url.startsWith('cerumusic://share/v2_')).toBe(true)
    expect(first.template).toContain('Song')
  })

  it('round-trips and resolves links', () => {
    const created = createShareDescriptor({ track: ref, title: 'Song', artists: ['Artist'] })
    const read = shareDescriptorFromUrl(created.url)
    expect(read).toEqual(readShareDescriptor(created.id))
    expect(read.track).toEqual(ref)
    expect(read.title).toBe('Song')
    expect(read.artists).toEqual(['Artist'])
  })

  it('rejects invalid descriptors', () => {
    expect(() => createShareDescriptor({ track: { kind: 'playlist' }, title: 'x' })).toThrow()
    expect(() => readShareDescriptor('bad')).toThrow('分享链接格式错误')
    expect(() => shareDescriptorFromUrl('https://example.com/share/v2_x')).toThrow(
      '不是澜音分享链接'
    )
  })
})
