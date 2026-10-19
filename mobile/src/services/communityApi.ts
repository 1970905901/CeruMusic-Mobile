import { ceruApi } from '@/services/ceruApi'

const BASE = '/community'

export interface PostImage {
  url: string
  w: number
  h: number
}

export type PostImageOrUrl = PostImage | string

export interface PostAttachment {
  type: 'song' | 'playlist'
  song?: Record<string, any>
  listId?: string
  name?: string
  cover?: string
  songCount?: number
  preview?: Array<Record<string, any>>
}

export interface SelfHarmSupport {
  title: string
  text: string
  hotline?: string
}

export type PublishResult<T> = T & { support?: SelfHarmSupport }

export interface CommunityPost {
  id: string
  userId: string
  username: string
  userAvatar: string | null
  content: string
  images: PostImageOrUrl[]
  attachment: PostAttachment | null
  ipLocation?: string | null
  likeCount: number
  commentCount: number
  createdAt: string
  liked: boolean
}

export interface CommunityComment {
  id: string
  postId: string
  userId: string
  username: string
  userAvatar: string | null
  content: string
  parentId: string | null
  replyToUsername: string | null
  ipLocation?: string | null
  likeCount: number
  liked: boolean
  createdAt: string
  replyCount?: number
}

export interface ListResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  rootTotal?: number
  hasMore?: boolean
}

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const text = query.toString()
  return text ? '?' + text : ''
}

export const communityApi = {
  uploadImage(file: File) {
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
    if (file.size > 10 * 1024 * 1024) throw new Error('单张图片不能超过 10MB')
    const form = new FormData()
    form.append('file', file)
    return ceruApi<PostImage>(BASE + '/upload-image', { method: 'POST', body: form }, 'required')
  },

  createPost(payload: {
    content: string
    images?: PostImageOrUrl[]
    attachment?: PostAttachment
  }) {
    return ceruApi<PublishResult<CommunityPost>>(
      BASE + '/posts',
      { method: 'POST', body: JSON.stringify(payload) },
      'required'
    )
  },

  listPosts(params: {
    sort?: 'latest' | 'recommend'
    page?: number
    pageSize?: number
    userId?: string
  }) {
    return ceruApi<ListResult<CommunityPost>>(
      BASE + '/posts' + queryString(params),
      {},
      'optional'
    )
  },

  getPost(id: string) {
    return ceruApi<CommunityPost>(BASE + '/posts/' + encodeURIComponent(id), {}, 'optional')
  },

  updatePost(
    id: string,
    payload: { content: string; images?: PostImageOrUrl[]; attachment?: PostAttachment }
  ) {
    return ceruApi<PublishResult<CommunityPost>>(
      BASE + '/posts/' + encodeURIComponent(id),
      { method: 'PATCH', body: JSON.stringify(payload) },
      'required'
    )
  },

  deletePost(id: string) {
    return ceruApi<{ ok: boolean }>(
      BASE + '/posts/' + encodeURIComponent(id),
      { method: 'DELETE' },
      'required'
    )
  },

  toggleLike(id: string) {
    return ceruApi<{ liked: boolean }>(
      BASE + '/posts/' + encodeURIComponent(id) + '/like',
      { method: 'POST', body: '{}' },
      'required'
    )
  },

  listComments(id: string, page = 1, pageSize = 20) {
    return ceruApi<ListResult<CommunityComment>>(
      BASE + '/posts/' + encodeURIComponent(id) + '/comments' + queryString({ page, pageSize }),
      {},
      'optional'
    )
  },

  listReplies(rootId: string, page = 1, pageSize = 50) {
    return ceruApi<ListResult<CommunityComment>>(
      BASE + '/comments/' + encodeURIComponent(rootId) + '/replies' +
        queryString({ page, pageSize }),
      {},
      'optional'
    )
  },

  createComment(payload: {
    postId: string
    content: string
    parentId?: string
    replyToCommentId?: string
    replyToUsername?: string
  }) {
    return ceruApi<PublishResult<CommunityComment>>(
      BASE + '/comments',
      { method: 'POST', body: JSON.stringify(payload) },
      'required'
    )
  },

  deleteComment(id: string) {
    return ceruApi<{ ok: boolean }>(
      BASE + '/comments/' + encodeURIComponent(id),
      { method: 'DELETE' },
      'required'
    )
  },

  toggleCommentLike(id: string) {
    return ceruApi<{ liked: boolean }>(
      BASE + '/comments/' + encodeURIComponent(id) + '/like',
      { method: 'POST', body: '{}' },
      'required'
    )
  },

  report(payload: { postId: string; reason: string }) {
    return ceruApi<{ ok: boolean; already?: boolean; autoOffline?: boolean }>(
      BASE + '/report',
      { method: 'POST', body: JSON.stringify(payload) },
      'required'
    )
  }
}
