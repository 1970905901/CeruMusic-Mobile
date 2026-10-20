/**
 * 「使用 Apple 风格歌词」的移动端等价实现
 * （桌面版 PlaySettings「使用 Apple 风格歌词」/ useAmlLyricRenderer）。
 *
 * 桌面版由 AppleMusic-like 歌词组件驱动：按逐字时间轴推进遮罩，已唱的字变亮、
 * 未唱的字变暗，形成从左到右的扫过效果。移动端歌词来自 LRC/TTML，只有整行时间，
 * 因此这里沿用桌面版同一套「亮暗双色遮罩」技法（见桌面版 LyricAdapter 的
 * `mask-image: linear-gradient(bright …, dark …)`），把逐字推进改为按行时间线性推进。
 */

import type { LyricLine } from '@/types/music'
import { lyricLineDuration } from './lyricJump'

/** 遮罩亮暗分界两侧的过渡宽度（百分比），与桌面版 YRC 的渐变带宽同量级。 */
export const KARAOKE_FADE_WIDTH_PERCENT = 9

/** 未唱部分的遮罩透明度，与桌面版 YRC_DIM_ALPHA 保持一致。 */
export const KARAOKE_DIM_ALPHA = 0.3

/**
 * 行内扫过进度：0 表示未开始，1 表示整行唱完。
 * 行没有结束时间时按 {@link lyricLineDuration} 的估算时长推进，避免遮罩卡在起点。
 */
export function karaokeProgress(line: LyricLine | undefined, positionMs: number): number {
  if (!line || !Number.isFinite(positionMs)) return 0
  if (positionMs <= line.startMs) return 0
  const duration = lyricLineDuration(line)
  if (duration <= 0) return 1
  return Math.min((positionMs - line.startMs) / duration, 1)
}

export type KaraokeCssVars = Record<'--karaoke-mask-x', string>

/**
 * 生成整行遮罩需要的 CSS 变量；关闭 Apple 风格歌词或行无效时返回 undefined，
 * 播放页会回落到普通歌词样式。
 *
 * 取值与桌面版 LyricAdapter 一致：`mask-position-x = (1 - 进度) × 100%`，
 * 配合 220% 宽的亮暗渐变遮罩即可得到从左到右的扫过效果。
 */
export function karaokeMaskStyle(
  line: LyricLine | undefined,
  positionMs: number,
  enabled: boolean
): KaraokeCssVars | undefined {
  if (!enabled || !line) return undefined
  return {
    '--karaoke-mask-x': `${((1 - karaokeProgress(line, positionMs)) * 100).toFixed(2)}%`
  }
}
