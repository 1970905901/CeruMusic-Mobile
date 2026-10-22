/**
 * 批量下载的音质选择，对齐桌面版 `views/music/list.vue` 的 `handleDownloadBatch`：
 * 先弹一次「选择批量下载音质(自动降级)」，再对**每首歌**按它自己声明的音质
 * 取「不高于目标音质的最高档」。
 *
 * 移动端此前批量下载直接沿用设置里的首选音质，逐首传给 `createDownload`，
 * 结果是一首只支持 320k 的歌被要求下 flac——插件要么报错，要么给出意外档位。
 */
import { selectQuality } from '@shiqianjiang/ceru-plugin-sdk/quality'

export interface BatchQualityCandidate {
  qualities: readonly string[]
}

/**
 * 可选音质：所有选中歌曲声明音质的并集，按**插件清单顺序**（低→高）排列。
 *
 * 桌面版用同一口径（`batchQualityChoices`）。清单顺序不能靠字母序或长度猜，
 * 否则下拉里的高低顺序会反过来。
 */
export function batchQualityChoices(
  tracks: readonly BatchQualityCandidate[],
  order: readonly string[]
): string[] {
  const available = new Set<string>()
  for (const track of tracks) {
    for (const quality of track.qualities) available.add(quality)
  }
  const declared = order.filter((quality) => available.has(quality))
  // 插件没有声明顺序（或返回了清单外的档位）时，按歌曲自己的顺序兜底，
  // 保证下拉不会空着——空列表会让用户以为这些歌都不能下载。
  if (declared.length) return declared
  return [...available]
}

/**
 * 为单首歌解析实际音质：目标档位不可用时降级到它支持的最高档。
 *
 * 返回 `undefined` 表示不做指定，由 `createDownload` 走默认逻辑——
 * 歌曲没有声明任何音质时不该硬塞一个猜的值。
 */
export function resolveTrackQuality(
  track: BatchQualityCandidate,
  target: string,
  order: readonly string[]
): string | undefined {
  if (!track.qualities.length) return undefined
  const list = [...track.qualities]
  // order 必须包含目标音质，否则比较不出「不高于目标」：SDK 在 order 缺失
  // 目标时会直接返回最高档，等于把 320k 的请求升级成 flac。
  const orderWithTarget = order.includes(target) ? order : [...order, target]
  const picked = selectQuality(orderWithTarget, list, target)
  // 歌曲声明的档位全在清单外时，退而取它自己的最高档——总比什么都不指定好。
  return picked ?? list[list.length - 1]
}
