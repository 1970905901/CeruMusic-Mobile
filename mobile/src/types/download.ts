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
  mime?: string
  cover?: string
  lyrics?: string
  size?: number
  createdAt: number
}
