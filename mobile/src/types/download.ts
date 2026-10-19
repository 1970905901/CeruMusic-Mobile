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