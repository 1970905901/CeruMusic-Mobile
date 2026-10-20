import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DOMINANT_COLOR,
  dominantColorFromPixels,
  dominantColorsFromPixels,
  lightMainColor
} from './coverColor'

function pixels(colors: Array<[number, number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(colors.length * 4)
  colors.forEach((color, index) => data.set(color, index * 4))
  return data
}

describe('cover color extraction', () => {
  it('lightens the dominant color 20% toward white with 0.9 alpha', () => {
    expect(lightMainColor({ r: 10, g: 20, b: 30 })).toBe('rgba(206,208,210,.9)')
    expect(lightMainColor({ r: 255, g: 255, b: 255 })).toBe('rgba(255,255,255,.9)')
  })

  it('falls back to the desktop default when every pixel is transparent', () => {
    expect(dominantColorFromPixels(pixels([[255, 0, 0, 0]]))).toEqual(DEFAULT_DOMINANT_COLOR)
  })

  it('picks the saturated cluster instead of near-black or near-white pixels', () => {
    const data = pixels([
      [2, 2, 2, 255],
      [250, 250, 250, 255],
      [200, 40, 40, 255],
      [180, 30, 30, 255]
    ])
    const color = dominantColorFromPixels(data)
    expect(color.r).toBeGreaterThan(color.g)
    expect(color.r).toBeGreaterThan(color.b)
    expect(color.r).toBeGreaterThan(150)
  })

  it('is deterministic for identical pixel data', () => {
    const data = pixels([
      [40, 90, 200, 255],
      [60, 110, 210, 255],
      [20, 60, 180, 255]
    ])
    expect(dominantColorFromPixels(data)).toEqual(dominantColorFromPixels(data))
  })

  it('returns the requested number of gradient colors', () => {
    const data = pixels([
      [200, 40, 40, 255],
      [40, 200, 40, 255],
      [40, 40, 200, 255],
      [200, 200, 40, 255]
    ])
    expect(dominantColorsFromPixels(data, 4)).toHaveLength(4)
    expect(dominantColorsFromPixels(data, 2)).toHaveLength(2)
  })

  it('falls back to the desktop default when every gradient pixel is transparent', () => {
    const colors = dominantColorsFromPixels(pixels([[255, 0, 0, 0]]), 4)
    expect(colors).toHaveLength(4)
    for (const color of colors) expect(color).toEqual(DEFAULT_DOMINANT_COLOR)
  })

  it('keeps the gradient deterministic for identical pixel data', () => {
    const data = pixels([
      [40, 90, 200, 255],
      [60, 110, 210, 255],
      [190, 60, 40, 255]
    ])
    expect(dominantColorsFromPixels(data, 4)).toEqual(dominantColorsFromPixels(data, 4))
  })
})
