import { describe, expect, it } from 'vitest'
import {
  backgroundRenderers,
  backgroundSupportsBeat,
  getBackgroundRenderer
} from './backgroundRenderers'

describe('background renderers', () => {
  it('keeps the desktop renderer identity order and beat capability', () => {
    expect(backgroundRenderers.map((renderer) => renderer.value)).toEqual([
      'pixi',
      'mesh',
      'isolation'
    ])
    expect(backgroundSupportsBeat('mesh')).toBe(true)
    expect(backgroundSupportsBeat('pixi')).toBe(false)
    expect(backgroundSupportsBeat('isolation')).toBe(false)
  })

  it('falls back to the desktop default renderer for unknown values', () => {
    expect(getBackgroundRenderer('unknown').value).toBe('pixi')
    expect(getBackgroundRenderer('mesh').value).toBe('mesh')
  })
})
