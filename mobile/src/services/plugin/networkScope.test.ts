import { describe, expect, it } from 'vitest'
import { PRIVATE_NETWORK_ERROR, isPrivateHost, isPrivateUrl } from './networkScope'

/**
 * 这条判据决定插件能不能在**没有**「局域网访问」授权的情况下摸到本机与内网。
 * 两个方向都会出事：
 * - 漏判 → 插件扫描 127.0.0.1、192.168.*、家里路由器；
 * - 误判 → 插件只是访问一个正常音源域名，却被要求授权「局域网访问」。
 */
describe('private host detection', () => {
  it('flags loopback and local names', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('::1')).toBe(true)
    expect(isPrivateHost('[::1]')).toBe(true)
    expect(isPrivateHost('printer.local')).toBe(true)
    expect(isPrivateHost('nas.lan')).toBe(true)
  })

  it('flags RFC1918 ranges and the reserved ranges desktop also rejects', () => {
    expect(isPrivateHost('10.0.0.5')).toBe(true)
    expect(isPrivateHost('172.16.3.4')).toBe(true)
    expect(isPrivateHost('172.31.255.1')).toBe(true)
    expect(isPrivateHost('192.168.1.1')).toBe(true)
    expect(isPrivateHost('169.254.1.1')).toBe(true)
    expect(isPrivateHost('100.64.0.1')).toBe(true)
    // 桌面 `isPrivateAddress` 把 224/8 及以上（多播、保留段）一并当作内网。
    expect(isPrivateHost('224.0.0.1')).toBe(true)
  })

  it('does not flag public addresses', () => {
    expect(isPrivateHost('8.8.8.8')).toBe(false)
    expect(isPrivateHost('music.163.com')).toBe(false)
    expect(isPrivateHost('172.32.0.1')).toBe(false)
    expect(isPrivateHost('100.128.0.1')).toBe(false)
  })

  it('reads inet_aton shorthand instead of only four-dot IPv4', () => {
    // `http://127.1/` 与 `http://2130706433/` 解析出来都是回环地址；
    // 只认四段的写法会让这两种拼写直接绕过「局域网访问」授权。
    expect(isPrivateHost('127.1')).toBe(true)
    expect(isPrivateHost('127.0.1')).toBe(true)
    expect(isPrivateHost('2130706433')).toBe(true)
    expect(isPrivateUrl('http://127.1/')).toBe(true)
    expect(isPrivateUrl('http://2130706433/')).toBe(true)
  })

  it('unwraps IPv4-mapped IPv6 in both notations', () => {
    expect(isPrivateHost('::ffff:192.168.1.5')).toBe(true)
    expect(isPrivateHost('::ffff:8.8.8.8')).toBe(false)
    // 同样的地址用十六进制组写出来（浏览器 URL 规范化后的形态）。
    expect(isPrivateHost('::ffff:7f00:1')).toBe(true)
    expect(isPrivateHost('::ffff:c0a8:101')).toBe(true)
    expect(isPrivateHost('::ffff:0a00:0100')).toBe(true)
  })

  it('recognises every spelling of a loopback IPv6 literal', () => {
    expect(isPrivateHost('0:0:0:0:0:0:0:1')).toBe(true)
    expect(isPrivateUrl('http://[0:0:0:0:0:0:0:1]/')).toBe(true)
    expect(isPrivateHost('::')).toBe(true)
    expect(isPrivateHost('FE80::1')).toBe(true)
    expect(isPrivateHost('fe80::')).toBe(true)
  })

  it('treats IPv6 unique-local and link-local ranges as private', () => {
    expect(isPrivateHost('fc00::1')).toBe(true)
    expect(isPrivateHost('fd12:3456::1')).toBe(true)
    // 公网 IPv6（2001:db8 是文档段，但格式上与公网地址一致）。
    expect(isPrivateHost('2001:db8::1')).toBe(false)
    expect(isPrivateHost('2a01:4f8::1')).toBe(false)
  })

  it('does not mistake a public domain for an IPv6 prefix', () => {
    // 此前把任意以 `fc` / `fd` 开头的字符串当成 IPv6 唯一本地地址：
    // `fdmusic.com` 被判成本机，插件访问正常音源却弹出「局域网访问」授权。
    expect(isPrivateHost('fdmusic.com')).toBe(false)
    expect(isPrivateHost('fcd.example.org')).toBe(false)
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
    expect(isPrivateUrl('https://fdmusic.com/api')).toBe(false)
  })

  it('keeps the permission wording the rejection path shows', () => {
    expect(PRIVATE_NETWORK_ERROR).toContain('局域网')
  })
})
