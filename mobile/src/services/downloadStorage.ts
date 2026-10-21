import type { DownloadTask } from '@/types/download'

/**
 * 下载目录占用统计（桌面端 `Settings/DirectorySettings.vue` 的移动端等价实现）。
 *
 * 桌面端通过 IPC 读真实目录大小；移动端没有跨平台的目录遍历 API，
 * 因此沿用下载任务里已持久化的 `receivedBytes` 与 `directory` 聚合，
 * 口径是该 App 自己写入的文件，不会把目录里其它应用的文件算进来。
 */

export type DownloadStorageMode = 'data' | 'documents' | 'saf'

export interface DownloadStorageEntry {
  mode: DownloadStorageMode
  count: number
  bytes: number
  label: string
}

export interface DownloadStorageSummary {
  totalBytes: number
  totalCount: number
  entries: DownloadStorageEntry[]
}

const MODE_LABELS: Record<DownloadStorageMode, string> = {
  data: '应用私有目录',
  documents: 'Documents（文件 App）',
  saf: 'Android 授权文件夹'
}

function normalizeMode(value: unknown): DownloadStorageMode {
  return value === 'documents' || value === 'saf' ? value : 'data'
}

/**
 * 只统计已完成任务：排队/下载中/失败的文件要么不存在，要么是临时文件，
 * 计入会让「已用空间」虚高。
 */
export function summarizeDownloadStorage(
  tasks: readonly Pick<DownloadTask, 'status' | 'directory' | 'receivedBytes'>[]
): DownloadStorageSummary {
  const buckets = new Map<DownloadStorageMode, { count: number; bytes: number }>()
  let totalBytes = 0
  let totalCount = 0
  for (const task of tasks ?? []) {
    if (!task || task.status !== 'completed') continue
    const mode = normalizeMode(task.directory)
    const bytes = Math.max(0, Number(task.receivedBytes) || 0)
    const bucket = buckets.get(mode) ?? { count: 0, bytes: 0 }
    bucket.count += 1
    bucket.bytes += bytes
    buckets.set(mode, bucket)
    totalBytes += bytes
    totalCount += 1
  }
  // 固定按 data → documents → saf 排序，避免随任务顺序抖动
  const order: DownloadStorageMode[] = ['data', 'documents', 'saf']
  const entries = order
    .filter((mode) => buckets.has(mode))
    .map((mode) => ({
      mode,
      count: buckets.get(mode)!.count,
      bytes: buckets.get(mode)!.bytes,
      label: MODE_LABELS[mode]
    }))
  return { totalBytes, totalCount, entries }
}

/** 当前设置对应的目录说明，供设置页在「下载位置」下方展示。 */
export function describeDownloadLocation(
  mode: DownloadStorageMode,
  subfolder: string,
  safName?: string
): string {
  if (mode === 'documents') return `文件 App / Documents / ${subfolder || 'CeruMusic'}`
  if (mode === 'saf') return `Android 授权文件夹 / ${safName || '未选择'}`
  return '应用私有目录 / downloads'
}
