import type { ChatMsg, PendingItem } from '@/services/listenTogetherApi'
import { describeChatSticker } from '@/services/listenTogetherChat'
import { isAppInactive } from '@/services/appVisibility'
import { showSystemNotification } from '@/services/notifications'

/**
 * 一起听系统通知（桌面端 `utils/listenTogether/notifier.ts` 的移动端等价实现）。
 *
 * 差异：移动端没有 `document.hasFocus()` 语义，直接复用 `isAppInactive`
 * （原生 appStateChange + document.hidden 的合并结果）；App 在前台时不打扰，
 * 与桌面端「窗口在前台就不弹」一致。
 *
 * 节流沿用类微信策略：首条立即弹，冷却期内聚合，冷却结束合并为
 * 「房间名 · N 条新消息（最近：…）」；被 @ 或被引用则绕过节流强提示。
 */

const COOLDOWN_MS = 4000
const BUFFER_LIMIT = 50
const PREVIEW_MAX = 28

export interface NotifyPayload {
  title: string
  body: string
}

export interface NotifyQueue {
  /** 推入一条待展示内容；首条立即发，其余在冷却窗口内聚合。 */
  push(payload: NotifyPayload): void
  /** 立刻清空并弹出聚合结果。 */
  flush(): void
  /** 离开房间时丢弃缓冲，避免消息被算进新房间。 */
  reset(): void
  /** 仅测试用：当前是否处于冷却窗口。 */
  readonly cooling: boolean
}

export interface NotifyQueueOptions {
  fire: (payload: NotifyPayload) => void
  /** 聚合后的标题/正文；默认用最近一条的 title 作为房间名。 */
  summarize?: (items: NotifyPayload[]) => NotifyPayload
  cooldownMs?: number
  bufferLimit?: number
}

/**
 * 节流队列抽成独立工厂：通知文案与平台 API 都通过依赖注入，
 * 单测无需伪造 Capacitor 或计时器。
 */
export function createNotifyQueue(options: NotifyQueueOptions): NotifyQueue {
  const cooldownMs = options.cooldownMs ?? COOLDOWN_MS
  const bufferLimit = options.bufferLimit ?? BUFFER_LIMIT
  const summarize =
    options.summarize ??
    ((items: NotifyPayload[]) => ({
      title: items[items.length - 1].title + ' · ' + items.length + ' 条新消息',
      body: '最近：' + items[items.length - 1].body
    }))

  let buffer: NotifyPayload[] | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const items = buffer
    buffer = null
    if (!items || items.length === 0) return
    options.fire(summarize(items))
  }

  return {
    push(payload: NotifyPayload) {
      if (!payload?.title) return
      if (timer) {
        if (buffer && buffer.length < bufferLimit) buffer.push(payload)
        return
      }
      options.fire(payload)
      buffer = []
      timer = setTimeout(flush, cooldownMs)
    },
    flush,
    reset() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      buffer = null
    },
    get cooling() {
      return timer !== null
    }
  }
}

/** 一张聊天消息的通知预览：贴纸转成「[贴纸] 等你哦」，超长截断。 */
export function formatChatPreview(message: ChatMsg): string {
  const raw =
    message.type === 'sticker'
      ? `[贴纸] ${describeChatSticker(message.content)}`
      : String(message.content ?? '')
  const name = String(message.from?.nickname || '音乐同好')
  const text = raw.length > PREVIEW_MAX ? raw.slice(0, PREVIEW_MAX) + '…' : raw
  return `${name}：${text}`
}

export function formatPendingPreview(item: PendingItem): string {
  return `${item.requesterName || '某人'} 点了《${item.song?.name || '?'}》`
}

/**
 * 是否 @ 到我：显式 mentions 命中，或引用的原消息是我发的（引用自动 @）。
 * 与桌面端 `utils/listenTogether/mention.ts` 同一判定。
 */
export function isMentionedSelf(
  message: ChatMsg,
  myUserId: string | null | undefined,
  history: readonly ChatMsg[]
): boolean {
  if (!myUserId) return false
  const mentions = String(message.meta?.mentions || '')
    .split(',')
    .filter(Boolean)
  if (mentions.includes(String(myUserId))) return true
  const replyToId = message.meta?.replyToId
  if (!replyToId) return false
  const replied = history.find((item) => item.id === replyToId)
  return replied?.from?.userId === myUserId
}

const chatQueue = createNotifyQueue({
  fire: (payload) => {
    void showSystemNotification(payload.title, payload.body)
  }
})

const pendingQueue = createNotifyQueue({
  fire: (payload) => {
    void showSystemNotification(payload.title, payload.body)
  },
  summarize: (items) => ({
    title: items[items.length - 1].title + ' · ' + items.length + ' 条待审批',
    body: '最近：' + items[items.length - 1].body
  })
})

export interface ChatNotifyPrefs {
  /** 是否允许普通聊天系统通知 */
  notifyEnabled: boolean
  /** 被 @ / 被引用时是否额外强提示（不受 notifyEnabled 限制） */
  mentionStrong: boolean
}

/**
 * 房间聊天通知。前台不打扰；被 @ 走强提示快通道并跳过节流。
 */
export function notifyRoomChat(
  message: ChatMsg,
  roomName: string,
  mentionedSelf: boolean,
  prefs: ChatNotifyPrefs
): void {
  if (isAppInactive.value === false) return
  if (mentionedSelf) {
    if (!prefs.mentionStrong) return
    void showSystemNotification(`[@你] ${roomName}`, formatChatPreview(message))
    return
  }
  if (!prefs.notifyEnabled) return
  chatQueue.push({ title: roomName, body: formatChatPreview(message) })
}

/** 管理员收到新的点歌申请：只有有控制权的一方才提示。 */
export function notifyRoomPending(
  items: readonly PendingItem[],
  roomName: string,
  prefs: ChatNotifyPrefs
): void {
  if (!prefs.notifyEnabled) return
  if (isAppInactive.value === false) return
  if (!items.length) return
  if (items.length > 1) {
    const last = items[items.length - 1]
    void showSystemNotification(
      `${roomName} · ${items.length} 条待审批`,
      `最近：${formatPendingPreview(last)}`
    )
    return
  }
  pendingQueue.push({ title: `${roomName} · 新点歌请求`, body: formatPendingPreview(items[0]) })
}

export function resetListenTogetherNotifications(): void {
  chatQueue.reset()
  pendingQueue.reset()
}
