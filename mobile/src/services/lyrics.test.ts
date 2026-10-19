import { describe, expect, it } from 'vitest'
import { currentLyricIndex, parseLyrics } from './lyrics'

describe('lyrics', () => {
  it('parses LRC with offset and multiple timestamps', () => {
    const doc = parseLyrics('[offset:100]\n[00:01.00][00:03.00]Hello\n[00:05.50]World')
    expect(doc.format).toBe('lrc')
    expect(doc.lines.map((line) => line.text)).toEqual(['Hello', 'Hello', 'World'])
    expect(doc.lines[0].startMs).toBe(1100)
    expect(currentLyricIndex(doc.lines, 3200)).toBe(1)
  })

  it('parses TTML paragraphs', () => {
    const doc = parseLyrics('<tt><body><p begin="0:01.000" end="0:03.000">Morning</p><p begin="0:03.000">Light</p></body></tt>')
    expect(doc.format).toBe('ttml')
    expect(doc.lines[0]).toMatchObject({ startMs: 1000, endMs: 3000, text: 'Morning' })
  })

  it('keeps untimed text as plain lyrics', () => {
    const doc = parseLyrics({ raw: 'just lyrics' })
    expect(doc.format).toBe('plain')
    expect(doc.plainText).toBe('just lyrics')
  })
})
