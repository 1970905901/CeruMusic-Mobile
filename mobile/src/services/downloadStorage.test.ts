import { describe, expect, it } from 'vitest'
import { describeDownloadLocation, summarizeDownloadStorage } from './downloadStorage'

const task = (overrides: Record<string, unknown> = {}) => ({
  status: 'completed',
  directory: 'data',
  receivedBytes: 100,
  ...overrides
}) as any

describe('summarizeDownloadStorage', () => {
  it('aggregates completed downloads per storage root', () => {
    const summary = summarizeDownloadStorage([
      task({ directory: 'data', receivedBytes: 100 }),
      task({ directory: 'data', receivedBytes: 50 }),
      task({ directory: 'documents', receivedBytes: 200 }),
      task({ directory: 'saf', receivedBytes: 300 })
    ])
    expect(summary.totalCount).toBe(4)
    expect(summary.totalBytes).toBe(650)
    expect(summary.entries.map((entry) => entry.mode)).toEqual(['data', 'documents', 'saf'])
    expect(summary.entries[0]).toMatchObject({ count: 2, bytes: 150, label: '应用私有目录' })
    expect(summary.entries[2]).toMatchObject({ count: 1, bytes: 300 })
  })

  it('ignores unfinished and cancelled downloads', () => {
    const summary = summarizeDownloadStorage([
      task({ status: 'running' }),
      task({ status: 'queued' }),
      task({ status: 'failed' }),
      task({ status: 'cancelled' }),
      task({ status: 'completed', receivedBytes: 10 })
    ])
    expect(summary.totalCount).toBe(1)
    expect(summary.totalBytes).toBe(10)
  })

  it('treats a missing or unknown directory as the private dir and clamps size', () => {
    const summary = summarizeDownloadStorage([
      task({ directory: undefined, receivedBytes: 40 }),
      task({ directory: 'weird', receivedBytes: -5 }),
      task({ receivedBytes: Number.NaN })
    ])
    expect(summary.entries).toHaveLength(1)
    expect(summary.entries[0]).toMatchObject({ mode: 'data', count: 3, bytes: 40 })
  })

  it('returns an empty summary for no tasks', () => {
    expect(summarizeDownloadStorage([])).toEqual({ totalBytes: 0, totalCount: 0, entries: [] })
    expect(summarizeDownloadStorage(undefined as any).entries).toEqual([])
  })
})

describe('describeDownloadLocation', () => {
  it('describes each storage root', () => {
    expect(describeDownloadLocation('data', 'CeruMusic')).toBe('应用私有目录 / downloads')
    expect(describeDownloadLocation('documents', 'CeruMusic')).toBe('文件 App / Documents / CeruMusic')
    expect(describeDownloadLocation('documents', '')).toBe('文件 App / Documents / CeruMusic')
    expect(describeDownloadLocation('saf', 'CeruMusic', 'Music')).toBe('Android 授权文件夹 / Music')
    expect(describeDownloadLocation('saf', 'CeruMusic')).toBe('Android 授权文件夹 / 未选择')
  })
})
