export type PluginSocketKind = 'websocket' | 'socket.io'

export interface PluginSocketOptions {
  permissionKey?: string
  url: string
  kind: PluginSocketKind
  path?: string
  auth?: Record<string, unknown>
  reconnection?: boolean
}

export interface PluginSocketMessage {
  id: string
  event: string
  data?: unknown
}

export interface PluginSocketRuntime {
  id: string
  kind: PluginSocketKind
  send(data: unknown): Promise<void>
  emit(event: string, data: unknown): Promise<void>
  disconnect(): Promise<void>
  close(): void
}

export function validateSocketOptions(options: any): PluginSocketOptions {
  const url = new URL(String(options?.url ?? ''))
  if (url.protocol !== 'wss:' && url.protocol !== 'ws:' && url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Socket 地址必须是 ws://、wss://、http:// 或 https://')
  }
  const kind = options?.kind === 'socket.io' ? 'socket.io' : options?.kind === 'websocket' ? 'websocket' : undefined
  if (!kind) throw new Error('Socket 类型必须是 websocket 或 socket.io')
  if (kind === 'websocket' && url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('原生 WebSocket 只支持 ws:// 或 wss://')
  }
  if (kind === 'socket.io' && url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Socket.IO 只支持 http:// 或 https://')
  }
  if (options?.path != null && (typeof options.path !== 'string' || !options.path.startsWith('/'))) {
    throw new Error('Socket.IO path 必须以 / 开头')
  }
  if (options?.auth != null && (typeof options.auth !== 'object' || Array.isArray(options.auth))) {
    throw new Error('Socket auth 必须是对象')
  }
  if (options?.reconnection != null && typeof options.reconnection !== 'boolean') {
    throw new Error('Socket reconnection 必须是布尔值')
  }
  return {
    permissionKey: options.permissionKey || 'network.socket',
    url: url.toString(),
    kind,
    ...(options.path ? { path: options.path } : {}),
    ...(options.auth ? { auth: options.auth } : {}),
    ...(options.reconnection != null ? { reconnection: options.reconnection } : {})
  }
}

export function socketEventName(id: string, event: string): string {
  return `socket:${id}:${event}`
}

export function parseSocketPayload(event: MessageEvent): unknown {
  const text = typeof event.data === 'string' ? event.data : ''
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
