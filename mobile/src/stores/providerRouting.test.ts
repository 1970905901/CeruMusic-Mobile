import { describe, expect, it } from 'vitest'
import { pickProviderByProtocol } from './plugins'

type Entry = { providerId: string; protocols: string[]; pluginKey: string }

const providers: Entry[] = [
  { providerId: 'wy', protocols: ['track', 'playlist'], pluginKey: 'plugin-a' },
  { providerId: 'wy', protocols: ['track'], pluginKey: 'plugin-b' },
  { providerId: 'tx', protocols: ['playlist'], pluginKey: 'plugin-c' }
]

describe('provider routing by protocol', () => {
  it('only considers providers that declare the protocol', () => {
    const picked = pickProviderByProtocol(providers, 'playlist')
    expect(picked?.pluginKey).toBe('plugin-a')
  })

  it('returns undefined instead of falling back to an unrelated provider', () => {
    expect(pickProviderByProtocol(providers, 'lyrics')).toBeUndefined()
    expect(pickProviderByProtocol([], 'track')).toBeUndefined()
  })

  it('honours the user-selected plugin owner for the same provider id', () => {
    const picked = pickProviderByProtocol(providers, 'track', 'wy', () => 'plugin-b')
    expect(picked?.pluginKey).toBe('plugin-b')
  })

  it('ignores an owner selection that does not support the protocol', () => {
    // plugin-c 只有 playlist，请求 track 时必须跳过它而不是硬塞。
    const picked = pickProviderByProtocol(providers, 'track', 'tx', () => 'plugin-c')
    expect(picked?.pluginKey).toBe('plugin-a')
  })

  it('falls back to the first matching implementation when no owner is configured', () => {
    const picked = pickProviderByProtocol(providers, 'track', 'wy')
    expect(picked?.pluginKey).toBe('plugin-a')
  })

  it('does not let a preferred source override the protocol filter', () => {
    const picked = pickProviderByProtocol(providers, 'playlist', 'wy', () => 'plugin-b')
    // plugin-b 不声明 playlist，因此退回唯一匹配项 plugin-a。
    expect(picked?.pluginKey).toBe('plugin-a')
  })
})
