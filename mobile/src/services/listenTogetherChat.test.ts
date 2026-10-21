import { describe, expect, it } from 'vitest'
import {
  buildChatMeta,
  findMentionQuery,
  parseChatShareLink,
  renderSystemMessage,
  replyPreview,
  splitMentions
} from './listenTogetherChat'

const members = [
  { userId: 'u1', nickname: '张三' },
  { userId: 'u2', nickname: '张三丰' },
  { userId: 'me', nickname: '我自己' }
]

describe('parseChatShareLink', () => {
  it('recognizes song and playlist share links', () => {
    expect(parseChatShareLink('听听 https://ceru.share.shiqianjiang.cn/ab12cd 好听')).toEqual({
      cardType: 'song',
      cardId: 'ab12cd'
    })
    expect(parseChatShareLink('https://ceru.share.shiqianjiang.cn/p/pl99zz')).toEqual({
      cardType: 'playlist',
      cardId: 'pl99zz'
    })
    expect(parseChatShareLink('https://ceru.shiqianjiang.cn/share/playlist/qwe123')).toEqual({
      cardType: 'playlist',
      cardId: 'qwe123'
    })
    expect(parseChatShareLink('https://example.com/share/song/song42')).toEqual({
      cardType: 'song',
      cardId: 'song42'
    })
  })

  it('does not treat the playlist prefix p as a song id', () => {
    expect(parseChatShareLink('https://ceru.share.shiqianjiang.cn/p/')).toBeNull()
    expect(parseChatShareLink('https://ceru.share.shiqianjiang.cn/abcd')).toEqual({ cardType: 'song', cardId: 'abcd' })
  })

  it('ignores plain text and unrelated hosts', () => {
    expect(parseChatShareLink('今晚听什么')).toBeNull()
    expect(parseChatShareLink('')).toBeNull()
    expect(parseChatShareLink('https://example.com/ab12cd')).toBeNull()
  })
})

describe('buildChatMeta', () => {
  it('keeps only mentions whose nickname text is still present', () => {
    const meta = buildChatMeta({
      content: '一起听 @张三 ',
      mentions: [
        { userId: 'u1', nickname: '张三' },
        { userId: 'u2', nickname: '张三丰' }
      ]
    })
    expect(meta.mentions).toBe('u1')
    expect(meta.replyToId).toBeUndefined()
  })

  it('omits an empty meta object entirely', () => {
    expect(buildChatMeta({ content: '普通消息', mentions: [] })).toEqual({})
  })

  it('carries reply context and share card fields', () => {
    const meta = buildChatMeta({
      content: '回你 https://ceru.share.shiqianjiang.cn/ab12cd',
      mentions: [],
      reply: { id: 'm7', from: '小林', preview: '上一句' }
    })
    expect(meta).toMatchObject({
      replyToId: 'm7',
      replyToFrom: '小林',
      replyToPreview: '上一句',
      cardType: 'song',
      cardId: 'ab12cd'
    })
  })
})

describe('splitMentions', () => {
  it('highlights mentions and prefers the longest nickname', () => {
    const segments = splitMentions('@张三丰 和 @张三 都在', ['u1', 'u2'], members, 'me')
    expect(segments).toEqual([
      { type: 'mention', text: '@张三丰', isSelf: false },
      { type: 'text', text: ' 和 ' },
      { type: 'mention', text: '@张三', isSelf: false },
      { type: 'text', text: ' 都在' }
    ])
  })

  it('marks self mentions and falls back to plain text for unknown members', () => {
    expect(splitMentions('@我自己 来了', ['me'], members, 'me')).toEqual([
      { type: 'mention', text: '@我自己', isSelf: true },
      { type: 'text', text: ' 来了' }
    ])
    expect(splitMentions('@陌生人', ['gone'], members, 'me')).toEqual([
      { type: 'text', text: '@陌生人' }
    ])
    expect(splitMentions('', ['u1'], members, 'me')).toEqual([])
  })
})

describe('findMentionQuery', () => {
  it('returns the query when typing after an at sign', () => {
    expect(findMentionQuery('你好 @张')).toEqual({ query: '张', at: 3 })
    expect(findMentionQuery('@ab cd', 3)).toEqual({ query: 'ab', at: 0 })
  })

  it('ignores email-style at signs and stale queries', () => {
    expect(findMentionQuery('user@host')).toBeNull()
    expect(findMentionQuery('@张 后面还有字')).toBeNull()
    expect(findMentionQuery('')).toBeNull()
  })
})

describe('replyPreview', () => {
  it('renders sticker labels and truncates long text', () => {
    expect(replyPreview('sticker-5', 'sticker', '等你哦')).toBe('[贴纸] 等你哦')
    expect(replyPreview('sticker-99', 'sticker')).toBe('[贴纸] sticker-99')
    expect(replyPreview('x'.repeat(100), 'text')).toHaveLength(40)
  })
})

describe('renderSystemMessage', () => {
  it('translates known server keys', () => {
    expect(renderSystemMessage('queue-request', { user: '小林', song: '晴天' })).toBe(
      '小林 申请点歌《晴天》'
    )
    expect(renderSystemMessage('member-join', {})).toBe('某人 加入了房间')
  })

  it('passes through unknown keys so new server events stay visible', () => {
    expect(renderSystemMessage('brand-new-event', {})).toBe('brand-new-event')
  })
})

