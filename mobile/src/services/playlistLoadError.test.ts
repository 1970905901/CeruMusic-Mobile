import { describe, expect, it } from 'vitest'
import { playlistLoadErrorMessage } from './playlistLoadError'

describe('playlist load error message', () => {
  it('points at the plugin list when no source plugin is usable', () => {
    // 音源层抛的是中文短句；用户照做（去设置里启用插件）就能修好，
    // 所以不能被兜底的「稍后重试」吞掉。
    expect(playlistLoadErrorMessage(new Error('音源插件未启用'))).toContain('安装并启用音源插件')
    expect(playlistLoadErrorMessage('请先安装并启用音源插件')).toContain('安装并启用音源插件')
  })

  it('explains permission failures instead of echoing the raw error', () => {
    expect(playlistLoadErrorMessage(new Error('permission denied'))).toContain('插件权限')
    expect(playlistLoadErrorMessage('未授权访问该音源')).toContain('插件权限')
  })

  it('prefers permission guidance over network wording when both appear', () => {
    // 未授权时插件往往也报连接失败；让用户先去授权才是能解决的那一步。
    expect(playlistLoadErrorMessage(new Error('network error: not authorized'))).toContain(
      '插件权限'
    )
  })

  it('asks the user to wait when the platform rate-limits', () => {
    expect(playlistLoadErrorMessage(new Error('HTTP 429 rate limit'))).toContain('稍等片刻')
    expect(playlistLoadErrorMessage(new Error('请求过于频繁'))).toContain('稍等片刻')
  })

  it('tells the user the playlist may be gone for 404-like failures', () => {
    expect(playlistLoadErrorMessage(new Error('404 not found'))).toContain('已公开')
    expect(playlistLoadErrorMessage(new Error('歌单不存在或已删除'))).toContain('已公开')
  })

  it('suggests checking the network for transport failures', () => {
    expect(playlistLoadErrorMessage(new Error('fetch failed'))).toContain('检查网络')
    expect(playlistLoadErrorMessage(new Error('请求超时'))).toContain('检查网络')
  })

  it('blames the source data when the plugin returns a broken shape', () => {
    expect(playlistLoadErrorMessage(new TypeError("Cannot read properties of undefined"))).toContain(
      '更换音源插件'
    )
    expect(playlistLoadErrorMessage(new Error('返回数据格式错误'))).toContain('更换音源插件')
  })

  it('falls back to a neutral hint rather than leaking internal text', () => {
    const message = playlistLoadErrorMessage(new Error('kaboom at line 3'))
    expect(message).toBe('这张歌单暂时无法加载，请稍后重试或更换音源插件。')
    expect(message).not.toContain('kaboom')
  })

  it('accepts thrown values that are not Error instances', () => {
    expect(playlistLoadErrorMessage('')).toBe('这张歌单暂时无法加载，请稍后重试或更换音源插件。')
    expect(playlistLoadErrorMessage(undefined)).toBe(
      '这张歌单暂时无法加载，请稍后重试或更换音源插件。'
    )
    expect(playlistLoadErrorMessage({ message: '请求超时' })).toContain('检查网络')
  })
})
