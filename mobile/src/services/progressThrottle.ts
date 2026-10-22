/**
 * 下载进度写库的节流判定。
 *
 * `xhr.onprogress` 每秒触发几十次；每次都写 IndexedDB 并向所有插件广播
 * `downloads.changed`，写入队列会被排满，界面滚动与插件回调一起变卡。
 * 但**状态跃迁**（开始 / 暂停 / 完成 / 失败 / 取消）不能节流：应用被系统
 * 杀掉时，已完成的任务若还停在旧状态，重开后会当作未完成继续下载。
 */

export const PROGRESS_PERSIST_INTERVAL_MS = 800

export interface ProgressThrottle {
  /**
   * 这次更新是否需要立刻落库。
   * `hasStatusChange` 为真时永远返回 true，并重置计时。
   */
  shouldWrite(id: string, hasStatusChange: boolean, now?: number): boolean
}

export function createProgressThrottle(
  intervalMs: number = PROGRESS_PERSIST_INTERVAL_MS
): ProgressThrottle {
  const lastWrite = new Map<string, number>()
  const interval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 0

  return {
    shouldWrite(id, hasStatusChange, now = Date.now()) {
      if (hasStatusChange) {
        lastWrite.set(id, now)
        return true
      }
      const last = lastWrite.get(id) ?? 0
      if (now - last < interval) return false
      lastWrite.set(id, now)
      return true
    }
  }
}
