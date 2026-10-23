import { describe, expect, it } from 'vitest'
import {
  SECURITY_GROUPS,
  buildAccountSecurityUrl,
  logtoEndpointHost,
  resolveSecurityIdentifier,
  resolveSecuritySub,
  socialTargetLabel
} from './accountSecurity'

const endpoint = 'https://auth.shiqianjiang.cn/'
const findItem = (id: string) =>
  SECURITY_GROUPS.flatMap((group) => group.items).find((item) => item.id === id)!

describe('account security groups', () => {
  it('covers the desktop entry set for identity, passkey, mfa and social login', () => {
    expect(SECURITY_GROUPS.map((group) => group.title)).toEqual([
      '基本身份',
      '通行密钥（Passkey）',
      '两步验证',
      '第三方登录'
    ])
    expect(SECURITY_GROUPS.flatMap((group) => group.items).map((item) => item.id)).toEqual([
      'email',
      'phone',
      'username',
      'password',
      'passkey-add',
      'passkey-manage',
      'authenticator',
      'authenticator-replace',
      'backup-generate',
      'backup-manage',
      'social-manage'
    ])
  })

  it('keeps every path under the account section', () => {
    for (const item of SECURITY_GROUPS.flatMap((group) => group.items)) {
      expect(item.path.startsWith('/account/')).toBe(true)
    }
  })
})

describe('account security display text', () => {
  it('shows the bound identifier in place of the hint', () => {
    const identity = { email: 'a@b.com', phone_number: '+8613800000000', username: 'ceru' }
    expect(resolveSecuritySub(identity, findItem('email'))).toBe('a@b.com')
    expect(resolveSecuritySub(identity, findItem('phone'))).toBe('+8613800000000')
    expect(resolveSecuritySub(identity, findItem('username'))).toBe('ceru')
  })

  it('falls back to the hint when the account has no value', () => {
    const item = findItem('email')
    expect(resolveSecuritySub(null, item)).toBe(item.fallbackSub)
    expect(resolveSecuritySub({ email: null }, item)).toBe(item.fallbackSub)
    // 密码没有可展示的标识，永远显示说明文案。
    expect(resolveSecuritySub({ email: 'a@b.com' }, findItem('password'))).toBe(
      '设置或修改登录密码'
    )
  })

  it('lists bound social platforms and falls back when there are none', () => {
    const item = findItem('social-manage')
    expect(resolveSecuritySub({ identities: { qq: {}, github: {} } }, item)).toBe('已绑定：QQ、GitHub')
    expect(resolveSecuritySub({ identities: {} }, item)).toBe(item.fallbackSub)
    expect(resolveSecuritySub(null, item)).toBe(item.fallbackSub)
  })

  it('humanizes unknown social targets instead of dropping them', () => {
    expect(socialTargetLabel('WeChat')).toBe('微信')
    expect(socialTargetLabel('weibo')).toBe('weibo')
    expect(socialTargetLabel('')).toBe('')
  })

  it('never exposes an identifier for entries that have none', () => {
    const identity = { email: 'a@b.com', phone_number: '1', username: 'u' }
    expect(resolveSecurityIdentifier(identity, findItem('password'))).toBe('')
    expect(resolveSecurityIdentifier(identity, findItem('social-manage'))).toBe('')
    expect(resolveSecurityIdentifier(undefined, findItem('email'))).toBe('')
  })
})

describe('account security url', () => {
  it('targets the account path on the auth server with the desktop query flags', () => {
    const url = new URL(buildAccountSecurityUrl(endpoint, findItem('password'))!)
    expect(url.origin).toBe('https://auth.shiqianjiang.cn')
    expect(url.pathname).toBe('/account/password')
    expect(url.searchParams.get('ui_locales')).toBe('zh-CN')
    expect(url.searchParams.get('show_success')).toBe('true')
    expect(url.searchParams.get('identifier')).toBeNull()
  })

  it('prefills the identifier when the account has one', () => {
    const url = new URL(
      buildAccountSecurityUrl(endpoint, findItem('email'), { email: 'a@b.com' })!
    )
    expect(url.searchParams.get('identifier')).toBe('a@b.com')
    expect(url.pathname).toBe('/account/email')
  })

  it('does not double the slash when the endpoint already ends with one', () => {
    const url = new URL(buildAccountSecurityUrl(endpoint, findItem('username'))!)
    expect(url.pathname).toBe('/account/username')
  })

  it('accepts an endpoint without a trailing slash', () => {
    const url = buildAccountSecurityUrl('https://auth.shiqianjiang.cn', findItem('phone'))
    expect(url).toContain('/account/phone')
  })

  it('refuses to build a link from a missing or non-http endpoint', () => {
    expect(buildAccountSecurityUrl('', findItem('email'))).toBeNull()
    expect(buildAccountSecurityUrl('   ', findItem('email'))).toBeNull()
    expect(buildAccountSecurityUrl('javascript:alert(1)', findItem('email'))).toBeNull()
    expect(buildAccountSecurityUrl('not a url', findItem('email'))).toBeNull()
  })

  it('reports the host shown in the section hint', () => {
    expect(logtoEndpointHost(endpoint)).toBe('auth.shiqianjiang.cn')
    expect(logtoEndpointHost('')).toBe('')
    expect(logtoEndpointHost('not a url')).toBe('not a url')
  })
})
