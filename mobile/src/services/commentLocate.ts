/**
 * 评论定位（桌面端 `PostDetailModal` 的跳转高亮能力，移动端补齐）。
 *
 * 通知里的 `commentId` 可能是根评论，也可能是某条回复。回复不单独渲染在
 * 顶层列表里，必须找到它所属的根评论。这里把这层映射抽成纯函数，
 * 页面只负责滚动与高亮。
 */

export interface LocateComment {
  id: string
  replies?: readonly { id: string }[]
}

export interface CommentLocation {
  /** 需要在顶层列表里展开/滚动的根评论 id */
  rootId: string
  /** 真正要高亮的评论 id（命中回复时为回复自身） */
  targetId: string
  /** 命中回复时需要先展开该根评论的回复 */
  needsReplies: boolean
}

/**
 * 在已加载的评论树里定位目标评论。
 *
 * - 命中根评论：直接定位该根评论；
 * - 命中回复：返回所属根评论，并标记需要展开回复；
 * - 找不到（未加载到/已删除）：返回 null，调用方应提示而不是静默失败。
 */
export function locateComment(
  comments: readonly LocateComment[],
  commentId: string | null | undefined
): CommentLocation | null {
  const id = String(commentId ?? '').trim()
  if (!id) return null
  for (const comment of comments ?? []) {
    if (comment.id === id) {
      return { rootId: comment.id, targetId: comment.id, needsReplies: false }
    }
    const reply = comment.replies?.find((item) => item.id === id)
    if (reply) {
      return { rootId: comment.id, targetId: reply.id, needsReplies: true }
    }
  }
  return null
}

/** 高亮持续时间：与桌面端 1.6s 的闪烁反馈保持一致。 */
export const COMMENT_HIGHLIGHT_MS = 1600