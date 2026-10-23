/**
 * 下载速率采样。
 *
 * 桌面端下载页每完成一个传输窗口就显示 `formatSpeed(task.speed)`（`downloadWorker`
 * 每秒算一次增量），移动端列表只有「已下载 / 总大小」两个数字：一首大文件下到一半，
 * 用户看不出是在正常推进还是已经卡死，只能盯着数字慢慢跳。
 *
 * 这里只做纯计算，采样点由下载 store 在更新 `receivedBytes` 时喂进来：
 * 取最近 `WINDOW_MS` 内最早与最新的两个样本算平均速率。用窗口而不是「每次增量 ÷
 * 间隔」，是因为原生 HTTP 下载拿不到进度回调，进度是整块跳变的，单次增量会把
 * 瞬时速度放大成几十倍。
 */

export interface SpeedSample {
  bytes: number
  at: number
}

/** 用于计算平均速率的采样窗口。窗口太短会被单次大跳变带偏。 */
export const SPEED_WINDOW_MS = 3000

/** 每秒最多保留的样本数上限，防止高频回调把数组撑大。 */
const MAX_SAMPLES = 12

export interface DownloadSpeedMeter {
  /** 记录一次新的已下载字节数；同一毫秒内的重复值直接忽略。 */
  sample(id: string, bytes: number, now?: number): void
  /** 当前速率（字节/秒）；样本不足或已过期时返回 0。 */
  speedOf(id: string, now?: number): number
  /** 任务结束、被删除或重新开始时清掉历史，避免下一段下载沿用旧样本。 */
  reset(id: string): void
  clear(): void
}

export function createDownloadSpeedMeter(windowMs = SPEED_WINDOW_MS): DownloadSpeedMeter {
  const samples = new Map<string, SpeedSample[]>()
  const window = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : SPEED_WINDOW_MS

  function prune(list: SpeedSample[], now: number): SpeedSample[] {
    // 只保留窗口内的样本，且至少保留最新的一个（全部过期时也要留下当下的水位）。
    let start = 0
    while (start < list.length - 1 && now - list[start].at > window) start += 1
    return start > 0 ? list.slice(start) : list
  }

  return {
    sample(id, bytes, now = Date.now()) {
      if (!Number.isFinite(bytes) || bytes < 0) return
      const list = prune(samples.get(id) ?? [], now)
      const last = list[list.length - 1]
      if (last && last.bytes === bytes) return
      // 字节数回退说明任务被重启了（重试/重新下载），旧样本不再代表这次传输。
      if (last && bytes < last.bytes) {
        samples.set(id, [{ bytes, at: now }])
        return
      }
      list.push({ bytes, at: now })
      samples.set(id, list.length > MAX_SAMPLES ? list.slice(-MAX_SAMPLES) : list)
    },

    speedOf(id, now = Date.now()) {
      const list = prune(samples.get(id) ?? [], now)
      if (list.length < 2) return 0
      const first = list[0]
      const last = list[list.length - 1]
      const elapsed = last.at - first.at
      // 同一毫秒内的两个样本算不出速率；返回 0 而不是 Infinity。
      if (elapsed <= 0) return 0
      const delta = last.bytes - first.bytes
      return delta > 0 ? (delta * 1000) / elapsed : 0
    },

    reset(id) {
      samples.delete(id)
    },

    clear() {
      samples.clear()
    }
  }
}

/** 下载速率文案；取不到速率时返回空串，调用方据此隐藏整段。与桌面端 `formatSpeed` 同格式。 */
export function formatDownloadSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return ''
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let value = bytesPerSecond
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`
}

/** 应用内共享的速率表：store 负责采样，下载页只读取。 */
export const downloadSpeedMeter = createDownloadSpeedMeter()
