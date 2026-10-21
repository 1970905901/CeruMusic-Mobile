/**
 * 播放页打开时的初始决策。
 *
 * 这两个设置（showLyricsInPlayer / autoPlayOnOpen）以前只存在于
 * settings store 里、没有任何消费方，属于「有字段没行为」的死配置。
 * 这里把「打开播放页时该做什么」收敛成纯函数，组件只负责执行。
 */

export interface PlayerEntryPreferences {
  /** 打开播放页时是否默认展开歌词 */
  showLyricsInPlayer: boolean
  /** 打开播放页时是否自动续播 */
  autoPlayOnOpen: boolean
}

export interface PlayerEntryState {
  hasTrack: boolean
  /** 播放器当前状态；只有 paused 才允许自动续播 */
  status: string
}

export interface PlayerEntryPlan {
  expandLyrics: boolean
  autoPlay: boolean
}

/**
 * 自动续播只针对「已有歌曲且处于暂停态」：
 * - idle/loading/playing 都不该被这个开关干扰；
 * - ended 交给队列自身的循环/下一首逻辑；
 * - error 需要用户介入，不能反复重试。
 */
export function planPlayerEntry(
  preferences: PlayerEntryPreferences,
  state: PlayerEntryState
): PlayerEntryPlan {
  return {
    expandLyrics: Boolean(preferences.showLyricsInPlayer),
    autoPlay:
      Boolean(preferences.autoPlayOnOpen) && Boolean(state.hasTrack) && state.status === 'paused'
  }
}