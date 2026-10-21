/**
 * 通知点击后的跳转意图（桌面端 `NotificationCenter.vue` 的 openMessage 规则）。
 *
 * 桌面端点击互动类通知会带着 `replyTo` 打开对应帖子的评论详情，移动端此前
 * 只跳到帖子、不定位评论。这里把「该跳到哪、是否预填回复」抽成纯函数，
 * 页面只负责导航，避免两处各写一套判定。
 */

export interface NotificationTargetInput {
  kind: string
  postId: string | null
  commentId: string | null
  actorName?: string | null
}

export interface NotificationTarget {
  /** 社区帖子详情路径；没有 postId 时为空（系统通知/无跳转） */
  path: string
  /** 是否为回复类通知：需要进入评论并预填回复 */
  reply: boolean
  /** 预填回复时的展示名 */
  replyToName?: string
}

/**
 * 互动类（赞与回复 / 评论）才带 commentId；`kind` 为 reply/comment 时桌面端
 * 会预填「回复 @昵称」。系统通知与无 postId 的消息不跳转。
 */
export function resolveNotificationTarget(
  item: NotificationTargetInput
): NotificationTarget | null {
  const postId = String(item?.postId ?? '').trim()
  if (!postId) return null
  const commentId = String(item?.commentId ?? '').trim()
  const reply = Boolean(commentId) && (item.kind === 'reply' || item.kind === 'comment')
  const path = reply
    ? '/community/' + encodeURIComponent(postId) + '?comment=' + encodeURIComponent(commentId)
    : '/community/' + encodeURIComponent(postId)
  return {
    path,
    reply,
    ...(reply ? { replyToName: item.actorName || '音乐同好' } : {})
  }
}