import { describe, expect, it } from 'vitest'
import { formatBytes } from './byteSize'

describe('byte size formatting', () => {
  it('picks the unit by 1024 steps', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.50 GB')
  })

  it('keeps GB for values past 1 GiB instead of overflowing into MB', () => {
    // 云端歌单的音质大小此前没有 GB 档，1.5 GiB 会被写成「1536.0 MB」，
    // 与下载页、缓存页对同一个数字给出的「1.50 GB」不一致。
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.50 GB')
    expect(formatBytes(1.5 * 1024 ** 3)).not.toContain('MB')
  })

  it('treats missing, non-numeric and negative values as zero', () => {
    expect(formatBytes(undefined)).toBe('0 B')
    expect(formatBytes(null)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
    expect(formatBytes(-5)).toBe('0 B')
  })

  it('rounds sub-kilobyte values instead of printing a fraction of a byte', () => {
    expect(formatBytes(1023.6)).toBe('1024 B')
  })
})
