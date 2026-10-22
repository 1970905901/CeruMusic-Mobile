import { describe, expect, it } from 'vitest'
import { NOTE_LAYOUTS, hashSeed, noteCoverLayout, noteCoverStyle, noteExcerpt } from './noteCover'

describe('note cover seeding', () => {
  it('produces the same artwork for the same post every time', () => {
    // 列表、详情与下次打开必须看到同一张封面，否则帖子看起来像每刷一次都换了。
    const first = noteCoverStyle('post-123')
    const second = noteCoverStyle('post-123')
    expect(second).toEqual(first)
  })

  it('varies across posts', () => {
    const layouts = new Set(
      Array.from({ length: 40 }, (_, index) => noteCoverLayout(`post-${index}`))
    )
    expect(layouts.size).toBeGreaterThan(1)
  })

  it('only returns the four desktop layouts', () => {
    for (let index = 0; index < 50; index++) {
      expect(NOTE_LAYOUTS).toContain(noteCoverLayout(`seed-${index}`))
    }
  })

  it('emits the palette and geometry variables the stylesheet expects', () => {
    const { cssVars } = noteCoverStyle('abc')
    expect(Object.keys(cssVars).sort()).toEqual(
      ['--note-accent', '--note-angle', '--note-ink', '--note-paper', '--note-wash', '--note-x', '--note-y'].sort()
    )
    expect(cssVars['--note-angle']).toMatch(/^\d+deg$/)
    expect(cssVars['--note-x']).toMatch(/%$/)
  })

  it('hashes deterministically and treats empty seeds as valid', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'))
    expect(noteCoverLayout('')).toBeTruthy()
  })
})

describe('excerpt', () => {
  it('flattens newlines and trims', () => {
    expect(noteExcerpt('  第一行\n\n第二行  ')).toBe('第一行 第二行')
  })

  it('truncates long text with an ellipsis', () => {
    const text = '长'.repeat(80)
    expect(noteExcerpt(text)).toHaveLength(63)
    expect(noteExcerpt(text).endsWith('...')).toBe(true)
  })

  it('leaves short text untouched', () => {
    expect(noteExcerpt('短内容')).toBe('短内容')
    expect(noteExcerpt('')).toBe('')
  })
})
