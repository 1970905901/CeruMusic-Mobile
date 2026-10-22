/**
 * 已完成下载的文件存在性校验，对齐桌面版 `DownloadManager.validateFiles`：
 * 用户可能在系统文件管理器里删掉或搬走下载好的歌，桌面版在启动时与打开
 * 「已完成」分页时逐个 `existsSync`，缺失的任务改判为失败并注明
 * 「文件已删除或移动」，否则列表一直显示「已完成」，点播放才报错。
 *
 * 移动端没有同步的 `fs.existsSync`，只能走 `Filesystem.stat`；判断逻辑抽在这里，
 * 便于测试「什么才算文件真的没了」——把一次网络/权限抖动误判成删除，
 * 会让用户的整个下载列表凭空变成失败。
 */

export interface ValidatableDownload {
  id: string
  status: string
  directory?: 'data' | 'documents' | 'saf'
  relativePath?: string
}

/**
 * 可以校验的任务：
 * - 只校验已完成（其余状态本来就可能没有文件）；
 * - 跳过 SAF：文件在授权的外部目录里，只有 document URI，没有 stat 能力；
 * - 跳过没有 `relativePath` 的旧记录：拿不到可 stat 的应用内路径。
 */
export function tasksNeedingValidation<T extends ValidatableDownload>(tasks: readonly T[]): T[] {
  return tasks.filter(
    (task) =>
      task.status === 'completed' && task.directory !== 'saf' && Boolean(task.relativePath)
  )
}

/**
 * 是否属于「文件确实不存在」。
 *
 * Capacitor 在 Web 实现里抛 `Error('Entry does not exist.')`，在 Android 上
 * 是 `NOT_FOUND`；两类都按缺失处理。其它错误（权限被撤销、原生桥接异常）
 * 一律视为「无法确认」，不能据此把任务改判失败。
 */
export function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: unknown; message?: unknown }
  if (typeof record.code === 'string' && /^NOT_FOUND$/i.test(record.code)) return true
  const message = typeof record.message === 'string' ? record.message : ''
  return /does not exist|no such file|enoent|not found|不存在/i.test(message)
}

export const MISSING_DOWNLOAD_MESSAGE = '文件已删除或移动'
