/**
 * Shared flags that must be readable without importing the player or room stores.
 * Kept dependency-free so player.ts can consult them without a circular import.
 */
let listenTogetherActive = false
/** 默认 true：不在房间里时队列本来就可以改。 */
let listenTogetherQueueEditable = true

export function setListenTogetherPlaybackActive(active: boolean): void {
  listenTogetherActive = active
}

export function isListenTogetherPlaybackActive(): boolean {
  return listenTogetherActive
}

/**
 * 用户当前能否直接改动播放队列（一起听房间内只有房主/管理员可以）。
 *
 * 取自房间 store 的 `inRoom && canControl`。与 `isListenTogetherPlaybackActive`
 * 一样留在这里，是为了让 player store 不必 import 房间 store——两者已经互相
 * 依赖，直接 import 会绕成环。
 */
export function setListenTogetherQueueEditable(editable: boolean): void {
  listenTogetherQueueEditable = editable
}

export function isListenTogetherQueueEditable(): boolean {
  return listenTogetherQueueEditable
}
