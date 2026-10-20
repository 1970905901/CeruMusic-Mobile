export interface VisualizerFrameData {
  values: Uint8Array
  lowFreq: number
}

export interface SimulatedFrameData {
  values: Uint8Array<ArrayBuffer>
  lowFreq: number
}

/** Desktop parity: bar heights use a 0.6 gamma so quiet bins stay visible. */
const BAR_GAMMA = 0.6

export function visualizerFftSize(barCount: number): number {
  let fftSize = 32
  const minSize = Math.max(1, Math.floor(barCount)) * 2
  while (fftSize < minSize && fftSize < 2048) fftSize *= 2
  return Math.min(fftSize, 2048)
}

export function readVisualizerFrame(
  analyser: AnalyserNode,
  buffer: Uint8Array<ArrayBuffer>
): VisualizerFrameData {
  analyser.getByteFrequencyData(buffer)
  const lowBins = Math.min(3, buffer.length)
  let sum = 0
  for (let index = 0; index < lowBins; index += 1) sum += buffer[index]
  return { values: buffer, lowFreq: lowBins ? sum / lowBins / 255 : 0 }
}

/**
 * Desktop fallback when no analyser is available: a deterministic-looking
 * composite of two sines keeps the bars moving instead of showing a flat line.
 */
export function simulatedFrame(seconds: number, length: number, buffer?: Uint8Array<ArrayBuffer>): SimulatedFrameData {
  const values = buffer && buffer.length === length ? buffer : new Uint8Array(new ArrayBuffer(length))
  let lowSum = 0
  for (let index = 0; index < length; index += 1) {
    const frequency = index / length
    const amplitude = Math.sin(seconds * 2 + frequency * 10) * 0.5 + 0.5
    const bass = Math.sin(seconds * 4) * 0.3 + 0.7
    const value = Math.floor(amplitude * bass * 255 * (1 - frequency * 0.7))
    values[index] = Math.max(0, Math.min(255, value))
    if (index < 3) lowSum += values[index]
  }
  return { values, lowFreq: length ? lowSum / Math.min(3, length) / 255 : 0 }
}

export function mirroredBarHeights(values: ArrayLike<number>, barCount: number): number[] {
  const half = Math.max(1, Math.floor(barCount / 2))
  const heights: number[] = []
  for (let index = 0; index < half; index += 1) {
    const ratio = Math.min(1, Math.max(0, (values[index] ?? 0) / 255))
    heights.push(Math.pow(ratio, BAR_GAMMA))
  }
  return heights
}

/** Colors are `rgba(...)`; the gradient top reuses the same hue at 0.3 alpha. */
export function barGradientEnd(color: string): string {
  return color.replace(/[\d.]+\)$/, '0.3)')
}
