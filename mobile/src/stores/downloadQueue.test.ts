import { describe, expect, it } from 'vitest'
import { isQueuedOrRunning, retryPatch, selectBatchDownloadCandidates } from './downloads'

type Track = { key: string; localUri?: string }

describe('download queue selection', () => {
  it('skips local files and tracks already queued or running', () => {
    const items: Track[] = [
      { key: 'remote-a' },
      { key: 'local-b', localUri: 'file:///b.mp3' },
      { key: 'remote-c' }
    ]
    const existing = [
      { trackKey: 'remote-c', status: 'queued' },
      { trackKey: 'remote-d', status: 'completed' }
    ]

    expect(selectBatchDownloadCandidates(items, existing).map((t) => t.key)).toEqual(['remote-a'])
  })

  it('deduplicates the same track inside one batch', () => {
    const items: Track[] = [{ key: 'a' }, { key: 'a' }, { key: 'b' }]
    expect(selectBatchDownloadCandidates(items, []).map((t) => t.key)).toEqual(['a', 'b'])
  })

  it('still allows re-queueing a previously failed or completed track', () => {
    const existing = [
      { trackKey: 'a', status: 'failed' },
      { trackKey: 'b', status: 'completed' },
      { trackKey: 'c', status: 'paused' }
    ]
    expect(
      selectBatchDownloadCandidates([{ key: 'a' }, { key: 'b' }, { key: 'c' }], existing).map(
        (t) => t.key
      )
    ).toEqual(['a', 'b', 'c'])
  })

  it('treats only running and queued as occupied', () => {
    expect(isQueuedOrRunning({ status: 'running' })).toBe(true)
    expect(isQueuedOrRunning({ status: 'queued' })).toBe(true)
    expect(isQueuedOrRunning({ status: 'paused' })).toBe(false)
    expect(isQueuedOrRunning({ status: 'failed' })).toBe(false)
    expect(isQueuedOrRunning({ status: 'completed' })).toBe(false)
  })
})

describe('download retry state', () => {
  it('clears the previous failure and progress so the UI stops showing stale errors', () => {
    expect(retryPatch()).toEqual({ status: 'queued', error: undefined, receivedBytes: 0 })
  })
})
