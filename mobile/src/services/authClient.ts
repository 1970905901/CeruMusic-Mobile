import LogtoClient from '@logto/capacitor'

export const CERU_API_RESOURCE = 'https://api.ceru.shiqianjiang.cn/api'
export const REDIRECT_URI = 'cerumusic://oauth/callback'
export const POST_LOGOUT_REDIRECT_URI = 'cerumusic://oauth/logout-callback'

/** 澜音认证服务器。账号安全页的外部入口也拼在这个地址下。 */
export const LOGTO_ENDPOINT = 'https://auth.shiqianjiang.cn/'

export const logtoClient = new LogtoClient(
  {
    endpoint: LOGTO_ENDPOINT,
    appId: '2a22nn23flw9nyrwi6jw9',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    resources: [CERU_API_RESOURCE, 'https://api.qz.shiqianjiang.cn/api']
  },
  { enableCache: true }
)