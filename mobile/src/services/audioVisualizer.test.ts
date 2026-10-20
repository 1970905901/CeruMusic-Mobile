import { describe, expect, it } from 'vitest'
import {
  BEAT_BAND_HIGH_HZ,
  BEAT_BAND_LOW_HZ,
  bandLevel,
  barGradientEnd,
  mirroredBarHeights,
  simulatedFrame,
  visualizerFftSize
} from './audioVisualizer'

/** Minimal analyser stand-in: only the two fields bandLevel reads. */
function fakeAnalyser(sampleRate: number, fftSize: number, levels: number[]): AnalyserNode {
  return {
    sampleRate,
    fftSize,
    context: { sampleRate },
    frequencyBinCount: fftSize / 2,
    getByteFrequencyData(buffer: Uint8Array) {
      for (let index = 0; index < buffer.length; index += 1) buffer[index] = levels[index] ?? 0
    }
  } as unknown as AnalyserNode
}

describe('audio visualizer math', () => {
  it('rounds the FFT size up to a power of two covering both bar halves', () => {
    expect(visualizerFftSize(48)).toBe(128)
    expect(visualizerFftSize(64)).toBe(128)
    expect(visualizerFftSize(80)).toBe(256)
    expect(visualizerFftSize(1)).toBe(32)
  })

  it('never exceeds the desktop 2048 cap', () => {
    expect(visualizerFftSize(4000)).toBe(2048)
  })

  it('applies the 0.6 gamma and clamps out-of-range bins', () => {
    const heights = mirroredBarHeights([0, 255, 300, -20], 8)
    expect(heights).toHaveLength(4)
    expect(heights[0]).toBe(0)
    expect(heights[1]).toBeCloseTo(1, 6)
    expect(heights[2]).toBe(1)
    expect(heights[3]).toBe(0)
    expect(heights[1]).toBeGreaterThan(0.9)
  })

  it('keeps half the requested bars minimum one bar', () => {
    expect(mirroredBarHeights([10], 1)).toHaveLength(1)
  })

  it('rewrites the gradient stop alpha', () => {
    expect(barGradientEnd('rgba(245, 248, 251, 0.8)')).toBe('rgba(245, 248, 251, 0.3)')
  })

  it('generates a bounded synthetic frame with a decreasing spectrum', () => {
    const frame = simulatedFrame(1.25, 64)
    expect(frame.values).toHaveLength(64)
    expect(frame.lowFreq).toBeGreaterThan(0)
    expect(frame.lowFreq).toBeLessThanOrEqual(1)
    for (const value of frame.values) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(255)
    }
    expect(frame.values[4]).toBeGreaterThan(frame.values[60])
  })

  it('reuses the supplied buffer for synthetic frames', () => {
    const buffer = new Uint8Array(new ArrayBuffer(64))
    const frame = simulatedFrame(0.4, 64, buffer)
    expect(frame.values).toBe(buffer)
  })
})

describe('background beat band', () => {
  it('averages only the 80–120 Hz bins for the analyser sample rate', () => {
    const analyser = fakeAnalyser(48000, 4096, [])
    const binWidth = 48000 / 4096
    const firstBin = Math.ceil(BEAT_BAND_LOW_HZ / binWidth)
    const lastBin = Math.floor(BEAT_BAND_HIGH_HZ / binWidth)
    const buffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    // Every in-band bin is full while both out-of-band neighbours stay silent,
    // so a full-scale result proves the band bounds are exact.
    for (let bin = firstBin; bin <= lastBin; bin += 1) buffer[bin] = 255
    buffer[firstBin - 1] = 0
    buffer[lastBin + 1] = 0
    analyser.getByteFrequencyData = (target: Uint8Array) => target.set(buffer)
    expect(bandLevel(analyser, buffer)).toBeCloseTo(1, 6)
  })

  it('keeps the band correct when the device runs at 44.1 kHz', () => {
    const analyser = fakeAnalyser(44100, 4096, [])
    const binWidth = 44100 / 4096
    const firstBin = Math.ceil(BEAT_BAND_LOW_HZ / binWidth)
    const buffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    buffer[firstBin] = 255
    analyser.getByteFrequencyData = (target: Uint8Array) => target.set(buffer)
    expect(bandLevel(analyser, buffer)).toBeGreaterThan(0)
    // The 48 kHz bin index would be out of band here, so it stays silent.
    const wrongBin = Math.ceil(BEAT_BAND_LOW_HZ / (48000 / 4096))
    if (wrongBin !== firstBin) {
      const other = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
      other[wrongBin] = 255
      analyser.getByteFrequencyData = (target: Uint8Array) => target.set(other)
      expect(bandLevel(analyser, other)).toBe(0)
    }
  })

  it('reports silence without a usable sample rate', () => {
    const analyser = fakeAnalyser(0, 4096, [])
    expect(bandLevel(analyser, new Uint8Array(new ArrayBuffer(1)))).toBe(0)
  })
})
