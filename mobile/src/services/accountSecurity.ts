/**
 * 「账号安全」入口，对齐桌面版 `views/user/Profile.vue` 的 `securityGroups`。
 *
 * 桌面版在个人资料页下方列出一组固定入口（邮箱、手机号、密码、Passkey、
 * 两步验证、第三方登录），点击后在系统浏览器打开澜音认证服务器的对应页面——
 * 密码与设备凭据始终只在认证服务器上输入，应用本身不经手。
 *
 * 移动端此前**完全没有**这块能力：账号页只有「编辑资料 / 消息 / 社区 / 退出登录」，
 * 想改密码或开启两步验证只能去网页端。这里把分组、标识展示与链接拼装抽成纯函数，
 * 页面只负责渲染与打开系统浏览器。
 */

export type SecurityIdentifierSource = 'email' | 'phone' | 'username' | 'social'

export interface SecurityItem {
  /** 稳定 id，用作列表 key 与搜索标识 */
  id: string
  label: string
  /** 认证服务器上的相对路径 */
  path: string
  identifierFrom?: SecurityIdentifierSource
  /** 取不到账号信息时显示的说明 */
  fallbackSub: string
}

export interface SecurityGroup {
  id: string
  title: string
  items: SecurityItem[]
}

/**
 * 账号里可能用到的字段。只声明真正读取的几项，
 * 这样既不必依赖 Logto 的完整类型，也能接住旧账号里缺失的字段。
 */
export interface AccountIdentity {
  email?: string | null
  phone_number?: string | null
  username?: string | null
  identities?: Record<string, unknown> | null
}

export const SECURITY_GROUPS: readonly SecurityGroup[] = [
  {
    id: 'identity',
    title: '基本身份',
    items: [
      {
        id: 'email',
        label: '邮箱',
        path: '/account/email',
        identifierFrom: 'email',
        fallbackSub: '绑定或修改登录邮箱'
      },
      {
        id: 'phone',
        label: '手机号',
        path: '/account/phone',
        identifierFrom: 'phone',
        fallbackSub: '绑定或修改登录手机号'
      },
      {
        id: 'username',
        label: '用户名',
        path: '/account/username',
        identifierFrom: 'username',
        fallbackSub: '设置或修改登录用户名'
      },
      { id: 'password', label: '密码', path: '/account/password', fallbackSub: '设置或修改登录密码' }
    ]
  },
  {
    id: 'passkey',
    title: '通行密钥（Passkey）',
    items: [
      {
        id: 'passkey-add',
        label: '添加 Passkey',
        path: '/account/passkey/add',
        fallbackSub: '使用指纹、Face ID 或安全密钥登录'
      },
      {
        id: 'passkey-manage',
        label: '管理 Passkey',
        path: '/account/passkey/manage',
        fallbackSub: '查看、重命名或移除已绑定的 Passkey'
      }
    ]
  },
  {
    id: 'mfa',
    title: '两步验证',
    items: [
      {
        id: 'authenticator',
        label: '绑定验证器 App',
        path: '/account/authenticator-app',
        fallbackSub: '使用 Google Authenticator 等 TOTP 应用'
      },
      {
        id: 'authenticator-replace',
        label: '更换验证器 App',
        path: '/account/authenticator-app/replace',
        fallbackSub: '更换或重新绑定验证器'
      },
      {
        id: 'backup-generate',
        label: '生成备份码',
        path: '/account/backup-codes/generate',
        fallbackSub: '当无法使用验证器时用于登录'
      },
      {
        id: 'backup-manage',
        label: '管理备份码',
        path: '/account/backup-codes/manage',
        fallbackSub: '查看剩余可用的备份码'
      }
    ]
  },
  {
    id: 'social',
    title: '第三方登录',
    items: [
      {
        id: 'social-manage',
        label: '管理第三方登录',
        path: '/account/security',
        identifierFrom: 'social',
        fallbackSub: '绑定或解绑 QQ、微信、Google 等账号'
      }
    ]
  }
]

/** 与桌面版 `SOCIAL_TARGET_LABELS` 同一份映射。 */
export const SOCIAL_TARGET_LABELS: Record<string, string> = {
  qq: 'QQ',
  wechat: '微信',
  weixin: '微信',
  github: 'GitHub',
  google: 'Google',
  apple: 'Apple',
  alipay: '支付宝',
  microsoft: 'Microsoft',
  dingtalk: '钉钉',
  feishu: '飞书'
}

export function socialTargetLabel(target: string): string {
  return SOCIAL_TARGET_LABELS[String(target ?? '').toLowerCase()] ?? String(target ?? '')
}

/** 该入口对应的账号标识（邮箱地址、手机号、用户名）；不适用时返回空串。 */
export function resolveSecurityIdentifier(
  identity: AccountIdentity | null | undefined,
  item: SecurityItem
): string {
  if (!identity || !item.identifierFrom || item.identifierFrom === 'social') return ''
  const value = identity[item.identifierFrom === 'phone' ? 'phone_number' : item.identifierFrom]
  return typeof value === 'string' ? value : ''
}

/**
 * 入口右侧的说明文字：能取到标识就显示标识本身，否则回落说明文案。
 * 第三方登录显示已绑定的平台列表，没有绑定时同样回落说明。
 */
export function resolveSecuritySub(
  identity: AccountIdentity | null | undefined,
  item: SecurityItem
): string {
  if (item.identifierFrom === 'social') {
    const ids = identity?.identities
    const targets = ids && typeof ids === 'object' ? Object.keys(ids) : []
    return targets.length ? '已绑定：' + targets.map(socialTargetLabel).join('、') : item.fallbackSub
  }
  return resolveSecurityIdentifier(identity, item) || item.fallbackSub
}

/** 认证服务器的主机名，用于在界面上说明「会跳到哪里」。 */
export function logtoEndpointHost(endpoint: string): string {
  try {
    return new URL(endpoint || 'https://').host
  } catch {
    return endpoint || ''
  }
}

/**
 * 拼出认证服务器上的账号页地址。
 *
 * 地址缺失或不是合法 URL 时返回 `null`，由调用方提示——
 * 与其打开一个半截地址让用户看到浏览器错误页，不如明确说没配置。
 */
export function buildAccountSecurityUrl(
  endpoint: string,
  item: SecurityItem,
  identity?: AccountIdentity | null,
  locale = 'zh-CN'
): string | null {
  const base = String(endpoint || '').trim()
  if (!base) return null
  let url: URL
  try {
    // 端点可能带也可能不带结尾斜杠，统一补一个再拼相对路径。
    url = new URL(base.replace(/\/+$/, '') + item.path)
  } catch {
    return null
  }
  if (!['https:', 'http:'].includes(url.protocol)) return null
  url.searchParams.set('ui_locales', locale)
  url.searchParams.set('show_success', 'true')
  // 带上当前标识，认证页就能直接定位到对应字段，少让用户输一次。
  const identifier = resolveSecurityIdentifier(identity, item)
  if (identifier) url.searchParams.set('identifier', identifier)
  return url.toString()
}
