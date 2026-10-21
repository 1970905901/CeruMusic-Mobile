import { describe, expect, it, vi } from 'vitest'

/**
 * 尾巴链的接入条件：
 * - 主链尚未建立（音源是跨域直链）时不得接尾巴链，否则会把旧歌静音；
 * - 非 blob/data 音源同样不接。
 */
describe('tail effect chain guard', () => {
  it('refuses to build when the main chain is inactive', async () => {
    vi.resetModules()
    const mod = await import('./audioEffects')
    const tail = { currentSrc: 'blob:https://x/1', src: 'blob:https://x/1' } as any
    expect(mod.ensureTailEffectChain(tail)).toBe(false)
  })

  it('refuses cross-origin sources even if called again', async () => {
    vi.resetModules()
    const mod = await import('./audioEffects')
    const tail = { currentSrc: 'https://cdn.example.com/a.mp3', src: 'https://cdn.example.com/a.mp3' } as any
    expect(mod.ensureTailEffectChain(tail)).toBe(false)
  })

  it('release is a no-op when nothing was built', async () => {
    vi.resetModules()
    const mod = await import('./audioEffects')
    expect(() => mod.releaseTailEffectChain()).not.toThrow()
  })
})
