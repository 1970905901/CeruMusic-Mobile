/**
 * 一起听「待审批点歌」的申请人信息（桌面版 `ListenTogether/parts/PendingPanel.vue`）。
 *
 * 服务端把同一首歌的多条申请合并成一个 `PendingItem`，申请人去重后放在
 * `requesters` 里，`requesterId / requesterName` 只是第一位申请人（为了兼容旧 UI）。
 * 桌面版据此显示头像堆叠、`N 人申请` 与「通过 A、B 的点歌」这类提示。
 *
 * 移动端此前只读 `requesterName`，多人申请时显示的是第一个人的名字，管理员
 * 看不出还有谁在等；旧服务端不下发 `requesters` 时也没有任何回落。
 * 判定集中在这里，页面只负责渲染。
 */

import type { PendingItem, PendingRequester } from '@/services/listenTogetherApi'

/** 头像堆叠最多展示几个，超出显示 `+N`（与桌面版 MAX_AVATAR 一致）。 */
export const MAX_PENDING_AVATARS = 3

/**
 * 全部申请人。
 *
 * 兼容旧服务端：没有 `requesters`（或为空数组）时回落到
 * `[{ userId: requesterId, nickname: requesterName }]`。
 */
export function pendingRequesters(item: PendingItem): PendingRequester[] {
  if (Array.isArray(item.requesters) && item.requesters.length > 0) return item.requesters
  return [{ userId: item.requesterId, nickname: item.requesterName }]
}

/** 堆叠里真正画出来的几个头像。 */
export function visiblePendingAvatars(item: PendingItem): PendingRequester[] {
  return pendingRequesters(item).slice(0, MAX_PENDING_AVATARS)
}

/** 被折叠成 `+N` 的人数。 */
export function pendingAvatarOverflow(item: PendingItem): number {
  return Math.max(0, pendingRequesters(item).length - MAX_PENDING_AVATARS)
}

/** 悬停/长按提示里的完整名单，用顿号连接。 */
export function pendingRequesterTitle(item: PendingItem): string {
  return pendingRequesters(item)
    .map((requester) => requester.nickname)
    .join('、')
}

/**
 * 申请人摘要：多人时是「N 人申请」，单人时直接显示昵称。
 * 昵称为空（匿名）时用桌面版的占位文案，不显示空白。
 */
export function pendingRequesterLabel(item: PendingItem): string {
  const requesters = pendingRequesters(item)
  if (requesters.length > 1) return `${requesters.length} 人申请`
  return requesters[0]?.nickname || '某人'
}

/**
 * 申请时间：一分钟内「刚刚」、一小时内「N 分钟前」，再往上显示本地 `HH:mm`
 * （桌面版 `fmtTime` 同口径）。时间戳非法时返回空串，调用方隐藏这一段。
 */
export function formatPendingTime(ts: number, now = Date.now()): string {
  if (!Number.isFinite(ts)) return ''
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
