import { describe, expect, it } from 'vitest'
import { squareCropGeometry } from './imageUtils'

describe('square crop geometry', () => {
  it('crops a landscape image from its horizontal centre', () => {
    const g = squareCropGeometry(1200, 800, 600)
    expect(g).not.toBeNull()
    expect(g!.squareSize).toBe(800)
    expect(g!.sx).toBe(200)
    expect(g!.sy).toBe(0)
    expect(g!.targetSize).toBe(600)
  })

  it('crops a portrait image from its vertical centre', () => {
    const g = squareCropGeometry(600, 1000, 600)
    expect(g!.squareSize).toBe(600)
    expect(g!.sx).toBe(0)
    expect(g!.sy).toBe(200)
    expect(g!.targetSize).toBe(600)
  })

  it('never upscales small images beyond their own size', () => {
    const g = squareCropGeometry(120, 90, 600)
    expect(g!.squareSize).toBe(90)
    expect(g!.targetSize).toBe(90)
  })

  it('clamps the target to the requested maximum for very large artwork', () => {
    const g = squareCropGeometry(4000, 3000, 256)
    expect(g!.targetSize).toBe(256)
    expect(g!.squareSize).toBe(3000)
  })

  it('rejects unusable dimensions so callers can fall back', () => {
    expect(squareCropGeometry(0, 100)).toBeNull()
    expect(squareCropGeometry(100, 0)).toBeNull()
    expect(squareCropGeometry(-5, 100)).toBeNull()
    expect(squareCropGeometry(Number.NaN, 100)).toBeNull()
    expect(squareCropGeometry(Number.POSITIVE_INFINITY, 100)).toBeNull()
  })

  it('falls back to the default limit when maxSize is invalid', () => {
    expect(squareCropGeometry(1000, 1000, 0)!.targetSize).toBe(600)
    expect(squareCropGeometry(1000, 1000, Number.NaN)!.targetSize).toBe(600)
    expect(squareCropGeometry(1000, 1000, -10)!.targetSize).toBe(600)
  })

  it('always produces an integer-safe target of at least one pixel', () => {
    const g = squareCropGeometry(1, 1, 0.4)
    expect(g!.targetSize).toBeGreaterThanOrEqual(1)
  })
})
