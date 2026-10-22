import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { CERU_API_RESOURCE } from '@/services/authClient'
import { getAccessToken } from '@/services/ceruApi'
import {
  notificationsApi,
  type InboxMessage,
  type MessageCategory,
  type UnreadCounts
} from '@/services/notificationsApi'

export const useNotificationsStore = defineStore('notifications', () => {
  const auth = useAuthStore()
  const category = ref<MessageCategory>('all')
  const items = ref<InboxMessage[]>([])
  const counts = ref<UnreadCounts>({ all: 0, notice: 0, interaction: 0, comment: 0 })
  const nextCursor = ref<string | null>(null)
  const loading = ref(false)
  const clearing = ref(false)
  const error = ref('')
  const realtimeConnected = ref(false)
  const revision = ref(0)
  let socket: Socket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let reconnectAttempt = 0
  let stopped = true
  let connecting = false
  /**
   * 列表请求的世代号。
   *
   * 切换分类时旧请求还在路上：此前 `loading` 为真就直接 return，新分类
   * 一次都不拉——界面已经显示「通知」，列表却还是「全部」的内容，而且不会
   * 自愈。现在重新加载会作废旧请求，旧响应连同它的加载态一起丢弃。
   */
  let listGeneration = 0
  async function refreshCounts() {
    if (!auth.authenticated) {
      counts.value = { all: 0, notice: 0, interaction: 0, comment: 0 }
      return
    }
    try {
      counts.value = await notificationsApi.counts()
    } catch {
      // Keep the previous count during transient network failures.
    }
  }

  async function load(reset = false) {
    if (!auth.authenticated) return
    // 增量加载仍然只允许一个在途请求；「重来」则要打断在途请求（换分类时）。
    if (!reset && loading.value) return
    if (!reset && !nextCursor.value && items.value.length) return
    const token = reset ? ++listGeneration : listGeneration
    const requestedCategory = category.value
    loading.value = true
    error.value = ''
    if (reset) {
      items.value = []
      nextCursor.value = null
    }
    try {
      const page = await notificationsApi.list(
        requestedCategory,
        reset ? undefined : nextCursor.value || undefined
      )
      if (!isCurrentList(token, requestedCategory)) return
      const known = new Set(items.value.map((item) => item.id))
      items.value = [...items.value, ...page.items.filter((item) => !known.has(item.id))]
      nextCursor.value = page.nextCursor
    } catch (cause) {
      if (!isCurrentList(token, requestedCategory)) return
      error.value = cause instanceof Error ? cause.message : '消息加载失败'
    } finally {
      // 过期请求不得关闭新请求的加载态。
      if (token === listGeneration) loading.value = false
    }
  }

  /** 响应是否仍属于当前分类与当前世代。 */
  function isCurrentList(token: number, requestedCategory: MessageCategory): boolean {
    return token === listGeneration && requestedCategory === category.value
  }

  /**
   * 标记已读：先本地扣减让角标立刻变化，再回写后端。
   *
   * 回写失败时把本地读状态与计数回滚并刷新真实计数，避免出现「界面显示已读、
   * 下次进入又变未读」的错觉（桌面端 flushRead 失败后同样以服务端为准）。
   */
  async function markRead(messages: InboxMessage[]) {
    const unread = messages.filter((item) => !item.read)
    if (!unread.length) return
    unread.forEach((item) => (item.read = true))
    const previous = counts.value
    counts.value = subtractUnread(counts.value, unread.map((item) => item.category))
    try {
      await notificationsApi.read(unread.map((item) => item.id))
    } catch {
      unread.forEach((item) => (item.read = false))
      counts.value = previous
      await refreshCounts()
    }
  }

  async function clearRead() {
    if (!auth.authenticated || clearing.value) return false
    clearing.value = true
    try {
      await notificationsApi.clear()
      items.value = items.value.filter((item) => !item.read)
      await refreshCounts()
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '清理失败'
      return false
    } finally {
      clearing.value = false
    }
  }

  function stopRealtime() {
    stopped = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = undefined
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = undefined
    socket?.removeAllListeners()
    socket?.disconnect()
    socket = null
    realtimeConnected.value = false
    connecting = false
  }

  /**
   * 退出登录时清空列表与计数。
   *
   * `stopRealtime` 只断连接；消息列表与未读角标还留在内存里，
   * 换另一个账号登录后，会先看到上一个账号的私信与评论内容，
   * 角标也带着别人的未读数。
   */
  function resetInbox() {
    // 换账号：在途请求的响应不得再落到新账号的收件箱里。
    listGeneration += 1
    items.value = []
    counts.value = { all: 0, notice: 0, interaction: 0, comment: 0 }
    nextCursor.value = null
    error.value = ''
    loading.value = false
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return
    const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempt++, 5), 60000)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      void connectRealtime()
    }, delay)
  }

  async function connectRealtime() {
    if (stopped || connecting || socket?.connected || !auth.authenticated) return
    connecting = true
    try {
      const token = await getAccessToken()
      if (!token || stopped || !auth.authenticated) {
        connecting = false
        return
      }
      const origin = new URL(CERU_API_RESOURCE).origin
      const next = io(origin + '/notifications', {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
        timeout: 12000
      })
      socket = next
      next.on('connect', () => {
        reconnectAttempt = 0
        realtimeConnected.value = true
        void synchronize()
      })
      next.on('notifications:changed', () => {
        revision.value += 1
        void synchronize()
        if (items.value.length) void refreshFirstPage()
      })
      next.on('disconnect', () => {
        realtimeConnected.value = false
        if (socket === next) socket = null
        next.removeAllListeners()
        next.disconnect()
        scheduleReconnect()
      })
      next.on('connect_error', () => {
        realtimeConnected.value = false
        if (socket === next) socket = null
        next.removeAllListeners()
        next.disconnect()
        scheduleReconnect()
      })
      if (!heartbeatTimer) {
        heartbeatTimer = setInterval(() => {
          if (auth.authenticated && !socket?.connected) void connectRealtime()
          if (auth.authenticated) void refreshCounts()
        }, 300000)
      }
    } catch {
      scheduleReconnect()
    } finally {
      connecting = false
    }
  }

  function startRealtime() {
    stopRealtime()
    if (!auth.authenticated) return
    stopped = false
    void connectRealtime()
    void refreshCounts()
  }

  function wakeRealtime() {
    if (!auth.authenticated) return
    if (stopped) startRealtime()
    else if (!socket?.connected) {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = undefined
      void connectRealtime()
    }
    void refreshCounts()
  }

  async function synchronize() {
    await refreshCounts()
    if (items.value.length) await refreshFirstPage()
  }

  async function refreshFirstPage() {
    if (loading.value || !auth.authenticated) return
    const token = listGeneration
    const requestedCategory = category.value
    try {
      const page = await notificationsApi.list(requestedCategory)
      // 响应回来时用户可能已经切了分类，插进去就混了。
      if (!isCurrentList(token, requestedCategory)) return
      if (page.items.length) {
        const known = new Set(page.items.map((item) => item.id))
        items.value = [...page.items, ...items.value.filter((item) => !known.has(item.id))]
        nextCursor.value = nextCursor.value || page.nextCursor
      }
    } catch {
      // The next explicit load or realtime event reconciles the feed.
    }
  }

  return {
    category,
    items,
    counts,
    nextCursor,
    loading,
    clearing,
    error,
    load,
    markRead,
    refreshCounts,
    clearRead,
    realtimeConnected,
    revision,
    startRealtime,
    stopRealtime,
    resetInbox,
    wakeRealtime
  }
})

/**
 * 把已读消息从本地未读计数里扣除。
 *
 * 计数可能因并发刷新而落后于列表（刚收到新消息还没同步计数），
 * 因此每一项都夹到 0 以上，避免出现负数角标；总数与分类分别扣减，
 * 与后端「标记已读后返回新的未读数」的语义一致。
 */
export function subtractUnread(
  current: UnreadCounts,
  readCategories: readonly Exclude<MessageCategory, 'all'>[]
): UnreadCounts {
  const clamp = (value: number, delta: number) => Math.max(0, Number(value || 0) - delta)
  const count = (category: Exclude<MessageCategory, 'all'>) =>
    readCategories.filter((item) => item === category).length
  return {
    all: clamp(current.all, readCategories.length),
    notice: clamp(current.notice, count('notice')),
    interaction: clamp(current.interaction, count('interaction')),
    comment: clamp(current.comment, count('comment'))
  }
}
