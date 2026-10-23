/**
 * 云端歌单与本机歌单的合并，对齐桌面版 `views/music/songlist.vue` 的 `loadPlaylists`。
 *
 * 桌面版登录后会同时拉本地歌单与云端歌单，并把**只存在于云端**的那些一起列进歌单页
 * （标记 `isCloudOnly`）。移动端此前只渲染 IndexedDB 里的本地歌单：换设备登录后，
 * 云端那些歌单在手机上根本看不见，只能靠「导入分享链接」一条条找回来。
 *
 * 合并规则（与桌面同口径）：
 * 1. 本地歌单原样保留。
 * 2. 云端歌单若已有本地歌单认领（`cloudId` 相等），不新增条目。
 * 3. 否则作为「仅云端」条目追加。
 *
 * 另外补一条桌面版也做的修复：云端记录里带 `localId`，但本地那条歌单还没写
 * `cloudId`（旧版本上传后没回写）。这种情况返回一条待回写的关联，由调用方补上——
 * 否则同一个歌单会同时以「本地」和「云端」两份出现在列表里。
 */
import type { CloudSongList } from './cloudSongList'

export interface CloudPlaylistView {
  /** 云端歌单 ID；作为只读条目的稳定标识 */
  id: string
  name: string
  description: string
  cover: string
  updatedAt: string
}

export interface LocalPlaylistLike {
  id: string
  cloudId?: string
}

export interface PlaylistLink {
  localId: string
  cloudId: string
}

export interface CloudPlaylistMerge {
  /** 只存在于云端、需要单独列出的歌单 */
  cloudOnly: CloudPlaylistView[]
  /** 本地歌单缺 `cloudId`、可由云端记录补上的关联 */
  links: PlaylistLink[]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 合并云端歌单。
 *
 * 云端返回的条目可能是脏数据（缺 id、重复 id）。同一个 id 出现两次时保留第一条——
 * 用重复 key 渲染列表会让 Vue 复用错节点，点开一张歌单却看到另一张的内容。
 */
export function mergeCloudPlaylists(
  local: readonly LocalPlaylistLike[],
  cloud: readonly CloudSongList[] | null | undefined
): CloudPlaylistMerge {
  const claimed = new Set<string>()
  for (const item of local) {
    if (item.cloudId) claimed.add(String(item.cloudId))
  }
  const localIds = new Set(local.map((item) => item.id))
  const localByCloud: PlaylistLink[] = []

  const cloudOnly: CloudPlaylistView[] = []
  const seen = new Set<string>()

  for (const record of Array.isArray(cloud) ? cloud : []) {
    const id = text(record?.id).trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (claimed.has(id)) continue

    // 云端记录指向的本地歌单还在，只是没写 cloudId：补上关联，不再重复列出。
    const localId = text(record?.localId).trim()
    if (localId && localIds.has(localId)) {
      localByCloud.push({ localId, cloudId: id })
      continue
    }

    cloudOnly.push({
      id,
      name: text(record?.name).trim() || '未命名歌单',
      description: text(record?.describe),
      cover: text(record?.cover),
      updatedAt: text(record?.updatedAt)
    })
  }

  return { cloudOnly, links: localByCloud }
}

/** 只读云端歌单在列表里的条目键：与本地 id 分属两个命名空间。 */
export function cloudPlaylistKey(cloudId: string): string {
  return 'cloud-' + cloudId
}

/**
 * 从路由参数还原云端歌单 ID。
 *
 * 本地歌单用原始 id、远程（插件）歌单用 `remote-` 前缀，云端歌单同样需要一个
 * 前缀，否则 `PlaylistPage` 会把它当成一条查不到的本地歌单。
 * 返回 `null` 表示这不是云端歌单。
 */
export function cloudPlaylistIdFromRoute(routeId: string): string | null {
  const value = String(routeId || '')
  if (!value.startsWith('cloud-')) return null
  const id = value.slice('cloud-'.length)
  return id || null
}
