import { CERU_API_RESOURCE, logtoClient } from '@/services/authClient'

export type AuthMode = 'required' | 'optional' | 'none'

export async function getAccessToken(): Promise<string | null> {
  try {
    return await logtoClient.getAccessToken(CERU_API_RESOURCE)
  } catch {
    return null
  }
}

export async function ceruApi<T = any>(
  path: string,
  init: RequestInit = {},
  auth: AuthMode = 'required'
): Promise<T> {
  let token: string | null = null
  if (auth !== 'none') {
    token = await getAccessToken()
    if (!token && auth === 'required') throw new Error('请先登录')
  }
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', 'Bearer ' + token)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(CERU_API_RESOURCE + path, { ...init, headers })
  const text = await response.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    if (response.status === 401) {
      await logtoClient.clearAccessToken().catch(() => undefined)
      await logtoClient.clearAllTokens().catch(() => undefined)
      window.dispatchEvent(new CustomEvent('ceru:unauthorized'))
    }
    const message = payload?.message || payload?.error || '请求失败 (' + response.status + ')'
    throw new Error(String(message))
  }
  return (payload?.data ?? payload) as T
}