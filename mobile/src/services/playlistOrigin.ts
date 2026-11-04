/**
 * 远程歌单保存到本地后的「来源」记录，对齐桌面 `views/music/list.vue` 的
 * `handleSaveToLocal` / `handleSyncPlaylist`：
 *
 * ```ts
 * songListAPI.create(name, desc, source, { playlistId, source, isLeaderboard })
 * ...
 * const detailResult = await requestSdk('getPlaylistDetail', { source, id: playlistId })
 * ```
 *
 * 桌面把 `playlistId` + `source` 记在歌单 meta 上，于是本地歌单能「同步歌单」：
 * 重新拉一遍平台歌单，把新歌追加进来（重复的跳过）。移动端保存到本地时
 * **没有记录任何来源**——存下来的只是一份静态快照，平台歌单后来加歌，
 * 用户只能删掉重存（连带丢失自定义封面与排序）。
 *
 * 判定收在这里，`Playlist` 记录只负责存字段。
 */

export interface PlaylistOriginInput {
  pluginKey?: string | null
  source?: string | null
  providerId?: string | null
  remoteId?: string | null
  /** 排行榜与普通歌单在插件侧是同一条读取路径，这里只做记录。 */
  kind?: string | null
}

export interface PlaylistOrigin {
  source: 'plugin'
  pluginKey?: string
  providerId?: string
  remoteId?: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 由远程歌单页的上下文生成要写进本地歌单的来源。
 *
 * 空 id 不写：空字符串会让「同步歌单」去请求一张不存在的歌单，
 * 不如让 `canSyncPlaylist` 直接判为不可同步。
 */
export function remotePlaylistOrigin(input: PlaylistOriginInput): PlaylistOrigin {
  const source = text(input.source)
  const remoteId = text(input.remoteId)
  const providerId = text(input.providerId) || source
  const pluginKey = text(input.pluginKey)
  return {
    source: 'plugin',
    ...(pluginKey ? { pluginKey } : {}),
    ...(providerId ? { providerId } : {}),
    ...(remoteId ? { remoteId } : {})
  }
}

export interface SyncablePlaylist {
  id: string
  source: 'local' | 'plugin'
  pluginKey?: string
  providerId?: string
  remoteId?: string
}

/**
 * 这张本地歌单能否「同步歌单」。
 *
 * `installedPlugins` 传已启用插件的 key 列表：来源插件已被卸载 / 停用时
 * 同步按钮只会点出一句「插件未启用」，不如不显示。不传则只看记录本身。
 */
export function canSyncPlaylist(
  playlist: SyncablePlaylist,
  installedPlugins?: readonly string[]
): boolean {
  if (playlist.source !== 'plugin') return false
  if (!text(playlist.remoteId)) return false
  if (!text(playlist.providerId)) return false
  if (installedPlugins && text(playlist.pluginKey) && !installedPlugins.includes(playlist.pluginKey!)) {
    return false
  }
  return true
}
