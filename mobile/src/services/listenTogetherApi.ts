import { ceruApi } from '@/services/ceruApi'

export type RoomMode = 'intimate' | 'group'
export type RoomRole = 'owner' | 'admin' | 'member'

export interface SongRef {
  songmid: string
  source: string
  name?: string
  singer?: string
  cover?: string
  duration?: number
  albumName?: string
  albumId?: string
  hash?: string
  types?: any[]
  lrc?: string | null
  url?: string
}

export interface RoomMeta {
  code: string
  mode: RoomMode
  ownerId: string
  name: string
  maxMembers: number
  createdAt: number
}

export interface MemberProfile {
  userId: string
  nickname: string
  avatar?: string
}

export interface RoomMember extends MemberProfile {
  role: RoomRole
}

export interface PlaybackSnapshot {
  song: SongRef | null
  isPlaying: boolean
  anchorPos: number
  anchorAt: number
  seq: number
  action?: string
  operatorId?: string
}

export interface QueueItem {
  id?: string
  itemId?: string
  song: SongRef
  requesterId?: string
  requesterName?: string
  addedBy?: MemberProfile
  addedAt?: number
  ts?: number
}

export interface PendingRequester extends MemberProfile {}

export interface PendingItem {
  reqId: string
  song: SongRef
  requesterId: string
  requesterName: string
  requesters?: PendingRequester[]
  requestedAt: number
}

export type ChatMsgType = 'text' | 'emoji' | 'sticker' | 'system'

export interface ChatMsg {
  id: string
  type: ChatMsgType
  content: string
  from: MemberProfile | null
  meta?: Record<string, string>
  ts: number
}

export interface RoomState {
  meta: RoomMeta
  members: RoomMember[]
  current: PlaybackSnapshot
  queue: QueueItem[]
  pending: PendingItem[]
  chat: ChatMsg[]
  serverTs: number
}

export interface CreateRoomPayload {
  mode: RoomMode
  name?: string
  maxMembers?: number
}

export interface CreateRoomResponse extends RoomMeta {
  shareUrl: string
  shareText: string
}

export interface RoomPreview {
  code: string
  mode: RoomMode
  name: string
  ownerId?: string
  maxMembers: number
  createdAt: number
}

const BASE = '/listen-together'

export function extractRoomCode(value: string): string {
  const text = value.trim()
  const marked = text.match(/#([A-Za-z0-9]{6})#/)
  if (marked) return marked[1].toUpperCase()
  const direct = text.toUpperCase()
  if (/^[A-HJ-NP-Z2-9]{6}$/.test(direct)) return direct
  return direct.slice(0, 12)
}

export const listenTogetherApi = {
  create(payload: CreateRoomPayload) {
    return ceruApi<CreateRoomResponse>(
      BASE + '/create',
      { method: 'POST', body: JSON.stringify(payload) },
      'required'
    )
  },
  resolve(code: string) {
    return ceruApi<RoomPreview | null>(
      BASE + '/resolve',
      { method: 'POST', body: JSON.stringify({ code }) },
      'required'
    )
  },
  async preview(code: string): Promise<RoomPreview | null> {
    try {
      const response = await fetch(
        'https://api.ceru.shiqianjiang.cn/api' + BASE + '/' + encodeURIComponent(code)
      )
      if (!response.ok) return null
      const payload = await response.json()
      return payload?.data ?? null
    } catch {
      return null
    }
  },
  currentRoom() {
    return ceruApi<{ code: string; mode: RoomMode; name: string } | null>(
      BASE + '/my/current',
      {},
      'required'
    )
  }
}
