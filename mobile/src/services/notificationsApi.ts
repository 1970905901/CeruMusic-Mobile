import { ceruApi } from '@/services/ceruApi'

export type MessageCategory = 'all' | 'notice' | 'interaction' | 'comment'

export interface InboxMessage {
  id: string
  category: Exclude<MessageCategory, 'all'>
  kind: string
  title: string
  content: string
  format: 'plain' | 'markdown' | 'iframe'
  embedUrl: string | null
  maxHeight: number
  actorId: string | null
  actorName: string | null
  actorAvatar: string | null
  postId: string | null
  commentId: string | null
  cover: string | null
  createdAt: string
  read: boolean
}

export interface UnreadCounts {
  all: number
  notice: number
  interaction: number
  comment: number
}

export const notificationsApi = {
  list(category: MessageCategory, cursor?: string) {
    const query = '?category=' + encodeURIComponent(category) + '&limit=30' +
      (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')
    return ceruApi<{ items: InboxMessage[]; nextCursor: string | null }>(
      '/notifications' + query,
      {},
      'required'
    )
  },
  counts() {
    return ceruApi<UnreadCounts>('/notifications/unread', {}, 'required')
  },
  read(ids: string[]) {
    return ceruApi<{ ids: string[] }>(
      '/notifications/read',
      { method: 'POST', body: JSON.stringify({ ids }) },
      'required'
    )
  },
  clear() {
    return ceruApi<{ count: number }>('/notifications/read', { method: 'DELETE' }, 'required')
  }
}