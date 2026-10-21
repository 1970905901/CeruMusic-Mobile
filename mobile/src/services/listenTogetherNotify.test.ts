import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createNotifyQueue,
  formatChatPreview,
  formatPendingPreview,
  isMentionedSelf,
  type NotifyPayload
} from './listenTogetherNotify'
import type { ChatMsg } from './listenTogetherApi'

function chat(overrides: Partial<ChatMsg> = {}): ChatMsg {
  return {
    id: 'm1',
    type: 'text',
    content: '晚上好',
    from: { userId: 'u1', nickname: '小林' },
    ts: 1,
    ...overrides
  } as ChatMsg
}

describe('createNotifyQueue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires the first message immediately and aggregates during cooldown', () => {
    const fired: NotifyPayload[] = []
    const queue = createNotifyQueue({
      fire: (payload) => fired.push(payload),
      cooldownMs: 4000
    })
    queue.push({ title: '房间', body: '小林：一' })
    expect(fired).toEqual([{ title: '房间', body: '小林：一' }])
    expect(queue.cooling).toBe(true)

    queue.push({ title: '房间', body: '小林：二' })
    queue.push({ title: '房间', body: '小林：三' })
    expect(fired).toHaveLength(1)

    vi.advanceTimersByTime(4000)
    expect(fired[1]).toEqual({ title: '房间 · 2 条新消息', body: '最近：小林：三' })
    expect(queue.cooling).toBe(false)
  })

  it('honours the buffer limit and drops empty payloads', () => {
    const fired: NotifyPayload[] = []
    const queue = createNotifyQueue({ fire: (p) => fired.push(p), bufferLimit: 2 })
    queue.push({ title: '', body: 'ignored' })
    expect(fired).toHaveLength(0)

    queue.push({ title: 'R', body: '1' })
    queue.push({ title: 'R', body: '2' })
    queue.push({ title: 'R', body: '3' })
    queue.push({ title: 'R', body: '4' })
    vi.runAllTimers()
    // Buffer caps at 2, so '4' is dropped and '3' stays the newest retained item.
    expect(fired[1]).toEqual({ title: 'R · 2 条新消息', body: '最近：3' })
  })

  it('flush emits pending items and reset discards them', () => {
    const fired: NotifyPayload[] = []
    const queue = createNotifyQueue({ fire: (p) => fired.push(p) })
    queue.push({ title: 'R', body: '1' })
    queue.push({ title: 'R', body: '2' })
    queue.flush()
    expect(fired).toHaveLength(2)

    queue.push({ title: 'R', body: '3' })
    queue.push({ title: 'R', body: '4' })
    queue.reset()
    vi.runAllTimers()
    expect(fired).toHaveLength(3)
    expect(queue.cooling).toBe(false)
  })
})

describe('chat previews', () => {
  it('uses the sender name and truncates long text', () => {
    expect(formatChatPreview(chat())).toBe('小林：晚上好')
    const long = formatChatPreview(chat({ content: 'x'.repeat(60) }))
    expect(long.endsWith('…')).toBe(true)
    expect(long).toHaveLength('小林：'.length + 28 + 1)
  })

  it('renders sticker labels instead of raw ids', () => {
    expect(formatChatPreview(chat({ type: 'sticker', content: 'sticker-5' }))).toBe(
      '小林：[贴纸] 等你哦'
    )
    expect(formatChatPreview(chat({ type: 'sticker', content: 'sticker-99' }))).toBe(
      '小林：[贴纸] sticker-99'
    )
  })

  it('falls back for anonymous senders and pending songs', () => {
    expect(formatChatPreview(chat({ from: null }))).toBe('音乐同好：晚上好')
    expect(
      formatPendingPreview({
        reqId: 'r',
        song: { songmid: '1', source: 'wy' },
        requesterId: 'u2',
        requesterName: '',
        requestedAt: 0
      } as any)
    ).toBe('某人 点了《?》')
  })
})

describe('isMentionedSelf', () => {
  it('detects explicit mentions', () => {
    const message = chat({ meta: { mentions: 'u9,me' } })
    expect(isMentionedSelf(message, 'me', [])).toBe(true)
    expect(isMentionedSelf(message, 'other', [])).toBe(false)
  })

  it('treats a reply to my message as a mention', () => {
    const history = [chat({ id: 'old', from: { userId: 'me', nickname: '我' } })]
    const message = chat({ meta: { replyToId: 'old' } })
    expect(isMentionedSelf(message, 'me', history)).toBe(true)
    expect(isMentionedSelf(message, 'u2', history)).toBe(false)
  })

  it('ignores messages without identity or context', () => {
    expect(isMentionedSelf(chat(), '', [])).toBe(false)
    expect(isMentionedSelf(chat({ meta: { replyToId: 'missing' } }), 'me', [])).toBe(false)
  })
})
