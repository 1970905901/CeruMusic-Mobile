import { describe, expect, it } from 'vitest'
import {
  MAX_NOTICE_BLOCKS,
  noticeNeedsExpand,
  parseInline,
  parseNoticeBlocks,
  safeHref
} from './noticeContent'

describe('safe links', () => {
  it('accepts http and https', () => {
    // 返回的是 URL 规范化后的地址（补上末尾斜杠），协议与主机不变。
    expect(safeHref('https://ceru.example/a')).toBe('https://ceru.example/a')
    expect(safeHref('http://ceru.example')).toBe('http://ceru.example/')
  })

  it('rejects script and data protocols', () => {
    // 通知是服务端下发的文本；javascript: 链接会变成一点就执行的锚点。
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeHref('file:///etc/passwd')).toBeNull()
    expect(safeHref('')).toBeNull()
    expect(safeHref('not a url')).toBeNull()
  })
})

describe('inline parsing', () => {
  it('keeps plain text in one segment', () => {
    expect(parseInline('普通通知正文')).toEqual([{ kind: 'text', text: '普通通知正文' }])
  })

  it('parses bold, italic, code and links', () => {
    // 相邻纯文本会合并成一段，避免模板里生成一堆碎 span。
    expect(parseInline('**重要** 与 `v2.0` 见 [更新](https://ceru.example)')).toEqual([
      { kind: 'bold', text: '重要' },
      { kind: 'text', text: ' 与 ' },
      { kind: 'code', text: 'v2.0' },
      { kind: 'text', text: ' 见 ' },
      { kind: 'link', text: '更新', href: 'https://ceru.example/' }
    ])
  })

  it('degrades an unsafe link to text instead of rendering an anchor', () => {
    expect(parseInline('[点我](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '[点我](javascript:alert(1))' }
    ])
  })

  it('handles underscores used for emphasis', () => {
    expect(parseInline('__粗__ _斜_')).toEqual([
      { kind: 'bold', text: '粗' },
      { kind: 'text', text: ' ' },
      { kind: 'italic', text: '斜' }
    ])
  })

  it('returns the original text when nothing matches', () => {
    expect(parseInline('a * b')).toEqual([{ kind: 'text', text: 'a * b' }])
  })
})

describe('block parsing', () => {
  it('splits paragraphs, headings and bullets', () => {
    const blocks = parseNoticeBlocks('# 标题\n正文一\n\n- 条目\n- 条目二')
    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'bullet',
      'bullet'
    ])
    expect(blocks[0].level).toBe(1)
  })

  it('keeps line breaks inside a paragraph', () => {
    const [block] = parseNoticeBlocks('第一行\n第二行')
    expect(block.segments[0].text).toBe('第一行\n第二行')
  })

  it('handles heading levels up to six', () => {
    const [block] = parseNoticeBlocks('###### 六级')
    expect(block.level).toBe(6)
  })

  it('returns no blocks for empty content', () => {
    expect(parseNoticeBlocks('')).toEqual([])
    expect(parseNoticeBlocks('   \n\n  ')).toEqual([])
  })

  it('stops at the block cap so one notice cannot flood the list', () => {
    const content = Array.from({ length: MAX_NOTICE_BLOCKS + 20 }, (_, i) => `段落 ${i}`).join(
      '\n\n'
    )
    expect(parseNoticeBlocks(content)).toHaveLength(MAX_NOTICE_BLOCKS)
  })
})

describe('expand hint', () => {
  it('only asks for expansion when the notice is actually long', () => {
    expect(noticeNeedsExpand(parseNoticeBlocks('短通知'))).toBe(false)
    expect(noticeNeedsExpand(parseNoticeBlocks('- a\n- b\n- c\n- d'))).toBe(true)
    expect(noticeNeedsExpand(parseNoticeBlocks('长'.repeat(130)))).toBe(true)
  })
})
