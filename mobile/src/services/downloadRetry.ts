/**
 * 下载失败的自动重试，对齐桌面 `DownloadManager.handleTaskError`：
 *
 * ```ts
 * if (task.retries < 3) {
 *   task.retries++
 *   task.status = Queued
 *   this.queue.unshift(taskId)      // 重试排到队首，不让它排到队尾
 * } else {
 *   task.status = Error
 *   task.error = error.message
 * }
 * ```
 *
 * 移动端在第一次失败时就把任务标成「失败」：网络抖一下、插件短暂 429、
 * 原生 HTTP 偶发超时，整首歌就要用户手动点「重试」——一批下载里网络一抖，
 * 十几首一起变红。
 *
 * 重试的边界必须守住，否则会把用户的等待变成「一直转圈」：
 * - 只重试**临时性**失败。歌曲文件不存在、内容类型不是音频、文件超限这类
 *   换个时间再下也一样的结果，重试三次只是让失败晚到；
 * - 用户取消 / 暂停的绝不能重试（重试等于无视用户操作）；
 * - 次数到上限后如实报错，并把最后一次失败原因带上。
 */

/** 与桌面 `handleTaskError` 一致：最多自动重试 3 次。 */
export const MAX_DOWNLOAD_RETRIES = 3

/** 临时性失败的识别特征。 */
const TRANSIENT_PATTERNS = [
  /HTTP\s*(5\d\d|429)/i,
  /ERR_(INTERNET_DISCONNECTED|NETWORK_CHANGED|CONNECTION_\w+|TIMED_OUT|NAME_NOT_RESOLVED)/i,
  /failed to fetch/i,
  /network\s*(request\s*)?failed/i,
  /timeout|timed out|超时/i,
  /socket\s*(hang up|error|timeout)/i,
  /ECONN(RESET|REFUSED|ABORTED)/i
]

/** 明确不该重试的失败（命中这些优先于临时性判定）。 */
const PERMANENT_PATTERNS = [
  /不是音频/,
  /不在资料库/,
  /不在播放队列/,
  /无法解析播放地址/,
  /超过\s*\d+\s*MB/,
  /HTTP\s*40[0134]/i,
  /文件夹不可写|权限/,
  /源文件.*不存在/
]

export function isTransientDownloadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (!message) return false
  if (PERMANENT_PATTERNS.some((pattern) => pattern.test(message))) return false
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(message))
}

export interface DownloadFailureInput {
  /** 这个任务已经自动重试过几次。 */
  retries: number
  /** 失败时任务已经被用户取消或暂停。 */
  cancelled: boolean
  /** 失败是否属于临时性问题。 */
  transient: boolean
  message: string
}

export type DownloadFailurePlan =
  | { action: 'retry'; retries: number; atFront: boolean }
  | { action: 'fail'; error: string }

/**
 * 决定一次下载失败之后该做什么。
 *
 * 重试排到**队首**（桌面 `queue.unshift`）：失败的任务已经等过一轮，
 * 排回队尾会让它在几十首的队列里再等一遍；用户看到的是「重试了但半天不动」。
 */
export function planDownloadFailure(input: DownloadFailureInput): DownloadFailurePlan {
  const message = String(input.message ?? '').trim() || '下载失败'
  if (input.cancelled) return { action: 'fail', error: message }
  if (!input.transient) return { action: 'fail', error: message }
  const retries = Number.isFinite(input.retries) ? Math.max(0, Math.floor(input.retries)) : 0
  if (retries >= MAX_DOWNLOAD_RETRIES) return { action: 'fail', error: message }
  return { action: 'retry', retries: retries + 1, atFront: true }
}
