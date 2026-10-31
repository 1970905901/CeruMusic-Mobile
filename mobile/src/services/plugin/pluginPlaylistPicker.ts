/**
 * `ui.dialogs.pickPlaylist(request)` 的候选清单与返回结果。
 *
 * 抽成纯函数是为了单测：SDK 的 `request` 有 `location`（`local` / `cloud`）与
 * `writable` 两个过滤条件，返回的 `LibraryPlaylist` 必须带 `ref` 与 `writable`。
 * 移动端此前一律只列本地歌单、忽略 `writable`，插件按契约选的云歌单根本看不到。
 */
export interface HostPlaylistRow {
  ref: { id: string; location: 'local' | 'cloud' }
  name: string
  description?: string
  trackCount?: number
  writable: boolean
}

export interface CandidateInput {
  location?: 'local' | 'cloud'
  writable?: boolean
  /** 已加载的本地歌单 */
  local: readonly HostPlaylistRow[]
  /** 云端歌单；只在 `location === 'cloud'` 时才由调用方去拉 */
  cloud: readonly HostPlaylistRow[]
}

/** 按请求的 `location` / `writable` 过滤候选。缺省为本地、不过滤可写性。 */
export function candidatePlaylists(input: CandidateInput): HostPlaylistRow[] {
  const cloud = input.location === 'cloud' ? [...input.cloud] : []
  const candidates = [...input.local, ...cloud]
  return input.writable === true
    ? candidates.filter((item) => item.writable)
    : candidates
}

/** 用户在选择面板上选中（或取消）之后应返回给插件的值。 */
export function resolvePickedPlaylist(input: {
  selected?: HostPlaylistRow | null
  /** 用户点了「新建本地歌单」 */
  createNew?: HostPlaylistRow | null
}): HostPlaylistRow | null {
  if (input.createNew) return input.createNew
  return input.selected ?? null
}
