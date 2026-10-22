/**
 * 当前歌词的共享信号，用于向插件推送 `lyrics.changed`。
 *
 * 移动端的歌词文档一直只存在于播放页组件里（`lyricsDoc`），插件侧的
 * `ctx.events.on('lyrics.changed')` 因此永远不会触发——桌面版在
 * `PluginHostBridge` 里监听 `GlobalPlayStatus.player.lyrics` 并广播。
 *
 * 这里做一个最小桥接：播放页在歌词变化后调用 `publishCurrentLyrics`，
 * 插件 store 订阅并转发给所有运行时。桥不持有额外状态、不做缓存，
 * 纯粹的「一次事件」语义，页面卸载后不再有任何引用残留。
 */
import type { LyricDocument } from '@/types/music'

type Listener = (document: LyricDocument | null) => void

const listeners = new Set<Listener>()

/** 订阅歌词变化；返回取消函数。 */
export function onCurrentLyrics(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 播放页调用：歌词加载、切歌或清空后广播一次。 */
export function publishCurrentLyrics(document: LyricDocument | null): void {
  for (const listener of listeners) {
    try {
      listener(document)
    } catch (error) {
      console.warn('歌词事件订阅者出错', error)
    }
  }
}

/** 测试用：清空订阅。 */
export function resetLyricsBridge(): void {
  listeners.clear()
}
