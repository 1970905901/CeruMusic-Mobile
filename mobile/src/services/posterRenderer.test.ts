import { describe, expect, it } from 'vitest'
import { getAvailableTemplates, parseLrcToLines, pickHighlightLines } from './posterRenderer'

describe('share poster lyric parsing', () => {
  it('keeps bracketed words that are not timestamp tags', () => {
    // 桌面版曾把 [笑] 这类行内标记整行删掉；海报上的歌词必须保留原句。
    // 注意与移动端歌词渲染不同：桌面海报版 parseLrcToLines 删除行首的全部
    // [..] 标记（含非时间标签），这里按桌面行为锁定。
    const lines = parseLrcToLines('[00:12.34][笑] 副歌开始')
    expect(lines).toEqual(['副歌开始'])
  })

  it('drops timestamps, metadata rows and blank lines', () => {
    const lrc = [
      '[ti:歌名]',
      '[ar:歌手]',
      '[00:01.00] 第一句',
      '',
      '[00:05.00]作词：某人',
      '[00:06.00] 作曲：某人',
      '[00:07.00] 第二句'
    ].join('\r\n')
    expect(parseLrcToLines(lrc)).toEqual(['第一句', '第二句'])
  })

  it('returns empty for missing lyric so the lyric template falls back', () => {
    expect(parseLrcToLines(undefined)).toEqual([])
    expect(parseLrcToLines('')).toEqual([])
  })
})

describe('share poster highlight lines', () => {
  it('returns all lines when fewer than the limit', () => {
    expect(pickHighlightLines(['a', 'b'], 6)).toEqual(['a', 'b'])
  })

  it('picks a stable window around the first third', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line-${i}`)
    expect(pickHighlightLines(lines, 6)).toEqual(lines.slice(9, 15))
  })
})

describe('share poster template list', () => {
  it('offers the lyric template only for songs, disabled without lyric', () => {
    const withLyric = getAvailableTemplates('song', true)
    const withoutLyric = getAvailableTemplates('song', false)
    expect(withLyric.map((t) => t.id)).toEqual([
      'classic',
      'music-card',
      'polaroid',
      'lyric',
      'minimal'
    ])
    expect(withoutLyric.find((t) => t.id === 'lyric')?.label).toContain('无')
  })

  it('never offers the lyric template for playlists', () => {
    const templates = getAvailableTemplates('playlist', true)
    expect(templates.some((t) => t.id === 'lyric')).toBe(false)
    expect(templates.map((t) => t.id)).toEqual(['classic', 'music-card', 'polaroid', 'minimal'])
  })
})
