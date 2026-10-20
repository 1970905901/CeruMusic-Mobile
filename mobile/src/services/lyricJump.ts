/**
 * 跳动歌词（桌面版 PlaySettings「跳动歌词」/ isJumpLyric 的移动端等价实现）。
 *
 * 桌面版由 AppleMusic-like 歌词组件按「逐字起跳 + 物理回弹」驱动，字的时长越长，
 * 放大倍数与位移越大。移动端歌词是整行 LRC（没有逐字时间轴），因此把同一套幅度
 * 公式作用在「当前行」上：行越长，跳动幅度越大，唱歌时起跳、行末回弹。
 */

/** 与桌面版 LyricAdapter 相同的时长夹取区间（毫秒）。 */
export const JUMP_MIN_DURATION_MS = 100
export const JUMP_MAX_DURATION_MS = 800

/** 桌面版起跳前的默认下沉量（LyricAdapter 的 translateY 初值）。 */
const BASE_DROP_EM = 0.16

/** 当前行在播放器里没有结束时间时使用的估算时长。 */
const FALLBACK_LINE_DURATION_MS = 3000

/** 桌面版起跳动画的时长下限（毫秒）。 */
const MIN_JUMP_ANIMATION_MS = 1100

export interface LyricJumpAmplitude {
  /** 起跳前的下沉量（em），与行时长无关，保持桌面版初值。 */
  dropEm: number
  /** 起跳后的上浮量（em），行越长上浮越多（桌面版 0 ~ 0.01em）。 */
  liftEm: number
  scale: number
}

/**
 * 依据行（桌面版是字）时长换算跳动幅度。
 * 时长被夹取到 100–800ms，再线性映射到桌面版的 1.02–1.15 倍与 0~0.01em 上浮。
 */
export function lyricJumpAmplitude(durationMs: number): LyricJumpAmplitude {
  const safeDuration = Number.isFinite(durationMs) ? durationMs : JUMP_MIN_DURATION_MS
  const clamped = Math.max(
    JUMP_MIN_DURATION_MS,
    Math.min(safeDuration, JUMP_MAX_DURATION_MS)
  )
  const factor = (clamped - JUMP_MIN_DURATION_MS) / (JUMP_MAX_DURATION_MS - JUMP_MIN_DURATION_MS)
  return {
    dropEm: BASE_DROP_EM,
    liftEm: factor * 0.01,
    scale: 1.02 + factor * 0.13
  }
}

/** 当前行的实际时长；缺结束时间时按固定值估算，避免出现无限动画。 */
export function lyricLineDuration(line: { startMs: number; endMs?: number }): number {
  if (typeof line.endMs === 'number' && Number.isFinite(line.endMs) && line.endMs > line.startMs) {
    return line.endMs - line.startMs
  }
  return FALLBACK_LINE_DURATION_MS
}

/** 起跳动画时长：与桌面版一致，至少 1.1 秒，行越长动画越慢。 */
export function lyricJumpAnimationMs(durationMs: number): number {
  const safeDuration = Number.isFinite(durationMs) ? durationMs : FALLBACK_LINE_DURATION_MS
  return Math.max(safeDuration, MIN_JUMP_ANIMATION_MS)
}

export type LyricJumpCssVars = Record<
  '--lyric-jump-scale' | '--lyric-jump-lift' | '--lyric-jump-drop' | '--lyric-jump-duration',
  string
>

/**
 * 生成当前行需要的 CSS 变量；关闭「跳动歌词」或行无效时返回 undefined，
 * 让播放页保持静态样式。
 */
export function lyricJumpStyle(
  line: { startMs: number; endMs?: number } | undefined,
  enabled: boolean
): LyricJumpCssVars | undefined {
  if (!enabled || !line) return undefined
  const duration = lyricLineDuration(line)
  const amplitude = lyricJumpAmplitude(duration)
  return {
    '--lyric-jump-scale': amplitude.scale.toFixed(3),
    '--lyric-jump-drop': `${amplitude.dropEm.toFixed(3)}em`,
    '--lyric-jump-lift': `${amplitude.liftEm.toFixed(3)}em`,
    '--lyric-jump-duration': `${(lyricJumpAnimationMs(duration) / 1000).toFixed(2)}s`
  }
}
