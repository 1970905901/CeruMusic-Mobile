import { describe, expect, it } from 'vitest'
import { isAudioContentType, notAudioMessage } from './downloadContentType'

describe('download content type', () => {
  it('accepts audio types, ignoring parameters', () => {
    expect(isAudioContentType('audio/mpeg')).toBe(true)
    expect(isAudioContentType('audio/flac')).toBe(true)
    expect(isAudioContentType('AUDIO/MPEG; charset=binary')).toBe(true)
  })

  it('accepts generic binary because many direct links send it', () => {
    // 误拦这些会让正常下载失败——音频直链经常只给 octet-stream。
    expect(isAudioContentType('application/octet-stream')).toBe(true)
    expect(isAudioContentType('binary/octet-stream')).toBe(true)
    expect(isAudioContentType('application/ogg')).toBe(true)
    expect(isAudioContentType('application/mp4')).toBe(true)
  })

  it('accepts a missing type', () => {
    expect(isAudioContentType('')).toBe(true)
    expect(isAudioContentType(undefined)).toBe(true)
    expect(isAudioContentType(null)).toBe(true)
  })

  it('rejects the error-page types that used to be saved as mp3', () => {
    // 鉴权过期时的 HTML 登录页、CDN 的 JSON 错误体。
    expect(isAudioContentType('text/html; charset=utf-8')).toBe(false)
    expect(isAudioContentType('application/json')).toBe(false)
    expect(isAudioContentType('image/jpeg')).toBe(false)
  })

  it('strips parameters from the message so it stays readable', () => {
    expect(notAudioMessage('text/html; charset=utf-8')).toBe(
      '下载内容不是音频（text/html），请检查音源是否可用'
    )
  })
})
