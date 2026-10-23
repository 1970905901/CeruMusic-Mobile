import { describe, expect, it } from 'vitest'
import { createDownloadSpeedMeter, formatDownloadSpeed } from './downloadSpeed'

describe('download speed meter', () => {
  it('reports zero until it has two samples', () => {
    const meter = createDownloadSpeedMeter(3000)
    meter.sample('a', 1000, 0)
    expect(meter.speedOf('a', 500)).toBe(0)
  })

  it('averages bytes over the sample window', () => {
    const meter = createDownloadSpeedMeter(3000)
    meter.sample('a', 0, 1000)
    meter.sample('a', 2048, 2000)
    // 2048 字节 / 1 秒
    expect(meter.speedOf('a', 2000)).toBeCloseTo(2048)
  })

  it('smooths a single oversized jump instead of trusting the last delta', () => {
    const meter = createDownloadSpeedMeter(3000)
    meter.sample('a', 0, 0)
    meter.sample('a', 100, 1000)
    meter.sample('a', 60_000, 1100)
    // 窗口平均约 60 KB / 1.1 秒，而不是 59.9 KB / 0.1 秒。
    expect(meter.speedOf('a', 1100)).toBeLessThan(60_000)
    expect(meter.speedOf('a', 1100)).toBeGreaterThan(50_000)
  })

  it('drops samples that fell out of the window', () => {
    const meter = createDownloadSpeedMeter(3000)
    meter.sample('a', 0, 0)
    meter.sample('a', 1000, 10_000)
    // 旧样本早于窗口，只剩一个点，无法算出速率。
    expect(meter.speedOf('a', 10_000)).toBe(0)
  })

  it('restarts the series when the byte count goes backwards', () => {
    const meter = createDownloadSpeedMeter(3000)
    meter.sample('a', 0, 0)
    meter.sample('a', 5000, 1000)
    // 重试/重新下载：进度归零后不能沿用上一段的大数值。
    meter.sample('a', 0, 1100)
    expect(meter.speedOf('a', 1100)).toBe(0)
    meter.sample('a', 1000, 2100)
    expect(meter.speedOf('a', 2100)).toBeCloseTo(1000)
  })

  it('ignores repeated readings at the same byte count', () => {
    const meter = createDownloadSpeedMeter(3000)
    meter.sample('a', 1000, 0)
    meter.sample('a', 1000, 500)
    meter.sample('a', 1000, 900)
    expect(meter.speedOf('a', 900)).toBe(0)
  })

  it('never returns a rate for a stalled transfer', () => {
    const meter = createDownloadSpeedMeter(3000)
    meter.sample('a', 1000, 0)
    meter.sample('a', 1000, 1000)
    expect(meter.speedOf('a', 1000)).toBe(0)
  })

  it('keeps tasks independent and can forget them', () => {
    const meter = createDownloadSpeedMeter(3000)
    meter.sample('a', 0, 0)
    meter.sample('a', 1000, 1000)
    meter.sample('b', 0, 0)
    meter.sample('b', 5000, 1000)
    expect(meter.speedOf('a', 1000)).toBeCloseTo(1000)
    expect(meter.speedOf('b', 1000)).toBeCloseTo(5000)
    meter.reset('a')
    expect(meter.speedOf('a', 1000)).toBe(0)
    expect(meter.speedOf('b', 1000)).toBeCloseTo(5000)
  })

  it('formats a rate with the desktop units', () => {
    expect(formatDownloadSpeed(0)).toBe('')
    expect(formatDownloadSpeed(Number.NaN)).toBe('')
    expect(formatDownloadSpeed(512)).toBe('512.00 B/s')
    expect(formatDownloadSpeed(2048)).toBe('2.00 KB/s')
    expect(formatDownloadSpeed(3 * 1024 * 1024)).toBe('3.00 MB/s')
    expect(formatDownloadSpeed(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB/s')
  })
})
