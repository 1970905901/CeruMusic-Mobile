import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/auth'
import { usePlayerStore } from '@/stores/player'
import { usePluginStore } from '@/stores/plugins'
import { useSettingsStore } from '@/stores/settings'
import { CERU_API_RESOURCE } from '@/services/authClient'
import { getAccessToken } from '@/services/ceruApi'
import { setListenTogetherPlaybackActive } from '@/services/playbackContext'
import {
  isMentionedSelf,
  notifyRoomChat,
  notifyRoomPending,
  resetListenTogetherNotifications
} from '@/services/listenTogetherNotify'
import {
  extractRoomCode,
  listenTogetherApi,
  type ChatMsg,
  type MemberProfile,
  type PendingItem,
  type PlaybackSnapshot,
  type QueueItem,
  type RoomMember,
  type RoomMeta,
  type RoomMode,
  type RoomPreview,
  type RoomRole,
  type RoomState,
  type SongRef
} from '@/services/listenTogetherApi'
import type { Track } from '@/types/music'

const CLIENT = {
  JOIN: 'room:join',
  LEAVE: 'room:leave',
  RESUME: 'room:resume',
  SYNC_CONTEXT: 'room:sync-context',
  PLAY: 'ctl:play',
  PAUSE: 'ctl:pause',
  SEEK: 'ctl:seek',
  CHANGE_SONG: 'ctl:change-song',
  PLAY_QUEUE_ITEM: 'ctl:play-queue-item',
  SKIP: 'ctl:skip',
  PREV: 'ctl:prev',
  SONG_ENDED: 'ctl:song-ended',
  QUEUE_REQUEST: 'queue:request',
  QUEUE_ADD: 'queue:add',
  QUEUE_APPROVE: 'queue:approve',
  QUEUE_REJECT: 'queue:reject',
  QUEUE_REMOVE: 'queue:remove',
  ROLE_PROMOTE: 'role:promote',
  ROLE_DEMOTE: 'role:demote',
  MEMBER_KICK: 'member:kick',
  CHAT_SEND: 'chat:send',
  PING: 'ping'
} as const

const SERVER = {
  STATE: 'room:state',
  DISMISSED: 'room:dismissed',
  MEMBER_JOIN: 'member:join',
  MEMBER_LEAVE: 'member:leave',
  MEMBER_KICKED: 'member:kicked',
  MEMBER_RECONNECT: 'member:reconnect',
  SYNC: 'sync',
  QUEUE_UPDATE: 'queue:update',
  PENDING_UPDATE: 'pending:update',
  ROLE_CHANGED: 'role:changed',
  CHAT_MSG: 'chat:msg',
  CHAT_SYSTEM: 'chat:system',
  PONG: 'pong',
  ERROR: 'lt:error'
} as const

