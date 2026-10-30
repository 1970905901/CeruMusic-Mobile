/**
 * 一起听聊天的时间分割条（桌面版 `ListenTogether/parts/ChatPanel.vue`）。
 *
 * 桌面版把「时间分割条」与消息打平成同一类 row：第一条消息前插一条，
 * 之后只要与**上一条消息**的时间差超过 3 分钟就再插一条；时间按
 * `toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })`
 * 显示，并去掉可能出现的「上午 / 下午」前缀，保持 24 小时制观感。
 *
 * 移动端聊天面板此前只有消息气泡：翻十几分钟的聊天记录时，完全看不出
 * 每一段是什么时候说的。
 *
 * 判定与格式化集中在这里，页面只负责渲染。
 */

import type { ChatMsg } from '@/services/listenTogetherApi'

/** 与上一条消息相隔超过该值才重新插入时间条（桌面版为 3 分钟）。 */
export const CHAT_TIME_DIVIDER_GAP_MS = 3 * 60 * 1000

export type ChatRow =
  | { kind: 'time'; id: string; ts: number }
  | { kind: 'msg'; id: string; message: ChatMsg }

/**
 * 把消息列表摊平成「时间条 + 消息」的行序列。
 *
 * - 第一条消息前总有一条时间条；
 * - 消息的 `ts` 缺失或非法时不参与比较，也不单独产生时间条（脏数据不该
 *   制造一个 `Invalid Date` 或打乱节奏）；
 * - 时间条的 id 用 `t:<消息 id>`，避免与消息 id 撞键。
 */
export function buildChatRows(messages: readonly ChatMsg[]): ChatRow[] {
  const rows: ChatRow[] = []
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    const ts = Number(message?.ts)
    const valid = Number.isFinite(ts) && ts > 0
    const previous = messages[index - 1]
    const previousTs = Number(previous?.ts)
    const previousValid = index > 0 && Number.isFinite(previousTs) && previousTs > 0

    if (valid) {
      const showTime = index === 0 || !previousValid || ts - previousTs > CHAT_TIME_DIVIDER_GAP_MS
      // 上一条时间未知时也要断开时间条，否则一串脏数据会把整段并成一条。
      if (showTime) rows.push({ kind: 'time', id: `t:${message.id}`, ts })
    }
    rows.push({ kind: 'msg', id: message.id, message })
  }
  return rows
}

/**
 * 时间条文案：`HH:mm`。
 *
 * 桌面版先按 `zh-CN` 的两位小时/两位分钟格式化，再剥掉「上午 / 下午」前缀；
 * 这里同样处理，避免某些设备的区域数据把它带出来。时间戳非法时返回空串。
 */
export function formatChatDividerTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  return date
    .toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    .replace(/^[上下]午/, '')
    .trim()
}
