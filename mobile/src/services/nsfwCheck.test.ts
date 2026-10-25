import { describe, expect, it } from 'vitest'
import { predictionViolates } from './nsfwCheck'

describe('nsfw threshold verdict', () => {
  it('blocks the three unsafe classes above their thresholds', () => {
    // 阈值口径必须与桌面版一致：Hentai/Porn 0.6、Sexy 0.8——
    // 两端阈值不同意味着同一张图在一端被拦、另一端放行。
    expect(predictionViolates([{ className: 'Porn', probability: 0.61 }])).toBe('Porn')
    expect(predictionViolates([{ className: 'Hentai', probability: 0.7 }])).toBe('Hentai')
    expect(predictionViolates([{ className: 'Sexy', probability: 0.81 }])).toBe('Sexy')
  })

  it('allows probabilities at or below the threshold', () => {
    expect(predictionViolates([{ className: 'Porn', probability: 0.6 }])).toBeNull()
    expect(predictionViolates([{ className: 'Sexy', probability: 0.8 }])).toBeNull()
  })

  it('ignores the safe classes entirely', () => {
    expect(
      predictionViolates([
        { className: 'Neutral', probability: 0.99 },
        { className: 'Drawing', probability: 0.95 }
      ])
    ).toBeNull()
  })

  it('reports the first violating class when several cross', () => {
    const verdict = predictionViolates([
      { className: 'Neutral', probability: 0.1 },
      { className: 'Hentai', probability: 0.9 },
      { className: 'Porn', probability: 0.95 }
    ])
    expect(verdict).toBe('Hentai')
  })
})
