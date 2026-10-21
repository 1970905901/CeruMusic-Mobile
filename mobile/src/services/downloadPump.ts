/**
 * 下载队列的「补位」判定。
 *
 * 队列靠状态驱动并发：`runTask` 在容量不足时把任务退回 queued，只在某个任务
 * 跑完/失败时才尝试拉起下一个。于是**暂停**或**取消**一个正在下���的任务会
 * 白白空出一个并发位，却没人去补——队列里剩下的歌要等到下一次有任务结束
 * 才会开始。`pauseAll` 这类操作尤其明显：恢复后只有前 N 个会动。
 *
 * 这里把「现在该拉起哪些任务」抽成纯函数，供暂停/取消/改并发数后统一调用。
 */

export const DOWNLOAD_STATUS_QUEUED = 'queued'
export const DOWNLOAD_STATUS_RUNNING = 'running'

export interface PumpCandidate {
  id: string
  status: string
}

/**
 * 挑出可以立即开始的任务 id。
 *
 * - 只在有空闲并发位时返回，且按队列顺序（数组顺序即优先级）。
 * - 不重复统计已经在跑的任务。
 * - `limit` 小于 1 时按 1 处理，与 store 里 `Math.max(1, ...)` 的口径一致。
 */
export function selectTasksToStart(
  tasks: readonly PumpCandidate[],
  limit: number
): string[] {
  const capacity = Math.max(1, Math.floor(Number(limit) || 1))
  const running = tasks.filter((task) => task.status === DOWNLOAD_STATUS_RUNNING).length
  let free = capacity - running
  if (free <= 0) return []
  const result: string[] = []
  for (const task of tasks) {
    if (task.status !== DOWNLOAD_STATUS_QUEUED) continue
    result.push(task.id)
    free -= 1
    if (free <= 0) break
  }
  return result
}
