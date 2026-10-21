import type { ChatMsg } from '@/services/listenTogetherApi'

/**
 * 一起听弹幕（桌面端 `LtDanmakuLayer` 的移动端等价实现）。
 *
 * 轨道选择、飞行时长、字号抖动与「只弹 text/emoji」这些规则抽成纯函数，
 * 组件只负责计时与渲染；随机源通过参数注入，单测可复现。
 */

export const DANMAKU_TRACK_COUNT = 8
export const DANMAKU_TRACK_COOLDOWN_MS = 1000
/** 只在「最早可用」的前 N 条轨道里随机选，模拟瀑布流的凌乱感 */
export const DANMAKU_TRACK_RANDOM_TOP_K = 5
export const DANMAKU_FLY_MIN_MS = 6500
export const DANMAKU_FLY_MAX_MS = 11000
export const DANMAKU_FONT_SIZES = [12, 13, 14] as const
/** 单条弹幕最多 80 字，防止超长文本撑爆屏幕 */
export const DANMAKU_TEXT_LIMIT = 80

export interface DanmakuSpan {
  id: string
  text: string
  avatar?: string
  nickname: string
  isSelf: boolean
  track: number
  duration: number
  fontSize: number
}

export interface DanmakuOptions {
  myUserId: string
  speed: number
  fontScale: number
  /** 返回 [0,1) 的随机数，默认 Math.random */
  random?: () => number
}

/**
 * 挑选轨道并返回该轨道新的「上次使用时间」。
 *
 * 取 lastUsed 最早的 K 条里随机选一条；选中轨道若仍在冷却内，把 lastUsed
 * 推到 now + cooldown，让后续弹幕自动排到更晚的位置。
 */
export function pickDanmakuTrack(
  lastUsed: readonly number[],
  now: number,
  random: () => number = Math.random
): { track: number; lastUsed: number[] } {
  const next = [...lastUsed]
  if (!next.length) return { track: 0, lastUsed: next }
  const order = next
    .map((value, track) => ({ value, track }))
    .sort((left, right) => left.value - right.value || left.track - right.track)
  const topK = Math.max(1, Math.min(DANMAKU_TRACK_RANDOM_TOP_K, order.length))
  const index = Math.min(topK - 1, Math.floor(random() * topK))
  const track = order[index].track
  next[track] = Math.max(now, next[track] + DANMAKU_TRACK_COOLDOWN_MS)
  return { track, lastUsed: next }
}

/** 只有文本/表情消息才飘；系统消息、贴纸（内容只是 id）不参与。 */
export function isDanmakuCandidate(message: ChatMsg | null | undefined): boolean {
  if (!message) return false
  if (message.type !== 'text' && message.type !== 'emoji') return false
  return Boolean(String(message.content || '').trim())
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/**
 * 生成一条弹幕。返回 null 表示这条消息不该飘（系统消息/空内容/已关弹幕）。
 * `track` 由调用方传入，轨道时间表由 pickDanmakuTrack 维护。
 */
export function buildDanmaku(
  message: ChatMsg,
  track: number,
  options: DanmakuOptions
): DanmakuSpan | null {
  if (!isDanmakuCandidate(message)) return null
  const random = options.random ?? Math.random
  const speed = clampNumber(options.speed, 0.2, 4, 1)
  const fontScale = clampNumber(options.fontScale, 0.5, 3, 1)
  const base = DANMAKU_FLY_MIN_MS + random() * (DANMAKU_FLY_MAX_MS - DANMAKU_FLY_MIN_MS)
  const baseFont = DANMAKU_FONT_SIZES[Math.min(
    DANMAKU_FONT_SIZES.length - 1,
    Math.floor(random() * DANMAKU_FONT_SIZES.length)
  )]
  const from = message.from
  return {
    id: message.id,
    text: String(message.content).slice(0, DANMAKU_TEXT_LIMIT),
    avatar: from?.avatar || undefined,
    nickname: from?.nickname || '匿名',
    isSelf: Boolean(from?.userId && from.userId === options.myUserId),
    track: Math.max(0, Math.min(DANMAKU_TRACK_COUNT - 1, Math.floor(track))),
    duration: Math.round(base / speed),
    fontSize: Math.round(baseFont * fontScale)
  }
}

/** 弹幕纵向位置：轨道均匀分布，避免与顶部栏和下方控制区重叠。 */
export function danmakuTopPercent(track: number): number {
  const index = Math.max(0, Math.min(DANMAKU_TRACK_COUNT - 1, Math.floor(track)))
  return (index / DANMAKU_TRACK_COUNT) * 100
}
