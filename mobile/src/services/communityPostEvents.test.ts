import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  onCommunityPostRemoved,
  publishCommunityPostRemoved,
  resetCommunityPostEvents
} from './communityPostEvents'

afterEach(() => resetCommunityPostEvents())

describe('community post removal bridge', () => {
  it('delivers the post id to every subscriber', () => {
    const first = vi.fn()
    const second = vi.fn()
    onCommunityPostRemoved(first)
    onCommunityPostRemoved(second)
    publishCommunityPostRemoved('post-1')
    expect(first).toHaveBeenCalledWith('post-1')
    expect(second).toHaveBeenCalledWith('post-1')
  })

  it('stops delivering after unsubscribe', () => {
    // 信息流卸载后必须停止收到事件，否则会在已销毁的组件上改状态。
    const listener = vi.fn()
    const off = onCommunityPostRemoved(listener)
    off()
    publishCommunityPostRemoved('post-1')
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps delivering to others when one subscriber throws', () => {
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    onCommunityPostRemoved(bad)
    onCommunityPostRemoved(good)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(() => publishCommunityPostRemoved('post-1')).not.toThrow()
    expect(good).toHaveBeenCalledWith('post-1')
    warn.mockRestore()
  })

  it('ignores empty or malformed ids instead of publishing a blank removal', () => {
    const listener = vi.fn()
    onCommunityPostRemoved(listener)
    publishCommunityPostRemoved('')
    publishCommunityPostRemoved('   ')
    publishCommunityPostRemoved(undefined as unknown as string)
    expect(listener).not.toHaveBeenCalled()
  })
})
