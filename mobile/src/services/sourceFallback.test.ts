import { describe, expect, it } from 'vitest'
import {
  autoSkipLimit,
  canAutoSkip,
  fallbackSources,
  rankFallbackCandidates,
  searchKeywordFor,
  stringSimilarity
} from './sourceFallback'

/**
 * 自动换源，对齐桌面 `utils/audio/audioHelpers.ts` 的 `getCandidateSongs` 与
 * `globaPlayList.ts` 的 `tryAutoNext`。
 *
 * 这些用例锁定的是**用户能感知的判定**：什么算同一首歌、换源从哪些音源找、
 * 失败后最多自动跳过几首。评分公式本身可以调整，但「同一首歌排在最前、
 * 明显不同的歌被丢掉、当前音源不会被自己换回自己」这几条不能变。
 */

function track(overrides: Record<string, any> = {}) {
  return {
    key: 'k',
    title: '晴天',
    artists: ['周杰伦'],
    durationMs: 269_000,
    ...overrides
  }
}

describe('stringSimilarity', () => {
  it('treats the same text (ignoring case and padding) as a perfect match', () => {
    expect(stringSimilarity(' 晴天 ', '晴天')).toBe(1)
    expect(stringSimilarity('Hello', 'hello')).toBe(1)
  })

  it('scores a near match above an unrelated title', () => {
    // 与桌面 `strSim` 同为 bigram Dice 系数：多出来的修饰词会拉低分数，
    // 但同名前缀仍然比完全不同的歌名更像。
    const near = stringSimilarity('晴天 Live', '晴天')
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThan(1)
    expect(near).toBeGreaterThan(stringSimilarity('七里香', '晴天'))
  })

  it('returns 0 rather than NaN when one side is empty', () => {
    // 插件返回缺歌手名的条目很常见，NaN 会让整个排序变成随机顺序。
    expect(stringSimilarity('', '晴天')).toBe(0)
    expect(stringSimilarity('晴天', '')).toBe(0)
    expect(stringSimilarity(undefined as any, '晴天')).toBe(0)
  })
})

describe('rankFallbackCandidates', () => {
  it('puts the same song from another source first and drops unrelated ones', () => {
    const original = track()
    const ranked = rankFallbackCandidates(original, [
      track({ key: 'other', title: '七里香', artists: ['周杰伦'], durationMs: 299_000 }),
      track({ key: 'same', title: '晴天', artists: ['周杰伦'], durationMs: 269_000 }),
      track({ key: 'cover', title: '晴天', artists: ['某翻唱歌手'], durationMs: 269_000 })
    ])
    expect(ranked.map((item) => item.key)).toEqual(['same', 'cover'])
  })

  it('ranks a duration within five seconds above one that is far off', () => {
    const original = track()
    const ranked = rankFallbackCandidates(original, [
      // 同名同歌手，但时长相差 90 秒——多半是另一版本（现场 / 伴奏）。
      track({ key: 'long', title: '晴天', artists: ['周杰伦'], durationMs: 359_000 }),
      track({ key: 'close', title: '晴天', artists: ['周杰伦'], durationMs: 271_000 })
    ])
    expect(ranked.map((item) => item.key)).toEqual(['close', 'long'])
  })

  it('keeps a title match when the duration is unknown', () => {
    // 插件不声明时长时不能因此判成「不像」——桌面版同样只在两边都有时长时比较。
    const ranked = rankFallbackCandidates(track(), [
      track({ key: 'unknown', title: '晴天', artists: ['周杰伦'], durationMs: undefined })
    ])
    expect(ranked.map((item) => item.key)).toEqual(['unknown'])
  })

  it('never suggests the song already in the queue', () => {
    const ranked = rankFallbackCandidates(track(), [track({ key: 'k' })])
    expect(ranked).toEqual([])
  })
})

describe('fallbackSources', () => {
  it('excludes the current source and keeps the declared order', () => {
    expect(fallbackSources(['wy', 'tx', 'kg'], 'tx')).toEqual(['wy', 'kg'])
  })

  it('drops duplicates and blanks', () => {
    expect(fallbackSources(['wy', 'wy', '', '  ', 'tx'], 'wy')).toEqual(['tx'])
  })

  it('returns nothing when only the current source exists', () => {
    expect(fallbackSources(['wy'], 'wy')).toEqual([])
  })
})

describe('searchKeywordFor', () => {
  it('joins title and artists the way the desktop searches', () => {
    expect(searchKeywordFor(track())).toBe('晴天 周杰伦')
    expect(searchKeywordFor(track({ artists: ['周杰伦', '梁心颐'] }))).toBe('晴天 周杰伦 梁心颐')
  })

  it('falls back to the title when artists are missing', () => {
    expect(searchKeywordFor(track({ artists: [] }))).toBe('晴天')
  })
})

describe('auto skip bounds', () => {
  it('scales the skip budget with the queue and caps it at ten', () => {
    expect(autoSkipLimit(0)).toBe(1)
    expect(autoSkipLimit(1)).toBe(1)
    expect(autoSkipLimit(10)).toBe(3)
    expect(autoSkipLimit(1000)).toBe(10)
  })

  it('stops skipping once the budget is spent', () => {
    expect(canAutoSkip(0, 3)).toBe(true)
    expect(canAutoSkip(2, 3)).toBe(true)
    expect(canAutoSkip(3, 3)).toBe(false)
    expect(canAutoSkip(9, 10)).toBe(true)
    expect(canAutoSkip(10, 10)).toBe(false)
  })
})
