import { describe, expect, it } from 'vitest'
import {
  IP_LOCATION_FALLBACK,
  communityLocationText,
  communityMetaLine
} from './communityLocation'

describe('community location text', () => {
  it('uses the backend location when present', () => {
    expect(communityLocationText('福建·厦门')).toBe('福建·厦门')
    expect(communityLocationText('  广东·深圳  ')).toBe('广东·深圳')
  })

  it('falls back for older posts that never recorded a location', () => {
    // 早期数据没有这个字段；留空会让人以为是渲染漏了。
    expect(communityLocationText(undefined)).toBe(IP_LOCATION_FALLBACK)
    expect(communityLocationText(null)).toBe(IP_LOCATION_FALLBACK)
    expect(communityLocationText('')).toBe(IP_LOCATION_FALLBACK)
    expect(communityLocationText('   ')).toBe(IP_LOCATION_FALLBACK)
  })

  it('ignores non-string values instead of printing objects', () => {
    expect(communityLocationText({ city: 'x' })).toBe(IP_LOCATION_FALLBACK)
    expect(communityLocationText(42)).toBe(IP_LOCATION_FALLBACK)
  })

  it('joins time and location with one separator', () => {
    expect(communityMetaLine('3 小时前', '北京')).toBe('3 小时前 · 北京')
    expect(communityMetaLine('3 小时前', null)).toBe(`3 小时前 · ${IP_LOCATION_FALLBACK}`)
  })

  it('does not leave a dangling separator when the time cannot be parsed', () => {
    expect(communityMetaLine('', '北京')).toBe('北京')
  })
})
