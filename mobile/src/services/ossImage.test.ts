import { describe, expect, it } from 'vitest'
import { isOssUrl, ossImage, ossAvatar, ossCard, ossDetail } from './ossImage'

const OSS = 'https://cqoss.shiqianjiang.cn/a/b.webp'

/** 处理串整体经过 encode，断言前先解回可读形式。 */
function processOf(url: string): string {
  return decodeURIComponent(url.split('x-oss-process=')[1] ?? '')
}

describe('oss image', () => {
  it('detects project and aliyun OSS hosts only', () => {
    expect(isOssUrl(OSS)).toBe(true)
    expect(isOssUrl('https://bucket.oss-cn-hangzhou.aliyuncs.com/a.webp')).toBe(true)
    expect(isOssUrl('https://logto.example.com/avatar.png')).toBe(false)
    expect(isOssUrl('not a url')).toBe(false)
  })

  it('leaves non-OSS and empty inputs untouched', () => {
    expect(ossImage('')).toBe('')
    expect(ossImage(null)).toBe('')
    expect(ossImage('https://example.com/a.jpg', { w: 640 })).toBe('https://example.com/a.jpg')
    expect(ossImage(OSS)).toBe(OSS)
  })

  it('encodes the whole process string so slashes survive proxies', () => {
    const url = ossImage(OSS, { w: 640, q: 80, format: 'webp' })
    expect(url.split('x-oss-process=')[1]).not.toContain('/')
    expect(processOf(url)).toBe('image/resize,w_640,m_lfit/quality,q_80/format,webp')
  })

  it('appends with & when the source already has a query', () => {
    const url = ossImage('https://cqoss.shiqianjiang.cn/a.webp?t=1', { w: 120 })
    expect(url).toContain('?t=1&x-oss-process=')
  })

  it('exposes the same presets as desktop', () => {
    expect(processOf(ossCard(OSS))).toContain('resize,w_640,m_lfit')
    expect(processOf(ossDetail(OSS))).toContain('resize,w_1600,m_lfit')
    expect(processOf(ossAvatar(OSS))).toContain('resize,w_120,m_lfit')
    expect(ossAvatar('https://example.com/a.png')).toBe('https://example.com/a.png')
  })
})
