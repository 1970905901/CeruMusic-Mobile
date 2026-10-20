import { ensureBeatAnalyser } from './audioEffects'

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

/** Desktop background beat samples the 80–120 Hz band, not the lowest FFT bins. */
export const BEAT_BAND_LOW_HZ = 80
export const BEAT_BAND_HIGH_HZ = 120
/** Desktop samples the beat at 30 fps. */
const BEAT_FRAME_MS = 1000 / 30
/** A cross-origin source cannot be tapped; retry so a proxied track is picked up. */
const ANALYSER_RETRY_MS = 2000

/**
 * Averages the 80–120 Hz band of a 4096-point analyser. Desktop hardcodes those
 * bins for 48 kHz; deriving them from the live sample rate keeps the band
 * correct when a device runs at 44.1 kHz.
 */
export function bandLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteFrequencyData(buffer)
  const sampleRate = analyser.context.sampleRate
  const binWidth = sampleRate > 0 ? sampleRate / analyser.fftSize : 0
  if (!binWidth || !buffer.length) return 0
  const firstBin = Math.max(1, Math.ceil(BEAT_BAND_LOW_HZ / binWidth))
  const lastBin = Math.min(
    buffer.length - 1,
    Math.max(firstBin, Math.floor(BEAT_BAND_HIGH_HZ / binWidth))
  )
  if (lastBin < firstBin) return 0
  let total = 0
  for (let bin = firstBin; bin <= lastBin; bin += 1) total += buffer[bin]
  return total / (lastBin - firstBin + 1) / 255
}

/**
 * Streams the desktop-equivalent low-frequency level for the player background
 * beat. Uses the dedicated beat analyser so it never fights the visualizer's
 * FFT size and, like desktop, emits 0 instead of a synthetic level when the
 * audio cannot be tapped.
 */
export function startLowFreqSampler(onValue: (value: number) => void): () => void {
  let frameId: number | null = null
  let lastFrame = 0
  let lastAnalyserAttempt = 0
  let analyser: AnalyserNode | null = null
  let buffer = new Uint8Array(new ArrayBuffer(0))
  let stopped = false

  function tick(timestamp?: number): void {
    if (stopped) return
    const now = timestamp ?? performance.now()
    if (now - lastFrame >= BEAT_FRAME_MS) {
      lastFrame = now
      if (!analyser && now - lastAnalyserAttempt > ANALYSER_RETRY_MS) {
        lastAnalyserAttempt = now
        analyser = ensureBeatAnalyser()
      }
      if (analyser) {
        if (buffer.length !== analyser.frequencyBinCount) {
          buffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
        }
        onValue(bandLevel(analyser, buffer))
      } else {
        onValue(0)
      }
    }
    frameId = requestAnimationFrame(tick)
  }

  frameId = requestAnimationFrame(tick)
  return () => {
    stopped = true
    if (frameId !== null) cancelAnimationFrame(frameId)
    frameId = null
  }
}
