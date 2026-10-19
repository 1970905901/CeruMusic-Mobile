import type { Track } from '@/types/music'

export type CommentKind = 'hot' | 'latest'

export interface MusicComment {
  id: string
  text: string
  time: number
  timeStr: string
  location: string
  userName: string
  avatar: string
  userId: string | number
  likedCount: number
  images: string[]
  reply: MusicComment[]
}

export interface CommentPage {
  source: string
  comments: MusicComment[]
  total: number
  page: number
  limit: number
  maxPage: number
}

export interface CommentPageFallback {
  source: string
  page: number
  limit: number
}

export const COMMENT_PAGE_SIZE = 20

const COMMENT_ACTIONS: Record<CommentKind, string> = {
  hot: 'comments.hot',
  latest: 'comments.get'
}

function objectValue(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function finiteInteger(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = textValue(value).trim()
    if (text) return text
  }
  return ''
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && !!item.trim())
    .slice(0, limit)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatCommentTime(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  let timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  if (timestamp < 1_000_000_000_000) timestamp *= 1000
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function normalizeComment(value: unknown, index: number, depth: number): MusicComment {
  const raw = objectValue(value) ? value : {}
  const id = firstString(raw.id, raw.commentId, raw.comment_id) || `comment-${index}`
  const userName = firstString(raw.userName, raw.username, raw.nickname, raw.name) || '匿名用户'
  const avatar = firstString(raw.avatar, raw.avatarUrl, raw.userAvatar, raw.avatar_url)
  const time = finiteInteger(raw.time ?? raw.timestamp, 0)
  const replySource = Array.isArray(raw.reply)
    ? raw.reply
    : Array.isArray(raw.replies)
      ? raw.replies
      : Array.isArray(raw.repliedComments)
        ? raw.repliedComments
        : []
  return {
    id,
    text: firstString(raw.text, raw.content),
    time,
    timeStr: formatCommentTime(raw.timeStr ?? raw.time ?? raw.timestamp),
    location: firstString(raw.location, raw.ipLocation, raw.ip_location),
    userName,
    avatar,
    userId: typeof raw.userId === 'number' || typeof raw.userId === 'string' ? raw.userId : '',
    likedCount: Math.max(0, finiteInteger(raw.likedCount ?? raw.likeCount, 0)),
    images: stringList(raw.images ?? raw.pics, 20),
    reply:
      depth >= 1
        ? []
        : replySource
            .slice(0, 50)
            .map((item: unknown, replyIndex: number) =>
              normalizeComment(item, replyIndex, depth + 1)
            )
  }
}

/**
 * Plugin comments are a compatibility boundary: older providers spell fields
 * differently, but pagination and malformed responses must still fail visibly.
 */
export function normalizeCommentPage(
  value: unknown,
  fallback: CommentPageFallback
): CommentPage {
  if (!objectValue(value) || !Array.isArray(value.comments)) {
    throw new Error('插件返回了无效的评论数据')
  }
  const limit = Math.min(100, Math.max(1, finiteInteger(value.limit, fallback.limit)))
  const page = Math.max(1, finiteInteger(value.page, fallback.page))
  const comments = value.comments
    .filter((item: unknown) => objectValue(item))
    .map((item: unknown, index: number) => normalizeComment(item, index, 0))
  const total = Math.max(0, finiteInteger(value.total, 0))
  let maxPage = Math.max(0, finiteInteger(value.maxPage, 0))
  if (maxPage === 0 && total > 0) maxPage = Math.ceil(total / limit)
  if (maxPage === 0 && comments.length > 0) maxPage = page
  if (maxPage > 0 && maxPage < page) maxPage = page
  return {
    source: firstString(value.source, fallback.source),
    comments,
    total,
    page,
    limit,
    maxPage
  }
}

export function commentActionFor(kind: CommentKind): string {
  return COMMENT_ACTIONS[kind]
}

export function commentKindLabel(kind: CommentKind): string {
  return kind === 'hot' ? '热门评论' : '最新评论'
}

function formatInterval(durationMs: number | undefined): string {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000))
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`
}

/**
 * The comments action historically receives the host's MusicItem shape. Build
 * that shape from the mobile Track while retaining the public/private ref so
 * private providers can route the request back to their own connection.
 */
export function buildCommentSong(track: Track, source: string): Record<string, any> {
  const raw = objectValue(track.raw) ? track.raw : {}
  const original = objectValue(raw.ref?.data?.song) ? raw.ref.data.song : {}
  const metadata = objectValue(raw.metadata) ? raw.metadata : {}
  const originalTypes = Array.isArray(original.types) ? original.types : []
  const types = track.qualities.length
    ? track.qualities.map((type) => {
        const sizeBytes = track.qualitySizes?.[type]
        return Number.isSafeInteger(sizeBytes) && sizeBytes && sizeBytes > 0
          ? { type, sizeBytes }
          : { type }
      })
    : originalTypes
  return {
    ...original,
    songmid: track.ref.id,
    ...(metadata.hash || original.hash ? { hash: metadata.hash || original.hash } : {}),
    source,
    name: track.title || firstString(original.name),
    singer: track.artists.join('、') || firstString(original.singer, track.subtitle),
    albumName: track.album || firstString(original.albumName),
    albumId: track.albumId || original.albumId || '',
    interval: firstString(original.interval) || formatInterval(track.durationMs),
    img: track.artworkUrl || firstString(original.img),
    lrc: typeof original.lrc === 'string' ? original.lrc : null,
    types,
    _types: {
      ...(objectValue(original._types) ? original._types : {}),
      ...Object.fromEntries(
        types.map((entry: any) => [entry.type, { ...original._types?.[entry.type], ...entry }])
      )
    },
    pluginResource: JSON.parse(JSON.stringify(track.ref))
  }
}

export function mergeCommentPages(
  current: readonly MusicComment[],
  incoming: readonly MusicComment[]
): MusicComment[] {
  const result = [...current]
  const seen = new Set(
    current.map((item) => item.id || `${item.userName}|${item.timeStr}|${item.text}`)
  )
  for (const item of incoming) {
    const key = item.id || `${item.userName}|${item.timeStr}|${item.text}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

export function commentPageHasMore(
  page: Pick<CommentPage, 'page' | 'total' | 'maxPage'>,
  loadedCount: number
): boolean {
  if (page.maxPage > 0) return page.page < page.maxPage
  return page.total > loadedCount
}
