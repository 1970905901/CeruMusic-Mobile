/**
 * Socket 配额，与桌面 `SocketBroker` 同口径。
 *
 * 移动端此前只有一条「单条负载 1 MiB」的校验，条数、速率、事件名一概不管：
 * 插件可以开几十条连接、每秒灌几百条消息，把 socket.io 客户端与主线程拖住；
 * 还能注册 `connect` / `disconnect` / `error` 这些保留事件，直接打乱库自己的
 * 生命周期回调。
 */
export const MAX_SOCKET_CONNECTIONS = 8
export const MAX_SOCKET_MESSAGE_BYTES = 65536
export const MAX_SOCKET_SENDS_PER_SECOND = 100
export const MAX_SOCKET_EVENT_NAME_LENGTH = 128

/** socket.io 自己用的生命周期事件，插件注册会覆盖库的监听。 */
export const RESERVED_SOCKET_EVENTS = [
  'connect',
  'connect_error',
  'disconnect',
  'disconnecting',
  'error',
  'message'
] as const

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

/** 连接数（含正在连接的）不得超过上限。 */
export function assertSocketSlots(connected: number, connecting: number): void {
  if (connected + connecting >= MAX_SOCKET_CONNECTIONS) {
    throw new Error(`Socket 连接数已达上限（${MAX_SOCKET_CONNECTIONS}）`)
  }
}

/**
 * 单条消息的体积。
 *
 * 对象先序列化再量字节——与桌面 `Buffer.byteLength(JSON.stringify(data))`
 * 一致；用 `String.length` 量中文会按三倍放过超限消息。
 */
export function assertSocketMessageSize(data: unknown): void {
  let text: string
  try {
    text = typeof data === 'string' ? data : JSON.stringify(data ?? null) ?? ''
  } catch {
    throw new Error('Socket 消息无法序列化')
  }
  if (utf8Bytes(text) > MAX_SOCKET_MESSAGE_BYTES) {
    throw new Error(`Socket 消息超过 ${MAX_SOCKET_MESSAGE_BYTES / 1024} KiB`)
  }
}

/** 事件名：非空、限长、不能是 socket.io 的保留事件。 */
export function assertSocketEventName(event: string): void {
  const name = String(event ?? '')
  if (!name || name.length > MAX_SOCKET_EVENT_NAME_LENGTH) {
    throw new Error(`Socket 事件名必须是 1–${MAX_SOCKET_EVENT_NAME_LENGTH} 个字符`)
  }
  if ((RESERVED_SOCKET_EVENTS as readonly string[]).includes(name)) {
    throw new Error(`Socket 事件名不能使用保留事件：${name}`)
  }
}

/**
 * 每秒发送条数的滑窗计数：窗口从第一次发送起算，满一秒清零重来，
 * 与桌面 broker 的 `lastSend` / `sends` 语义一致。
 */
export class SocketSendLimiter {
  private windowStart = 0
  private sends = 0

  count(now: number): void {
    if (now - this.windowStart >= 1000) {
      this.windowStart = now
      this.sends = 0
    }
    this.sends++
    if (this.sends > MAX_SOCKET_SENDS_PER_SECOND) {
      throw new Error(`Socket 发送过快（每秒最多 ${MAX_SOCKET_SENDS_PER_SECOND} 条）`)
    }
  }
}
