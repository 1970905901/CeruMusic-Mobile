/**
 * 一起听共享播放列表的行内操作（桌面版 `ListenTogether/parts/QueuePanel.vue`）。
 *
 * 桌面版每一行除了歌名歌手，还显示「由 XXX 添加」与添加时间，房主/管理员另有
 * 上移、下移两个按钮（走轻量的 `queue:move` patch，只发 itemId + 目标下标，
 * 大队列时不必全量重排），移除按钮的提示也会按身份区分。
 *
 * 移动端队列此前只有「N」和歌名，成员看不出这首是谁点的，管理员想把某首
 * 往上提也只能整单重排。
 *
 * 这里的判定保持纯函数，页面只负责渲染。
 */

import type { QueueItem } from '@/services/listenTogetherApi'

/** 谁点的：服务端字段可能是 `requesterName`，也可能是 `addedBy.nickname`。 */
export function queueRequesterName(item: QueueItem | null | undefined): string {
  return String(item?.requesterName || item?.addedBy?.nickname || '').trim()
}

/** 「由 XXX 添加」；匿名时给一句中性文案而不是留空。 */
export function queueRequesterLabel(item: QueueItem | null | undefined): string {
  const name = queueRequesterName(item)
  return name ? `由 ${name} 添加` : '由成员添加'
}

/**
 * 添加时间 `HH:mm`。时间戳缺失或非法时返回空串——
 * 显示 `Invalid Date` 比不显示更糟，调用方据此隐藏这一段。
 */
export function formatQueueAddedAt(value: unknown): string {
  const ts = Number(value)
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** 上移/下移的目标下标；越界或没有控制权时返回 null（按钮据此禁用）。 */
export function queueMoveTarget(index: number, delta: -1 | 1, length: number): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= length) return null
  const target = index + delta
  if (target < 0 || target >= length) return null
  return target
}

/** 移除按钮提示：有控制权是「从共享列表移除」，没有时是取消自己的点歌。 */
export function queueRemoveHint(canControl: boolean): string {
  return canControl ? '从共享列表移除' : '取消我的点歌'
}
