import { describe, expect, it } from 'vitest'
import {
  barGradientEnd,
  mirroredBarHeights,
  simulatedFrame,
  visualizerFftSize
} from './audioVisualizer'

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
