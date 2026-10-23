export type DownloadStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface DownloadTask {
  id: string
  trackKey: string
  title: string
  artist: string
  cover?: string
  quality?: string
  status: DownloadStatus
  receivedBytes: number
  totalBytes?: number
  filePath?: string
  relativePath?: string
  mime?: string
  /** Storage root selected when the download was created. */
  directory?: 'data' | 'documents' | 'saf'
  /**
   * 发起这次下载的插件。用户自己在应用内发起的下载没有这个字段。
   *
   * 桌面端同样在任务上带 `pluginId`，并且只把 `downloads.changed` 推给该插件：
   * 移动端此前不分来源地广播给所有插件，插件会看到不属于自己的任务，
   * 甚至能据此去暂停/取消别人的下载。
   */
  pluginKey?: string
  /** Persisted SAF tree URI when the task was written to an authorized folder. */
  safUri?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export interface LocalTrackRecord {
  key: string
  title: string
  artist: string
  album?: string
  year?: number
  genre?: string
  durationMs?: number
  fileName: string
  path: string
  relativePath?: string
  /** Original path when the file was discovered by directory scanning. */
  sourcePath?: string
  mime?: string
  cover?: string
  lyrics?: string
  size?: number
  createdAt: number
}
