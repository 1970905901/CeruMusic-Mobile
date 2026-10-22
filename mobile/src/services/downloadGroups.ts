/**
 * 下载列表的分组与排序，对齐桌面版 `views/download/index.vue` 的
 * `filteredTasks`：分「进行中 / 已完成 / 失败」三类，并按状态优先级排序。
 *
 * 移动端此前是一个平铺列表，任务一多就分不清哪些在跑、哪些失败了。
 */

export type DownloadTab = 'active' | 'completed' | 'failed'

/** 进行中：真正在传输、排队等待、以及被暂停的（与桌面版口径一致）。 */
const ACTIVE_STATUSES = ['running', 'queued', 'paused'] as const
const COMPLETED_STATUSES = ['completed'] as const
const FAILED_STATUSES = ['failed', 'cancelled'] as const

export interface GroupableTask {
  id: string
  status: string
  createdAt: number
  receivedBytes?: number
  totalBytes?: number
}

export function taskMatchesTab(status: string, tab: DownloadTab): boolean {
  if (tab === 'active') return (ACTIVE_STATUSES as readonly string[]).includes(status)
  if (tab === 'completed') return (COMPLETED_STATUSES as readonly string[]).includes(status)
  return (FAILED_STATUSES as readonly string[]).includes(status)
}

/** 三类各自的计数，用于标签页角标。 */
export function countByTab(tasks: readonly GroupableTask[]): Record<DownloadTab, number> {
  const counts: Record<DownloadTab, number> = { active: 0, completed: 0, failed: 0 }
  for (const task of tasks) {
    if (taskMatchesTab(task.status, 'active')) counts.active++
    else if (taskMatchesTab(task.status, 'completed')) counts.completed++
    else if (taskMatchesTab(task.status, 'failed')) counts.failed++
  }
  return counts
}

/**
 * 「进行中」里各状态的展示优先级：正在下载 > 排队 > 暂停。
 *
 * 桌面版同样把 running 排在 queued 前面，否则暂停的任务会插在正在下载的中间。
 */
const STATUS_PRIORITY: Record<string, number> = {
  running: 0,
  queued: 1,
  paused: 2
}

/**
 * 过滤 + 排序。
 *
 * 进行中按「状态优先级 → 创建时间（早的在前）」；
 * 已完成与失败按创建时间倒序（最近的在最上面，用户最关心刚结束的那个）。
 */
export function selectDownloadTasks<T extends GroupableTask>(
  tasks: readonly T[],
  tab: DownloadTab
): T[] {
  const filtered = tasks.filter((task) => taskMatchesTab(task.status, tab))
  if (tab === 'active') {
    return filtered.sort((left, right) => {
      const byStatus =
        (STATUS_PRIORITY[left.status] ?? 99) - (STATUS_PRIORITY[right.status] ?? 99)
      if (byStatus !== 0) return byStatus
      return left.createdAt - right.createdAt
    })
  }
  return filtered.sort((left, right) => right.createdAt - left.createdAt)
}

/** 任务的下载进度（0–1）。未知总大小时给一个很小的非零值，让进度条可见。 */
export function taskProgress(task: GroupableTask): number {
  const total = Number(task.totalBytes) || 0
  const received = Number(task.receivedBytes) || 0
  if (total <= 0) return received > 0 ? 0.02 : 0
  return Math.max(0, Math.min(1, received / total))
}
