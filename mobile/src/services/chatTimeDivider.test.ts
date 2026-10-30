import { describe, expect, it } from 'vitest'
import {
  CHAT_TIME_DIVIDER_GAP_MS,
  buildChatRows,
  formatChatDividerTime
} from './chatTimeDivider'
import type { ChatMsg } from './listenTogetherApi'

function msg(id: string, ts: number, type: ChatMsg['type'] = 'text'): ChatMsg {
  return { id, type, content: id, from: { userId: 'u1', nickname: '小林' }, ts } as ChatMsg
}

const base = new Date(2026, 9, 30, 21, 0, 0).getTime()

describe('chat time dividers', () => {
  it('puts a divider before the first message', () => {
    const rows = buildChatRows([msg('a', base), msg('b', base + 1000)])
    expect(rows[0]).toMatchObject({ kind: 'time', id: 't:a' })
    expect(rows.filter((row) => row.kind === 'time')).toHaveLength(1)
  })

  it('closes a gap of more than three minutes but not a shorter one', () => {
    // 3 分钟内算同一段对话；超过才另起一条时间条。
    const close = buildChatRows([msg('a', base), msg('b', base + 2 * 60_000)])
    expect(close.filter((row) => row.kind === 'time')).toHaveLength(1)

    const far = buildChatRows([
      msg('a', base),
      msg('b', base + CHAT_TIME_DIVIDER_GAP_MS + 1)
    ])
    expect(far.filter((row) => row.kind === 'time')).toHaveLength(2)
  })

  it('does not treat exactly three minutes as a new segment', () => {
    const rows = buildChatRows([msg('a', base), msg('b', base + CHAT_TIME_DIVIDER_GAP_MS)])
    expect(rows.filter((row) => row.kind === 'time')).toHaveLength(1)
  })

  it('keeps a divider id separate from the message id', () => {
    // 时间条与消息打平成同一列表渲染，id 撞键会让 v-for 复用错行。
    const rows = buildChatRows([msg('a', base)])
    expect(rows.map((row) => row.id)).toEqual(['t:a', 'a'])
  })

  it('skips timestamps that are missing or unusable', () => {
    const rows = buildChatRows([
      msg('a', Number.NaN),
      msg('b', base),
      msg('c', Number.NaN),
      msg('d', base + CHAT_TIME_DIVIDER_GAP_MS + 1)
    ])
    // 脏数据不产生时间条，但也不把后面的消息并进同一条。
    expect(rows.filter((row) => row.kind === 'time')).toHaveLength(2)
    expect(rows).toHaveLength(6)
  })

  it('formats a divider as a 24-hour clock without a period prefix', () => {
    const text = formatChatDividerTime(new Date(2026, 9, 30, 21, 5).getTime())
    expect(text).toMatch(/21:05|21：05/)
    expect(text).not.toMatch(/下午|上午/)
  })

  it('renders nothing for an unusable timestamp', () => {
    expect(formatChatDividerTime(Number.NaN)).toBe('')
    expect(formatChatDividerTime(0)).toBe('')
  })
})
