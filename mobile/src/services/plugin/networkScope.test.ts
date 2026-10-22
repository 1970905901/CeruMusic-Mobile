import { describe, expect, it } from 'vitest'
import { isPrivateHost, isPrivateUrl } from './networkScope'

describe('private host detection', () => {
  it('flags loopback and local names', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('::1')).toBe(true)
    expect(isPrivateHost('[::1]')).toBe(true)
    expect(isPrivateHost('printer.local')).toBe(true)
    expect(isPrivateHost('nas.lan')).toBe(true)
  })

  it('flags RFC1918 ranges', () => {
    expect(isPrivateHost('10.0.0.5')).toBe(true)
    expect(isPrivateHost('172.16.3.4')).toBe(true)
    expect(isPrivateHost('172.31.255.1')).toBe(true)
    expect(isPrivateHost('192.168.1.1')).toBe(true)
    expect(isPrivateHost('169.254.1.1')).toBe(true)
    expect(isPrivateHost('100.64.0.1')).toBe(true)
  })

  it('does not flag public addresses', () => {
    expect(isPrivateHost('8.8.8.8')).toBe(false)
    expect(isPrivateHost('music.163.com')).toBe(false)
    expect(isPrivateHost('172.32.0.1')).toBe(false)
    expect(isPrivateHost('100.128.0.1')).toBe(false)
  })

  it('unwraps IPv4-mapped IPv6', () => {
    expect(isPrivateHost('::ffff:192.168.1.5')).toBe(true)
    expect(isPrivateHost('::ffff:8.8.8.8')).toBe(false)
  })

  it('treats unparseable input as private', () => {
    // 宁可拒绝，也不要因为判断不了就放行到内网。
    expect(isPrivateHost('')).toBe(true)
    expect(isPrivateHost('999.1.1.1')).toBe(false)
    expect(isPrivateUrl('not a url')).toBe(true)
  })

  it('classifies full URLs', () => {
    expect(isPrivateUrl('http://192.168.0.2:8080/api')).toBe(true)
    expect(isPrivateUrl('https://example.com/x')).toBe(false)
  })
})
