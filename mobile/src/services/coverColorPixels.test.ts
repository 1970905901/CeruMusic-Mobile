import { describe, expect, it } from 'vitest'
import {
  dominantColorFromPixels,
  dominantColorsFromPixels,
  lightMainColor
} from './coverColor'

/** 构造 RGBA 像素数组，便于直接喂给聚类函数。 */
function pixels(colors: Array<[number, number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(colors.length * 4)
  colors.forEach(([r, g, b, a], index) => {
    data[index * 4] = r
    data[index * 4 + 1] = g
    data[index * 4 + 2] = b
    data[index * 4 + 3] = a
  })
  return data
}

describe('dominant color', () => {
  it('falls back to a usable color when every pixel is transparent', () => {
    const color = dominantColorFromPixels(pixels([[10, 20, 30, 0]]))
    expect(color.r).toBeGreaterThanOrEqual(0)
    expect(color.r).toBeLessThanOrEqual(255)
  })

  it('ignores transparent pixels and keeps the visible hue', () => {
    const color = dominantColorFromPixels(
      pixels([
        [255, 0, 0, 0],
        [0, 120, 255, 255],
        [0, 120, 255, 255],
        [0, 120, 255, 255]
      ])
    )
    expect(color.b).toBeGreaterThan(color.r)
  })

  it('does not return near-black or near-white as the accent', () => {
    const color = dominantColorFromPixels(pixels([[0, 0, 0, 255], [255, 255, 255, 255]]))
    const isExtreme =
      (color.r < 30 && color.g < 30 && color.b < 30) ||
      (color.r > 225 && color.g > 225 && color.b > 225)
    expect(isExtreme).toBe(false)
  })

  it('always returns finite channel values', () => {
    const color = dominantColorFromPixels(pixels([[12, 200, 77, 255]]))
    for (const value of [color.r, color.g, color.b]) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(255)
    }
  })
})

describe('dominant colors for gradients', () => {
  it('returns exactly the requested number of colors even from one hue', () => {
    const colors = dominantColorsFromPixels(pixels([[80, 120, 200, 255]]), 4)
    expect(colors).toHaveLength(4)
    expect(colors.every((c) => Number.isFinite(c.r))).toBe(true)
  })

  it('clamps the requested count into the supported 2..8 range', () => {
    const data = pixels([[80, 120, 200, 255], [200, 60, 40, 255]])
    expect(dominantColorsFromPixels(data, 0)).toHaveLength(4)
    expect(dominantColorsFromPixels(data, 1)).toHaveLength(2)
    expect(dominantColorsFromPixels(data, 50)).toHaveLength(8)
  })

  it('degrades to the default palette when the sample is empty', () => {
    const colors = dominantColorsFromPixels(new Uint8ClampedArray(0), 3)
    expect(colors).toHaveLength(3)
    expect(colors.every((c) => c.r >= 0 && c.r <= 255)).toBe(true)
  })

  it('does not mutate caller-provided arrays between calls', () => {
    const data = pixels([[10, 90, 200, 255], [220, 30, 90, 255]])
    const first = dominantColorsFromPixels(data, 4)
    const second = dominantColorsFromPixels(data, 4)
    expect(first).toHaveLength(second.length)
    expect(first[0]).not.toBe(second[0])
  })
})

describe('light main color', () => {
  it('lightens toward white and keeps the desktop alpha', () => {
    expect(lightMainColor({ r: 0, g: 0, b: 0 })).toBe('rgba(204,204,204,.9)')
    expect(lightMainColor({ r: 255, g: 255, b: 255 })).toBe('rgba(255,255,255,.9)')
  })
})
