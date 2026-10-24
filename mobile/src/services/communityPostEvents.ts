/**
 * 社区帖子下线的共享信号。
 *
 * 桌面版帖子详情是弹层，举报导致自动下线、或删除成功后直接
 * `emit('removed', postId)`，信息流据此把卡片移走。移动端是独立页面
 * （`/community/:id`），Ionic 会把上一页留在 DOM 里、组件不重新挂载，
 * `onMounted` 不会再跑一次——于是被下线的帖子仍留在信息流上，
 * 用户点进去才发现已经打不开。
 *
 * 这里做一个最小桥接（与 `lyricsBridge` 同一模式）：详情页在帖子被下线或
 * 删除后广播一次，信息流订阅并过滤。桥不持有状态、不做缓存。
 */

type Listener = (postId: string) => void

const listeners = new Set<Listener>()

/** 订阅帖子下线；返回取消函数。 */
export function onCommunityPostRemoved(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 详情页调用：帖子被自动下线或删除后广播一次。 */
export function publishCommunityPostRemoved(postId: string): void {
  const id = String(postId || '').trim()
  if (!id) return
  for (const listener of listeners) {
    try {
      listener(id)
    } catch (error) {
      // 单个订阅者出错不能影响其它订阅者，也不能中断调用方后续的跳转。
      console.warn('社区帖子事件订阅者出错', error)
    }
  }
}

/** 测试用：清空订阅。 */
export function resetCommunityPostEvents(): void {
  listeners.clear()
}
