import type { Track } from '@/types/music'

/**
 * 把宿主内部的 `Track` 转成发给插件的 `ContentEntity`（桌面端 `toPluginTrack` 的移动端等价）。
 *
 * 移动端此前直接把 `track.raw` 交给插件。对插件搜出来的歌这没问题——`raw` 就是
 * 插件自己产出、经过 `normalizeTrack` 的实体。但**本地音乐和下载任务的 `raw` 不是**：
 * 本地曲目的 `raw` 是 `{ local, lrc, year, genre }`，下载任务的 `raw` 是
 * `{ ref: { providerId: 'download' }, title, capabilities: [] }`（或者干脆没有）。
 * 于是：
 *
 * - `queue.get` / `player.getState` / `history.list` / `localMusic.list` 里，
 *   一首本地歌曲的实体没有 `ref`、没有 `metadata.artists`，插件按 SDK 契约读
 *   `entity.ref.kind` 直接 TypeError，`entity.metadata.artists` 拿到 undefined；
 * - `capabilities` 整个字段缺失（SDK 的 `assertContentPage` 要求它是字符串数组），
 *   插件判断「这首能不能解析 / 有没有歌词」时没有任何依据；
 * - `localUri` / `localPath` 这类只属于本机的字段跟着实体一起送进沙箱。
 *
 * 这里统一按 SDK 的 `ContentEntity` 形状重建：引用、标题、歌手、专辑、时长、
 * 封面、音质与大小都从 `Track` 的结构化字段取（这些字段本来就在入库时规范化过），
 * 本地路径一律剔除。
 */
export interface HostEntity {
  ref: Track['ref']
  title: string
  subtitle?: string
  playable: boolean
  capabilities: string[]
  durationMs?: number
  metadata: {
    artists: string[]
    album: { id: string; title: string }
    artworkUrl: string
    qualities: string[]
    durationMs?: number
    qualitySizes?: Record<string, number>
  }
}

/** 视频/DLNA 之外，宿主能对一首在线曲目提供的能力；本地文件只有前者。 */
const PROVIDER_CAPABILITIES = ['music.resolve@1', 'music.lyrics@1']
const LOCAL_CAPABILITIES = ['music.resolve@1']

/** 歌曲实体里绝不能离开宿主沙箱的字段：只在某一台设备上成立。 */
const LOCAL_ONLY_KEYS = [
  'localUri',
  'localPath',
  'localRelativePath',
  'downloadedPath',
  'downloadedRelativePath'
]

export function toHostEntity(track: Track): HostEntity {
  const local = track.source === 'local' || !!track.localUri || !!track.downloadedPath
  const artists = track.artists.length ? track.artists : ['未知艺术家']
  const qualities = Array.isArray(track.qualities) ? track.qualities : []
  const qualitySizes =
    track.qualitySizes && typeof track.qualitySizes === 'object' && !Array.isArray(track.qualitySizes)
      ? { ...track.qualitySizes }
      : undefined
  return {
    ref: track.ref,
    title: track.title,
    ...(track.subtitle ? { subtitle: track.subtitle } : {}),
    playable: track.playable !== false,
    capabilities: local ? LOCAL_CAPABILITIES : PROVIDER_CAPABILITIES,
    ...(track.durationMs && track.durationMs > 0 ? { durationMs: track.durationMs } : {}),
    metadata: {
      artists,
      album: { id: String(track.albumId ?? ''), title: String(track.album ?? '') },
      artworkUrl: String(track.artworkUrl ?? ''),
      qualities,
      ...(track.durationMs && track.durationMs > 0 ? { durationMs: track.durationMs } : {}),
      ...(qualitySizes ? { qualitySizes } : {})
    }
  }
}

/**
 * 插件菜单收到的歌曲上下文。
 *
 * 桌面端 `playlistItemContext` 交出去的是插件自己的原始实体，再删掉本机字段；
 * 移动端这里同理，但先兜一层：`raw` 缺少 `ref`（本地歌、下载任务）时按 `Track`
 * 重建，否则插件拿到的是一个连 `ref` 都没有的对象。
 */
export function pluginTrackContext(track: Track): Record<string, any> {
  const raw = track.raw && typeof track.raw === 'object' && track.raw.ref ? track.raw : toHostEntity(track)
  const entity = JSON.parse(JSON.stringify(raw)) as Record<string, any>
  for (const key of LOCAL_ONLY_KEYS) delete entity[key]
  return entity
}
