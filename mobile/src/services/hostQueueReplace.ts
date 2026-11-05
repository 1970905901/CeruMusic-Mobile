/**
 * 插件 `queue.replace` 之后「现在播放到哪儿」的判定。
 *
 * 桌面 `services.queue.*` 只替换列表本身（`store.list = incoming`），正在播放的
 * 那首不受影响：`currentIndex` 由当前歌曲在**新列表**里的位置算出，找不到就是 -1。
 * 移动端的 `currentIndex` 是唯一的事实来源——`currentTrack` 由
 * `queue[currentIndex]` 推导，播放页、迷你播放器、`player.getState` 全读它。
 *
 * 此前 `replaceHostQueue` 无条件写 `currentIndex = 0`：插件把队列换成 `[B, C]`
 * 时，用户耳朵里还是 A，界面和 `player.getState` 却都说是 B——点暂停停的是 A，
 * 点下一首跳到 C，播放历史记的是 B。队列空时还会把下标留在 0（应为 -1）。
 *
 * 规则：
 * - 当前歌曲仍在新队列里 → 指向它，音频不动；
 * - 当前歌曲被换掉了 → 必须停掉旧音频，否则界面报的歌与实际出声的歌不是同一首；
 * - 什么都没装载（冷启动、刚清空）→ 落在第 0 首但不主动起播，
 *   与 `appendToQueue` 的「空队列落到 0、不自动播放」保持一致。
 */

export interface QueueReplacePlan {
  /** 新队列里应指向的下标；空队列为 -1。 */
  index: number
  /** 是否要停掉仍在播放的旧音频。 */
  stopAudio: boolean
}

/**
 * @param keys       替换后的队列 key，顺序即队列顺序
 * @param currentKey 替换前正在播放/装载的歌曲 key
 * @param loaded     替换前是否已有音频装载（`audio.src` 存在）
 */
export function planQueueReplace(
  keys: readonly string[],
  currentKey: string | null | undefined,
  loaded: boolean
): QueueReplacePlan {
  const fallback = keys.length ? 0 : -1
  if (currentKey) {
    const index = keys.indexOf(currentKey)
    if (index >= 0) return { index, stopAudio: false }
  }
  // 旧歌不在新队列里：只要它还在出声就必须停，避免「界面是 B、声音是 A」。
  return { index: fallback, stopAudio: loaded }
}
