/**
 * 帖子音乐附件的封面，对齐桌面端 `community/usePostAttachmentCover.ts`。
 *
 * 单曲附件用 `song.img`；歌单附件优先自身封面，其次预览第一首的封面。
 * 两者都没有时（老帖子、预览为空），桌面版会按 `listId` 去云端歌单取第一首的
 * 封面——移动端此前这种情况直接不渲染附件卡片，一条带歌单的帖子看起来像纯文字。
 *
 * 抓取按 `listId` 去重缓存：信息流一次会渲染几十条帖子，同一个歌单不该反复请求；
 * 失败也缓存成空串，避免每次滚动都重试一个拿不到封面的歌单。
 */

export interface AttachmentCoverInput {
  type: 'song' | 'playlist'
  song?: Record<string, any> | null
  cover?: string
  preview?: Array<Record<string, any>>
  listId?: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 本地就能确定的封面；返回空串表示需要回落去云端取。 */
export function localAttachmentCover(attachment: AttachmentCoverInput | null | undefined): string {
  if (!attachment) return ''
  if (attachment.type === 'song') return text(attachment.song?.img)
  return text(attachment.cover) || text(attachment.preview?.[0]?.img)
}

/** 这条附件是否值得为它去云端补一次封面。 */
export function needsRemoteCover(attachment: AttachmentCoverInput | null | undefined): boolean {
  if (!attachment || attachment.type !== 'playlist') return false
  if (localAttachmentCover(attachment)) return false
  return Boolean(text(attachment.listId))
}

export interface RemoteCoverCache {
  get(listId: string): string | undefined
  set(listId: string, cover: string): void
  readonly size: number
}

/** 小容量缓存：只需要覆盖当前信息流里出现过的歌单。 */
export function createRemoteCoverCache(limit = 200): RemoteCoverCache {
  const map = new Map<string, string>()
  return {
    get: (listId) => map.get(listId),
    set(listId, cover) {
      if (map.has(listId)) map.delete(listId)
      map.set(listId, cover)
      while (map.size > Math.max(1, limit)) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
    },
    get size() {
      return map.size
    }
  }
}
