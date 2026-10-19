import LogtoClient from '@logto/capacitor'

export const CERU_API_RESOURCE = 'https://api.ceru.shiqianjiang.cn/api'
export const REDIRECT_URI = 'cerumusic://oauth/callback'
export const POST_LOGOUT_REDIRECT_URI = 'cerumusic://oauth/logout-callback'

export const logtoClient = new LogtoClient(
  {
    endpoint: 'https://auth.shiqianjiang.cn/',
    appId: '2a22nn23flw9nyrwi6jw9',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    resources: [CERU_API_RESOURCE, 'https://api.qz.shiqianjiang.cn/api']
  },
  { enableCache: true }
)