export interface PluginScheduledTask {
  id: string
  commandId: string
  intervalMs: number
}

export interface PluginScheduledTaskRequest {
  id?: unknown
  commandId?: unknown
  intervalMs?: unknown
}

export const TASK_ID_PATTERN = /^[a-zA-Z0-9._-]{1,80}$/
export const MIN_TASK_INTERVAL_MS = 60_000
export const MAX_TASK_INTERVAL_MS = 86_400_000

/**
 * Plugin tasks are in-app periodic commands. The host does not promise OS-level
 * background wakeups, so the same interval bounds as desktop prevent plugins
 * from turning a foreground WebView timer into a spam loop.
 */
export function validateScheduledTask(
  request: PluginScheduledTaskRequest,
  allowedActions: readonly string[]
): PluginScheduledTask {
  const id = String(request?.id ?? '')
  const commandId = String(request?.commandId ?? '')
  const intervalMs = Number(request?.intervalMs)
  if (!TASK_ID_PATTERN.test(id)) throw new Error('任务 ID 无效')
  if (!allowedActions.includes(commandId)) throw new Error('后台任务引用了未注册操作')
  if (!Number.isSafeInteger(intervalMs) || intervalMs < MIN_TASK_INTERVAL_MS || intervalMs > MAX_TASK_INTERVAL_MS) {
    throw new Error('后台任务间隔必须在 1 分钟到 24 小时之间')
  }
  return { id, commandId, intervalMs }
}
