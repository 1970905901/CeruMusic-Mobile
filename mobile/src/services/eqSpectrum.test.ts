import { describe, expect, it } from 'vitest'
import { barBinRange, peakInRange } from './eqSpectrum'

describe('spectrum bar mapping', () => {
  it('places the bars on a log scale from 20 Hz to 20 kHz', () => {
    // 相邻柱子的区间必须单调不减，否则柱子的排列会和频率对不上。
    const bars = 32
    const binCount = 512
    const ranges = Array.from({ length: bars }, (_, index) =>
      barBinRange(index, bars, binCount, 48000, 1024)
    )
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].from).toBeGreaterThanOrEqual(ranges[i - 1].from)
    }
    expect(ranges[0].from).toBe(0)
    // 顶格是 20 kHz 而不是奈奎斯特频率（48 kHz 采样下是 24 kHz），
    // 人耳听不到的那一段没必要占掉最后几根柱子。
    const binAt20k = Math.ceil(20000 / (48000 / 1024))
    expect(ranges[ranges.length - 1].to).toBe(binAt20k)
  })

  it('never returns an empty range, even when bars outnumber bins', () => {
    // 空区间会让柱子恒为 0，看起来像坏了两根。
    const ranges = Array.from({ length: 64 }, (_, index) =>
      barBinRange(index, 64, 16, 44100, 512)
    )
    for (const range of ranges) expect(range.to).toBeGreaterThan(range.from)
  })

  it('uses the nyquist frequency as the ceiling on low sample rates', () => {
    const range = barBinRange(31, 32, 256, 8000, 512)
    expect(range.to).toBeLessThanOrEqual(256)
  })

  it('clamps an out-of-range bar index instead of going negative', () => {
    expect(barBinRange(-3, 16, 256, 48000, 512).from).toBe(0)
    // 越界索引收敛成最后一根柱子，区间仍在缓冲区内。
    const last = barBinRange(99, 16, 256, 48000, 512)
    expect(last).toEqual(barBinRange(15, 16, 256, 48000, 512))
    expect(last.to).toBeLessThanOrEqual(256)
  })

  it('falls back to the first bin for invalid inputs', () => {
    expect(barBinRange(0, 0, 256, 48000, 512)).toEqual({ from: 0, to: 1 })
    expect(barBinRange(0, 8, 0, 48000, 512)).toEqual({ from: 0, to: 1 })
    expect(barBinRange(0, 8, 256, 0, 512)).toEqual({ from: 0, to: 1 })
  })
})

describe('peak in range', () => {
  it('reads the loudest bin in the range', () => {
    expect(peakInRange([1, 9, 3], { from: 0, to: 3 })).toBe(9)
    expect(peakInRange([1, 9, 3], { from: 2, to: 3 })).toBe(3)
  })

  it('ignores bins past the end of the buffer', () => {
    // 采样率与 fftSize 不匹配时区间可能超出缓冲区，不能因此读到 undefined。
    expect(peakInRange([4], { from: 0, to: 10 })).toBe(4)
    expect(peakInRange([], { from: 0, to: 10 })).toBe(0)
  })
})
