/**
 * 均衡器频谱的频段映射，对齐桌面版 `Settings/EqualizerSettings.vue` 顶部画布
 * 按频段画柱子的做法，但把柱子按对数分布在 20 Hz–20 kHz 上：
 * FFT 的线性频段会把低频挤成一根、把高频铺满半个屏幕，看不出是哪一段在响。
 *
 * 抽成纯函数是为了边界可测：采样率、fftSize、柱数任意组合都不能出现
 * 越界或者「from === to」的空区间。
 */

export const SPECTRUM_LOW_HZ = 20
export const SPECTRUM_HIGH_HZ = 20000

export interface BinRange {
  from: number
  to: number
}

/**
 * 第 `index` 根柱子覆盖的 FFT 频段区间（左闭右开）。
 *
 * 返回的区间至少包含一个频段——空区间会让柱子恒为 0，看起来像坏了两根。
 */
export function barBinRange(
  index: number,
  bars: number,
  binCount: number,
  sampleRate: number,
  fftSize: number
): BinRange {
  if (!(bars > 0) || !(binCount > 0) || !(sampleRate > 0) || !(fftSize > 0)) {
    return { from: 0, to: 1 }
  }
  const safeIndex = Math.min(Math.max(0, Math.floor(index)), bars - 1)
  const binWidth = sampleRate / fftSize
  // 采样率低于 40 kHz 时上限跟着奈奎斯特频率走，避免映射到不存在的频段。
  const high = Math.min(SPECTRUM_HIGH_HZ, sampleRate / 2)
  const low = Math.min(SPECTRUM_LOW_HZ, high)
  const freqAt = (ratio: number) => low * Math.pow(high / low, ratio)
  const from = Math.floor(freqAt(safeIndex / bars) / binWidth)
  const to = Math.ceil(freqAt((safeIndex + 1) / bars) / binWidth)
  const clampedFrom = Math.min(Math.max(0, from), binCount - 1)
  const clampedTo = Math.min(Math.max(clampedFrom + 1, to), binCount)
  return { from: clampedFrom, to: clampedTo }
}

/** 取一个区间内的峰值，空区间返回 0。 */
export function peakInRange(values: ArrayLike<number>, range: BinRange): number {
  let peak = 0
  for (let bin = range.from; bin < range.to && bin < values.length; bin++) {
    const value = values[bin] ?? 0
    if (value > peak) peak = value
  }
  return peak
}
