/**
 * 跳转时逐行错开（桌面版 PlaySettings「跳转时逐行错开」/ isSeekLyricStagger 的移动端等价实现）。
 *
 * 桌面版通过 AMLL 的 `LayoutReasonStrategyMap[LayoutReason.Seek].disableStagger`
 * 控制跳转后各行歌词的重排是否逐行延迟。移动端歌词是整行列表，跳转时若干行会
 * 同时改变「当前句」高亮、缩放与模糊，因此把同一意图落在 CSS `transition-delay`
 * 上：距离新的当前句越远的行延迟越大，最多错开 {@link SEEK_STAGGER_MAX_LINES} 行。
 */

/** 相邻行之间的错开步长（毫秒）。 */
export const SEEK_STAGGER_STEP_MS = 28

/** 参与错开的最大行距离，更远的行共用同一延迟，避免长歌词表出现长时间延迟。 */
export const SEEK_STAGGER_MAX_LINES = 8

/** 跳转过渡动画本身的时长（毫秒），与 `.lyric-line` 的 transition 保持一致。 */
export const SEEK_STAGGER_TRANSITION_MS = 250

/**
 * 跳转错开的有效窗口：最后一次错开延迟结束后，再等一次过渡动画完成。
 * 窗口结束后歌词恢复逐行立即响应，避免拖动进度条时持续拖影。
 */
export const SEEK_STAGGER_WINDOW_MS =
  SEEK_STAGGER_STEP_MS * SEEK_STAGGER_MAX_LINES + SEEK_STAGGER_TRANSITION_MS

/**
 * 计算某一行的错开延迟。
 * 关闭开关、没有当前句或行非法时返回 0，即所有行同时过渡。
 */
export function seekStaggerDelayMs(
  lineIndex: number,
  activeIndex: number,
  enabled: boolean
): number {
  if (!enabled || activeIndex < 0) return 0
  if (!Number.isFinite(lineIndex) || lineIndex < 0) return 0
  const distance = Math.min(Math.abs(lineIndex - activeIndex), SEEK_STAGGER_MAX_LINES)
  return distance * SEEK_STAGGER_STEP_MS
}

/**
 * 判断这次当前句变化是否来自跳转。
 * 正常播放只向后推进一行；回退或跨越一行以上都视为跳转（拖动进度条、点击歌词、
 * 系统媒体控件的快进/快退），此时才启用逐行错开。
 */
export function isSeekJump(previousIndex: number, nextIndex: number): boolean {
  if (nextIndex < 0) return false
  if (previousIndex < 0) return true
  return nextIndex < previousIndex || nextIndex - previousIndex > 1
}
