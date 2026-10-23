/**
 * 歌单卡片上的一行说明：简介、同步状态与更新时间。
 *
 * 桌面版 `views/music/songlist.vue` 的卡片在名称下方还有三样信息：简介（为空时给一句
 * 固定文案）、来源与「更新于 / 创建于」时间，名称右侧另有「已同步 / 仅云端」标签。
 * 移动端音乐库此前只有名称与曲目数，同名的两个歌单（一个本地、一个云端）在列表里
 * 长得一模一样，用户没法判断哪张是本机的、哪张是打开时才去云端拉的。
 *
 * 判定集中在这里：标签只看 `cloudId`，时间取「有云端记录时用云端更新时间」，
 * 否则回落本地 `updatedAt`，再否则用创建时间。
 */

import type { Playlist } from '@/types/music'

/** 简介为空时的固定文案，与桌面端逐字一致。 */
export const PLAYLIST_EMPTY_DESCRIPTION = '这个人很懒并没有留下任何描述...'

export type PlaylistSyncState = 'synced' | null

/** 已关联云端副本的歌单才有标签；未关联时不展示任何同步状态。 */
export function playlistSyncState(playlist: Pick<Playlist, 'cloudId'> | null | undefined): PlaylistSyncState {
  return playlist?.cloudId ? 'synced' : null
}

export function playlistSyncLabel(state: PlaylistSyncState): string {
  return state === 'synced' ? '已同步' : ''
}

export function playlistDescriptionText(description: string | undefined | null): string {
  const text = String(description ?? '').trim()
  return text || PLAYLIST_EMPTY_DESCRIPTION
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYY-MM-DD HH:mm`；非法时间返回空串，调用方据此隐藏整行。 */
export function formatPlaylistTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/**
 * 名称下方的时间行：云端有记录时以云端时间为准（对齐桌面端 `cloudUpdatedAt`
 * 优先于 `createTime` 的取法），否则用本地更新时间，最后回落到创建时间。
 * 时间全都不可读时返回空串。
 */
export function playlistTimeLine(input: {
  cloudUpdatedAt?: string | number | Date | null
  updatedAt?: string | number | Date | null
  createdAt?: string | number | Date | null
}): string {
  const cloud = formatPlaylistTime(input.cloudUpdatedAt)
  if (cloud) return `更新于 ${cloud}`
  const updated = formatPlaylistTime(input.updatedAt)
  if (updated) return `更新于 ${updated}`
  const created = formatPlaylistTime(input.createdAt)
  return created ? `创建于 ${created}` : ''
}
