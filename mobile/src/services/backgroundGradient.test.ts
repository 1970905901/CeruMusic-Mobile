import { describe, expect, it } from 'vitest'
import { fourColorGradientBackground, fourColorGradientLayers, rgbCss } from './backgroundGradient'

const colors = [
  { r: 10, g: 20, b: 30 },
  { r: 40, g: 50, b: 60 },
  { r: 70, g: 80, b: 90 },
  { r: 100, g: 110, b: 120 },
  { r: 130, g: 140, b: 150 }
]

describe('four color gradient background', () => {
  it('renders rgba stops with the desktop alpha', () => {
    expect(rgbCss({ r: 1, g: 2, b: 3 })).toBe('rgba(1,2,3,0.72)')
    expect(rgbCss({ r: 1, g: 2, b: 3 }, 0.5)).toBe('rgba(1,2,3,0.5)')
  })

  it('builds one radial layer per color and caps at four', () => {
    const layers = fourColorGradientLayers(colors)
    expect(layers).toHaveLength(4)
    expect(layers[0]).toContain('radial-gradient(circle at 22% 18%')
    expect(layers[3]).toContain('rgba(100,110,120,0.72)')
  })

  it('joins the layers into a CSS background-image value', () => {
    const background = fourColorGradientBackground(colors.slice(0, 2))
    expect(background.split('radial-gradient')).toHaveLength(3)
    expect(background).toContain('rgba(10,20,30,0.72)')
    expect(background).toContain('rgba(40,50,60,0.72)')
  })

  it('returns an empty value without colors so the layer is skipped', () => {
    expect(fourColorGradientBackground([])).toBe('')
  })
})