function emptySnapshot(): PlaybackSnapshot {
  return { song: null, isPlaying: false, anchorPos: 0, anchorAt: Date.now(), seq: 0 }
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/**
 * socket.io 放弃重连后应当向用户说明的情况。
 *
 * 此前没有任何地方监听 `reconnect_failed`：重连次数用尽后，界面会一直停在
 * 「已连接」或「正在重试…」，进行中的加入要等 18s 超时才失败，而且文案是
 * 「超时」而不是「连不上」——用户会以为是自己网络慢，实际是已经放弃重试。
 */
export function reconnectExhaustedMessage(): string {
  return '与一起听服务器的连接已断开，请检查网络后重新进入房间'
}

export const useListenTogetherStore = defineStore('listenTogether', () => {
  const auth = useAuthStore()
  const player = usePlayerStore()
  const pluginStore = usePluginStore()

  const room = ref<RoomMeta | null>(null)
  const members = ref<RoomMember[]>([])
  const current = ref<PlaybackSnapshot>(emptySnapshot())
  const queue = ref<QueueItem[]>([])
  const pending = ref<PendingItem[]>([])
  const chat = ref<ChatMsg[]>([])
  const connected = ref(false)
  const joining = ref(false)
  const leaving = ref(false)
  const error = ref('')
  const shareUrl = ref('')
  const shareText = ref('')
  const needsTap = ref(false)
  const clockOffset = ref(0)

  let socket: Socket | null = null
  let joinResolver: ((state: RoomState) => void) | null = null
  let joinRejecter: ((error: Error) => void) | null = null
  let joinTimer: ReturnType<typeof setTimeout> | undefined
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let pingBurstTimers: Array<ReturnType<typeof setTimeout>> = []
  let pingSamples: Array<{ offset: number; rtt: number }> = []
  let applyChain: Promise<void> = Promise.resolve()
  let suppressUntil = 0
  let stopWatches: Array<() => void> = []
  let everJoined = false

  const userId = computed(() => String((auth.user as any)?.sub || ''))
  const myRole = computed<RoomRole>(() => {
    const member = members.value.find((item) => item.userId === userId.value)
    return member?.role || (room.value?.ownerId === userId.value ? 'owner' : 'member')
  })
  const isOwner = computed(() => myRole.value === 'owner')
  const canControl = computed(
    () => !!room.value && (room.value.mode === 'intimate' || myRole.value === 'owner' || myRole.value === 'admin')
  )
  const inRoom = computed(() => !!room.value)
  const currentSong = computed(() => current.value.song)
  const onlineMembers = computed(() => members.value.length)

  function serverNow(): number {
    return Date.now() + clockOffset.value
  }

  function memberRole(member: RoomMember): RoomRole {
    return room.value?.ownerId === member.userId ? 'owner' : member.role
  }

  function canRemoveQueueItem(item: QueueItem): boolean {
    if (canControl.value) return true
    return item.requesterId === userId.value
  }

  function resetRoomState() {
    setListenTogetherPlaybackActive(false)
    resetListenTogetherNotifications()
    room.value = null
    members.value = []
    current.value = emptySnapshot()
    queue.value = []
    pending.value = []
    chat.value = []
    shareUrl.value = ''
    shareText.value = ''
    needsTap.value = false
    error.value = ''
    everJoined = false
    clockOffset.value = 0
  }

  function clearJoinWait() {
    if (joinTimer) clearTimeout(joinTimer)
    joinTimer = undefined
    joinResolver = null
    joinRejecter = null
  }

  function waitForState(): Promise<RoomState> {
    clearJoinWait()
    return new Promise<RoomState>((resolve, reject) => {
      joinResolver = resolve
      joinRejecter = reject
      joinTimer = setTimeout(() => {
        joinRejecter?.(new Error('加入房间超时，请检查网络后重试'))
        clearJoinWait()
      }, 18000)
    })
  }

  function failJoin(cause: unknown) {
    joining.value = false
    const message = cause instanceof Error ? cause.message : String(cause)
    error.value = message
    joinRejecter?.(new Error(message))
    clearJoinWait()
    if (!everJoined) disconnectSocket()
  }

  async function createAndJoin(options: { mode: RoomMode; name?: string; maxMembers?: number }) {
    requireLogin()
    joining.value = true
    error.value = ''
    try {
      const created = await listenTogetherApi.create({
        mode: options.mode,
        name: options.name?.trim() || undefined,
        maxMembers: options.mode === 'group' ? options.maxMembers : undefined
      })
      shareUrl.value = created.shareUrl || ''
      shareText.value = created.shareText || buildShareText(created.code, created.name)
      await connectAndJoin(created.code)
    } catch (cause) {
      failJoin(cause)
      throw cause
    } finally {
      joining.value = false
    }
  }

  async function resolveAndJoin(input: string) {
    requireLogin()
    const code = extractRoomCode(input)
    if (!code) throw new Error('请输入 6 位房间口令或分享文案')
    joining.value = true
    error.value = ''
    try {
      const preview = await listenTogetherApi.resolve(code)
      if (!preview) throw new Error('口令无效或房间已过期')
      shareUrl.value = 'https://ceru.shiqianjiang.cn/lt/' + preview.code
      shareText.value = buildShareText(preview.code, preview.name)
      await connectAndJoin(preview.code)
    } catch (cause) {
      failJoin(cause)
      throw cause
    } finally {
      joining.value = false
    }
  }

  async function joinByCode(code: string): Promise<RoomPreview | null> {
    if (!/^[A-Za-z0-9]{4,12}$/.test(code)) return null
    const preview = await listenTogetherApi.preview(code)
    if (preview) {
      shareUrl.value = 'https://ceru.shiqianjiang.cn/lt/' + preview.code
      shareText.value = buildShareText(preview.code, preview.name)
    }
    return preview
  }

  async function connectAndJoin(code: string) {
    disconnectSocket()
    resetRoomState()
    const token = await getAccessToken()
    if (!token) throw new Error('请先登录')
    const origin = new URL(CERU_API_RESOURCE).origin
    const statePromise = waitForState()
    const next = io(origin + '/lt', {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 15000
    })
    socket = next
    bindSocket(next, code)
    await statePromise
  }

  function bindSocket(sock: Socket, code: string) {
    sock.on('connect', () => {
      connected.value = true
      error.value = ''
      if (everJoined) sock.emit(CLIENT.RESUME, { code, lastSeq: current.value.seq })
      else sock.emit(CLIENT.JOIN, { code })
      schedulePings(sock)
    })
    sock.on('disconnect', () => {
      connected.value = false
    })
    sock.on('connect_error', (cause) => {
      connected.value = false
      if (joining.value) failJoin(cause)
      else error.value = '连接一起听服务器失败，正在重试…'
    })
    /**
     * 重连次数用尽。
     *
     * socket.io 放弃重连后不会再触发 disconnect/connect_error，界面会一直停在
     * 「已连接」或「正在重试…」，加入中的 join promise 也会挂到 18s 超时才失败。
     * 这里直接把真实情况说出来，并让进行中的加入立即失败。
     */
    sock.io.on('reconnect_failed', () => {
      connected.value = false
      const message = reconnectExhaustedMessage()
      if (joining.value) failJoin(new Error(message))
      else error.value = message
    })
    sock.on(SERVER.STATE, (state: RoomState) => {
      everJoined = true
      room.value = state.meta
      setListenTogetherPlaybackActive(!!state.meta)
      members.value = state.members || []
      current.value = state.current || emptySnapshot()
      queue.value = state.queue || []
      pending.value = state.pending || []
      chat.value = state.chat || []
      clockOffset.value = Number(state.serverTs || Date.now()) - Date.now()
      joining.value = false
      connected.value = true
      error.value = ''
      const resolveJoin = joinResolver
      clearJoinWait()
      resolveJoin?.(state)
      installPlayerSync()
      void applySnapshot(state.current, true)
    })
    sock.on(SERVER.DISMISSED, () => {
      error.value = '房间已解散'
      leaveLocal()
    })
    sock.on(SERVER.MEMBER_JOIN, (member: RoomMember) => {
      if (!members.value.some((item) => item.userId === member.userId)) {
        members.value = [...members.value, member]
      }
    })
    sock.on(SERVER.MEMBER_LEAVE, (payload: { userId: string }) => {
      members.value = members.value.filter((item) => item.userId !== payload.userId)
    })
    sock.on(SERVER.MEMBER_RECONNECT, (payload: { userId: string; nickname?: string }) => {
      const member = members.value.find((item) => item.userId === payload.userId)
      if (member && payload.nickname) member.nickname = payload.nickname
    })
    sock.on(SERVER.MEMBER_KICKED, (payload: { byUser?: { nickname?: string } }) => {
      error.value = (payload?.byUser?.nickname || '房主') + ' 将你移出了房间'
      leaveLocal()
    })
    sock.on(SERVER.ROLE_CHANGED, (payload: { userId: string; role: RoomRole }) => {
      const member = members.value.find((item) => item.userId === payload.userId)
      if (member) member.role = payload.role
    })
    sock.on(SERVER.SYNC, (snapshot: PlaybackSnapshot) => {
      if (!snapshot || Number(snapshot.seq) <= Number(current.value.seq)) return
      current.value = snapshot
      void applySnapshot(snapshot, false)
    })
    sock.on(SERVER.QUEUE_UPDATE, (payload: { queue: QueueItem[] }) => {
      queue.value = payload?.queue || []
    })
    sock.on(SERVER.PENDING_UPDATE, (payload: { pending: PendingItem[] }) => {
      /* PENDING_UPDATE 是全量替换，只有 canControl 的一方需要审批提醒；
       * 新出现的 reqId 用旧列表做差集，自己的点歌不提醒自己。 */
      const next = payload?.pending || []
      if (canControl.value) {
        const previousIds = new Set(pending.value.map((item) => item.reqId))
        const added = next.filter(
          (item) => !previousIds.has(item.reqId) && item.requesterId !== userId.value
        )
        if (added.length) notifyRoomPending(added, room.value?.name || '一起听', notifyPrefs())
      }
      pending.value = next
    })
    sock.on(SERVER.CHAT_MSG, (message: ChatMsg) => {
      appendChat(message)
      notifyChatIfNeeded(message)
    })
    sock.on(SERVER.CHAT_SYSTEM, (message: ChatMsg) => {
      appendChat(message)
    })
    sock.on(SERVER.PONG, (payload: { clientTs: number; serverTs: number }) => {
      const now = Date.now()
      const rtt = Math.max(0, now - Number(payload.clientTs || now))
      const offset = Number(payload.serverTs || now) - (Number(payload.clientTs || now) + rtt / 2)
      pingSamples.push({ offset, rtt })
      if (pingSamples.length > 20) pingSamples.shift()
      const sorted = [...pingSamples].sort((a, b) => a.rtt - b.rtt).slice(0, 7)
      if (sorted.length) {
        const values = sorted.map((item) => item.offset).sort((a, b) => a - b)
        clockOffset.value = values[Math.floor(values.length / 2)]
      }
    })
    sock.on(SERVER.ERROR, (payload: { code?: string; message?: string }) => {
      const message = payload?.message || payload?.code || '一起听发生错误'
      if (joining.value) {
        failJoin(new Error(message))
      } else {
        error.value = message
        if (payload.code === 'AUTH_FAILED') {
          window.dispatchEvent(new CustomEvent('ceru:unauthorized'))
        }
      }
    })
  }

  function appendChat(message: ChatMsg) {
    if (!message?.id || chat.value.some((item) => item.id === message.id)) return
    chat.value = [...chat.value.slice(-199), message]
  }

  /** 设置项每次现读，改完立即生效（与桌面端 getPrefs 语义一致）。 */
  function notifyPrefs() {
    const settings = useSettingsStore()
    return {
      notifyEnabled: settings.settings.ltNotifyEnabled,
      mentionStrong: settings.settings.ltMentionStrong
    }
  }

  /**
   * 只在收到别人的消息时提示：自己的消息由服务端回显，不该再弹一次；
   * 系统消息（成员进出/点歌结果）不推送，避免刷屏。
   */
  function notifyChatIfNeeded(message: ChatMsg) {
    if (!message || message.type === 'system') return
    if (message.from?.userId && message.from.userId === userId.value) return
    notifyRoomChat(
      message,
      room.value?.name || '一起听',
      isMentionedSelf(message, userId.value, chat.value),
      notifyPrefs()
    )
  }

  function schedulePings(sock: Socket) {
    clearPings()
    const burst = () => {
      for (let index = 0; index < 5; index++) {
        pingBurstTimers.push(
          setTimeout(() => {
            if (sock.connected) sock.emit(CLIENT.PING, { clientTs: Date.now() })
          }, index * 200)
        )
      }
    }
    burst()
    pingTimer = setInterval(() => {
      if (sock.connected) sock.emit(CLIENT.PING, { clientTs: Date.now() })
    }, 30000)
  }

  function clearPings() {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = undefined
    for (const timer of pingBurstTimers) clearTimeout(timer)
    pingBurstTimers = []
    pingSamples = []
  }

  async function applySnapshot(snapshot: PlaybackSnapshot, force: boolean) {
    if (!snapshot?.song) {
      if (snapshot && !snapshot.isPlaying) player.pause()
      return
    }
    applyChain = applyChain
      .then(async () => {
        suppressUntil = Date.now() + 3200
        const song = snapshot.song!
        const targetMs = getTargetPosition(snapshot) * 1000
        const same = isCurrentSong(song)
        if (!same) {
          const entity = songToEntity(song)
          await player.replaceHostQueue([entity])
          await player.hostPlay(entity)
        }
        const drift = Math.abs(player.positionMs - targetMs)
        if (force || drift > 1000) player.seek(targetMs)
        if (snapshot.isPlaying) {
          try {
            await player.resume()
            needsTap.value = false
          } catch {
            needsTap.value = true
          }
        } else {
          player.pause()
        }
        suppressUntil = Date.now() + 1800
      })
      .catch((cause) => {
        error.value = cause instanceof Error ? cause.message : '无法同步房间播放'
      })
    await applyChain
  }

  function getTargetPosition(snapshot: PlaybackSnapshot): number {
    return targetPositionAt(snapshot, serverNow())
  }

  function isCurrentSong(song: SongRef): boolean {
    const track = player.currentTrack
    return (
      !!track &&
      String(track.ref.id) === String(song.songmid) &&
      String(track.ref.providerId) === String(song.source)
    )
  }

  function songToEntity(song: SongRef): any {
    return {
      ref: {
        kind: 'track',
        providerId: song.source,
        id: song.songmid,
        scope: 'provider'
      },
      title: song.name || '未知歌曲',
      subtitle: song.singer || '',
      durationMs: Number(song.duration || 0) * 1000,
      playable: true,
      metadata: {
        artists: String(song.singer || '')
          .split(/[\/,，、]/)
          .map((item) => item.trim())
          .filter(Boolean),
        album: { title: song.albumName || '', id: song.albumId || '' },
        artworkUrl: song.cover || '',
        qualities: Array.isArray(song.types) ? song.types : []
      },
      rawLrc: song.lrc
    }
  }

  function trackToSongRef(track: Track): SongRef {
    const raw = track.raw || {}
    const source = String(raw.source || track.ref?.providerId || track.pluginKey || '')
    const songmid = String(raw.songmid || raw.songId || track.ref?.id || track.key)
    let parsedInterval = 0
    if (typeof raw.interval === 'string' && /^\d+:\d{1,2}$/.test(raw.interval)) {
      const [minutes, seconds] = raw.interval.split(':').map(Number)
      parsedInterval = minutes * 60 + seconds
    }
    const duration =
      Number(raw.intervalSeconds || raw.duration || parsedInterval || 0) ||
      (track.durationMs ? Math.round(track.durationMs / 1000) : 0)
    return {
      songmid,
      source,
      name: track.title,
      singer: track.artists.join(' / '),
      cover: track.artworkUrl,
      duration: duration || undefined,
      albumName: track.album,
      albumId: track.albumId,
      hash: raw.hash || raw.hashId || undefined,
      types: Array.isArray(raw.types) ? raw.types : track.qualities,
      lrc: raw.lrc || raw.lyric || null
    }
  }

  function installPlayerSync() {
    for (const stop of stopWatches) stop()
    stopWatches = [
      watch(
        () => player.status,
        (status) => {
          if (!inRoom.value || !socket?.connected || !canControl.value) return
          if (Date.now() < suppressUntil) return
          if (!current.value.song || !isCurrentSong(current.value.song)) return
          if (status === 'playing') {
            socket.emit(CLIENT.PLAY, { time: player.positionMs / 1000 })
          } else if (status === 'paused') {
            socket.emit(CLIENT.PAUSE, { time: player.positionMs / 1000 })
          } else if (status === 'ended') {
            socket.emit(CLIENT.SONG_ENDED, {
              songmid: current.value.song.songmid,
              source: current.value.song.source,
              seq: current.value.seq
            })
          }
        }
      ),
      watch(
        () => player.currentTrack?.key,
        () => {
          if (!inRoom.value || !socket?.connected || !canControl.value) return
          if (Date.now() < suppressUntil) return
          const track = player.currentTrack
          if (!track) return
          const song = trackToSongRef(track)
          if (!song.songmid || !song.source) return
          if (current.value.song && String(current.value.song.songmid) === song.songmid) return
          socket.emit(CLIENT.CHANGE_SONG, { song })
        }
      )
    ]
  }

  function emitControl(event: string, payload: any = {}) {
    if (!socket?.connected || !inRoom.value) return false
    if (!canControl.value) {
      error.value = '当前房间只有房主和管理员可以控制播放'
      return false
    }
    socket.emit(event, payload)
    return true
  }

  function play() {
    if (!current.value.song) return
    emitControl(CLIENT.PLAY, { time: player.positionMs / 1000 })
  }

  function pause() {
    emitControl(CLIENT.PAUSE, { time: player.positionMs / 1000 })
  }

  function seek(seconds: number) {
    emitControl(CLIENT.SEEK, { time: Math.max(0, seconds) })
  }

  function skip() {
    emitControl(CLIENT.SKIP, { seq: current.value.seq })
  }

  function previous() {
    emitControl(CLIENT.PREV, { seq: current.value.seq })
  }

  function playQueueItem(item: QueueItem) {
    const id = item.itemId || item.id
    if (id) emitControl(CLIENT.PLAY_QUEUE_ITEM, { itemId: id })
  }

  function changeToCurrentTrack() {
    const track = player.currentTrack
    if (!track) return false
    return emitControl(CLIENT.CHANGE_SONG, { song: trackToSongRef(track) })
  }

  function requestTrack(track: Track) {
    if (!track || !socket?.connected) return false
    socket.emit(CLIENT.QUEUE_REQUEST, { song: trackToSongRef(track) })
    return true
  }

  function requestCurrentTrack() {
    const track = player.currentTrack
    if (!track || !socket?.connected) return
    socket.emit(CLIENT.QUEUE_REQUEST, { song: trackToSongRef(track) })
  }

  function addTrackToQueue(track: Track) {
    if (!track) return false
    return emitControl(CLIENT.QUEUE_ADD, { song: trackToSongRef(track) })
  }

  function addCurrentToQueue() {
    const track = player.currentTrack
    if (!track) return
    emitControl(CLIENT.QUEUE_ADD, { song: trackToSongRef(track) })
  }

  function removeQueueItem(item: QueueItem) {
    const id = item.itemId || item.id
    if (id && socket?.connected) socket.emit(CLIENT.QUEUE_REMOVE, { itemId: id })
  }

  function approveRequest(item: PendingItem) {
    emitControl(CLIENT.QUEUE_APPROVE, { reqId: item.reqId })
  }

  function rejectRequest(item: PendingItem) {
    emitControl(CLIENT.QUEUE_REJECT, { reqId: item.reqId })
  }

  function promote(userIdValue: string) {
    if (!isOwner.value) return
    socket?.emit(CLIENT.ROLE_PROMOTE, { userId: userIdValue })
  }

  function demote(userIdValue: string) {
    if (!isOwner.value) return
    socket?.emit(CLIENT.ROLE_DEMOTE, { userId: userIdValue })
  }

  function kick(userIdValue: string) {
    // 与桌面 `kick` 同口径：admin+ 可踢（房主不能踢同级、也不能踢自己由服务端拒绝）。
    // 此前这里要求 `isOwner`，管理员即便拿到了入口也只会静默失效。
    if (!canControl.value) return
    socket?.emit(CLIENT.MEMBER_KICK, { userId: userIdValue })
  }

  /**
   * 发送聊天。meta 仅在非空时透传（桌面端同款语义）：后端按白名单转发
   * mentions / replyTo* / cardType+cardId，空对象不发，避免无意义字段。
   */
  function sendChat(
    content: string,
    type: 'text' | 'emoji' | 'sticker' = 'text',
    meta?: Record<string, string>
  ) {
    const value = content.trim()
    if (!value || !socket?.connected) return false
    const payload: { type: typeof type; content: string; meta?: Record<string, string> } = {
      type,
      content: value
    }
    if (meta && Object.keys(meta).length > 0) payload.meta = meta
    socket.emit(CLIENT.CHAT_SEND, payload)
    return true
  }

  function requireLogin() {
    if (auth.authenticated) return
    throw new Error('请先登录 Ceru 账号')
  }

  function buildShareText(code: string, name: string): string {
    return '「一起听」' + (name || '和你一起听歌') + '，打开澜音输入口令 #' + code + '# 加入。'
  }

  function leaveLocal() {
    for (const stop of stopWatches) stop()
    stopWatches = []
    clearPings()
    disconnectSocket()
    resetRoomState()
    joining.value = false
    leaving.value = false
  }

  function disconnectSocket() {
    if (!socket) return
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
    connected.value = false
  }

  async function leave() {
    if (leaving.value) return
    leaving.value = true
    try {
      if (socket?.connected) socket.emit(CLIENT.LEAVE, {})
      await new Promise((resolve) => setTimeout(resolve, 120))
    } finally {
      leaveLocal()
    }
  }

  function retryConnection() {
    const code = room.value?.code
    if (!code) return
    disconnectSocket()
    connected.value = false
    error.value = ''
    joining.value = true
    void connectAndJoin(code).catch((cause) => failJoin(cause))
  }

  async function resumeCurrentRoom(): Promise<{ code: string; name: string } | null> {
    if (!auth.authenticated) return null
    try {
      const value = await listenTogetherApi.currentRoom()
      if (!value) return null
      return { code: value.code, name: value.name }
    } catch {
      return null
    }
  }

  function memberProfile(userIdValue: string): MemberProfile | undefined {
    return members.value.find((item) => item.userId === userIdValue)
  }

  return {
    room,
    members,
    current,
    queue,
    pending,
    chat,
    connected,
    joining,
    leaving,
    error,
    shareUrl,
    shareText,
    needsTap,
    clockOffset,
    userId,
    myRole,
    isOwner,
    canControl,
    inRoom,
    currentSong,
    onlineMembers,
    createAndJoin,
    resolveAndJoin,
    joinByCode,
    leave,
    retryConnection,
    resumeCurrentRoom,
    getTargetPosition,
    play,
    pause,
    seek,
    skip,
    previous,
    playQueueItem,
    changeToCurrentTrack,
    requestTrack,
    requestCurrentTrack,
    addTrackToQueue,
    addCurrentToQueue,
    removeQueueItem,
    approveRequest,
    rejectRequest,
    promote,
    demote,
    kick,
    sendChat,
    memberProfile,
    memberRole,
    canRemoveQueueItem
  }
})

/**
 * 房间播放位置推算：以服务端锚点为基础，播放中按服务端时钟补上流逝时间。
 *
 * 抽成纯函数便于验证边界：暂停时不补偿、锚点在未来（时钟偏差）时不倒扣、
 * 负数锚点归零。now 由调用方传入，测试无需伪造全局时钟。
 */
/** 服务端字段可能是字符串甚至脏值，先收敛成有限数再做时间推算。 */
function finiteOrZero(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function targetPositionAt(
  snapshot: { isPlaying: boolean; anchorAt?: number | string; anchorPos?: number | string },
  now: number
): number {
  const anchorPos = finiteOrZero(snapshot.anchorPos)
  if (!snapshot.isPlaying) return Math.max(0, anchorPos)
  const anchorAt = finiteOrZero(snapshot.anchorAt)
  const elapsed = Math.max(0, (now - anchorAt) / 1000)
  return Math.max(0, anchorPos + elapsed)
}
