/**
 * 插件 `downloads.create` 的音质解析，对齐桌面
 * `services/pluginHostServices.ts`：
 *
 * ```ts
 * const quality = request.quality
 *   || song.types?.[0]?.type
 *   || song.types?.[0]
 *   || song.pluginResource?.data?.quality
 *   || '128k'
 * ```
 *
 * 桌面在插件**没指定音质**时优先用这首歌自己声明的档位，最后才落到 `128k`；
 * 移动端此前把 `request.quality` 原样交给 `createDownload`，没给时它回落到
 * 设置里的全局音质（可能是 flac）——一首只提供 320k 的歌会被要求下载 flac，
 * 插件要么报错要么给出意外档位。这与「批量下载自动降级」是同一个问题，
 * 只是入口换成了插件。
 *
 * 判定收在这里（`selectQuality` 由 `batchDownloadQuality` 提供），store 只执行。
 */

import { resolveTrackQuality } from '@/services/batchDownloadQuality'

/** 桌面在拿不到任何线索时的兜底档位。 */
export const HOST_DOWNLOAD_FALLBACK_QUALITY = '128k'

export interface HostDownloadQualityInput {
  /** 插件在请求里给的音质（`request.quality`）。 */
  requested: string | undefined
  /** 这首歌自己声明的档位（SDK 的 `metadata.qualities`）。 */
  trackQualities: readonly string[]
  /** 音源声明的档位顺序（低→高）。 */
  order: readonly string[]
}

export function resolveHostDownloadQuality(input: HostDownloadQualityInput): string {
  const requested = typeof input.requested === 'string' ? input.requested.trim() : ''
  const qualities = [...input.trackQualities]
  if (!qualities.length) {
    // 歌曲没声明档位：插件给什么就用什么（不猜），都没有才落到桌面兜底。
    return requested || HOST_DOWNLOAD_FALLBACK_QUALITY
  }
  const target = requested || qualities[qualities.length - 1]
  // `resolveTrackQuality` 保证不超过目标档位；目标不可用时降级到歌曲自己的最高档。
  return (
    resolveTrackQuality({ qualities }, target, [...input.order]) ||
    qualities[qualities.length - 1]
  )
}
