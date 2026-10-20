/**
 * 系统媒体控件（SMTC）高清封面协议
 * （桌面版 PlaySettings「系统媒体控件高清封面」/ smtcHiresCover）。
 *
 * 桌面版在推送系统媒体元数据时，按「高清封面协议」向音源插件单独取大图，
 * 插件未实现（provider 方法 `tracks.artworkHires`）或取不到时静默回落原有封面。
 * 移动端沿用同一契约：请求体带上完整歌曲与上游封面地址，返回字符串地址才采用。
 */

import type { Track } from '@/types/music'

/** 期望的大图边长；与桌面版一样只是提示，最终以插件返回的地址为准。 */
export const SMTC_HIRES_TARGET_SIZE = 1024

/** 高清封面是增强而非必需，取图超时后直接回落，不阻塞元数据推送。 */
export const SMTC_HIRES_TIMEOUT_MS = 5000

export interface HiresCoverDeps {
  invokeProvider: (providerId: string, method: string, args: any[]) => Promise<any>
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

/**
 * 用于高清封面转换的上游地址。
 * 与桌面版一致：本地缓存 / blob 地址不能当成上游 URL 传给插件，否则结果错误；
 * 因此优先使用上游 CDN 原始地址，其次才是不属于本地协议的显示地址。
 */
export function hiresSourceArtworkUrl(track: Track | null | undefined): string | undefined {
  if (!track) return undefined
  const upstream = track.raw?.metadata?.artworkUrl
  if (isHttpUrl(upstream)) return upstream
  if (isHttpUrl(track.artworkUrl)) return track.artworkUrl
  return undefined
}

/** 本地歌曲没有在线插件，不参与高清封面转换。 */
export function supportsHiresCover(track: Track | null | undefined): boolean {
  if (!track) return false
  if (track.localUri || track.downloadedPath) return false
  return !!track.ref?.providerId
}

/**
 * 取高清封面地址；关闭开关、本地歌曲、缺少音源或插件未实现时返回 undefined，
 * 任何异常与超时都静默回落。
 */
export async function resolveHiresCover(
  track: Track | null | undefined,
  enabled: boolean,
  deps: HiresCoverDeps
): Promise<string | undefined> {
  if (!enabled || !supportsHiresCover(track) || !track) return undefined
  const providerId = track.ref?.providerId
  if (!providerId) return undefined
  const artworkUrl = hiresSourceArtworkUrl(track)
  try {
    const result = await Promise.race([
      deps.invokeProvider(providerId, 'tracks.artworkHires', [
        track.ref,
        { song: track.raw ?? null, artworkUrl: artworkUrl ?? '', targetSize: SMTC_HIRES_TARGET_SIZE }
      ]),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), SMTC_HIRES_TIMEOUT_MS))
    ])
    return isHttpUrl(result) ? result : undefined
  } catch {
    return undefined
  }
}
