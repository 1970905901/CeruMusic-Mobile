import { describe, expect, it } from 'vitest'
import {
  MAX_QUEUE_CLIPBOARD_BYTES,
  assertQueueClipboardFits,
  describeQueueExport,
  describeQueueImport
} from './queueClipboard'

describe('queue clipboard', () => {
  it('names how many locally-only tracks were left out', () => {
    // 和文件导出同一口径：本地歌曲不进数据，但要如实说清楚少了几首。
    expect(describeQueueExport(3, 2)).toBe('已复制 3 首（2 首本地歌曲未包含）')
    expect(describeQueueExport(3, 0)).toBe('已复制 3 首')
  })

  it('refuses an export with nothing shareable', () => {
    expect(() => describeQueueExport(0, 0)).toThrow('队列里没有可导出的在线歌曲')
    expect(() => describeQueueExport(0, 5)).toThrow('队列里没有可导出的在线歌曲')
  })

  it('allows ordinary playlist text', () => {
    expect(() => assertQueueClipboardFits('x'.repeat(1024))).not.toThrow()
  })

  it('rejects text past the limit instead of writing an unreadable clipboard', () => {
    const oversized = 'x'.repeat(MAX_QUEUE_CLIPBOARD_BYTES + 1)
    expect(() => assertQueueClipboardFits(oversized)).toThrow('请改用导出文件')
  })

  it('measures bytes, not characters', () => {
    // 中文每字 3 字节；按字符数判会放过超限内容。
    const chinese = '歌'.repeat(MAX_QUEUE_CLIPBOARD_BYTES / 3 + 1)
    expect(() => assertQueueClipboardFits(chinese)).toThrow()
  })

  it('says when nothing was actually appended', () => {
    expect(describeQueueImport(4)).toBe('已加入 4 首到播放队列')
    expect(describeQueueImport(0)).toBe('这些歌曲已经在队列中')
  })
})
