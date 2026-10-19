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
    if (!auth.authenticated || loading.value) return
    if (!reset && !nextCursor.value && items.value.length) return
    loading.value = true
    error.value = ''
    if (reset) {
      items.value = []
      nextCursor.value = null
    }
    try {
      const page = await notificationsApi.list(category.value, reset ? undefined : nextCursor.value || undefined)
      const known = new Set(items.value.map((item) => item.id))
      items.value = [...items.value, ...page.items.filter((item) => !known.has(item.id))]
      nextCursor.value = page.nextCursor
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '消息加载失败'
    } finally {
      loading.value = false
    }
  }

  async function markRead(messages: InboxMessage[]) {
    const unread = messages.filter((item) => !item.read)
    if (!unread.length) return
    unread.forEach((item) => (item.read = true))
    counts.value = {
      all: Math.max(0, counts.value.all - unread.length),
      notice: Math.max(0, counts.value.notice - unread.filter((item) => item.category === 'notice').length),
      interaction: Math.max(0, counts.value.interaction - unread.filter((item) => item.category === 'interaction').length),
      comment: Math.max(0, counts.value.comment - unread.filter((item) => item.category === 'comment').length)
    }
    try {
      await notificationsApi.read(unread.map((item) => item.id))
    } catch {
      // Local read state remains; the next refresh reconciles it.
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
    try {
      const page = await notificationsApi.list(category.value)
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
    wakeRealtime
  }
})