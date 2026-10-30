/**
 * 字节体积的统一格式化。
 *
 * 「KB / MB / GB」这套换算此前在四处各写了一份：
 * - `services/cacheQuality.ts` 的 `formatCacheBytes`（缓存占用，带 GB 档）
 * - `views/SettingsPage.vue` 的 `formatCacheSize`（与上面逐字相同）
 * - `views/DownloadsPage.vue` 的 `formatSize`（带 GB 档，但 0 的处理不同）
 * - `services/cloudSongList.ts` 的 `formatSize`（**没有 GB 档**）
 *
 * 最后一份最要命：云端歌单的音质大小由 `qualitySizes` 换算而来，一首无损
 * 或高清臻音的字节数超过 1 GB 时会被写成「1536.0 MB」，与下载页、缓存页
 * 对同一个数字给出的「1.50 GB」不是同一种写法。
 *
 * 这里收敛成唯一实现：负数与非数字按 0 处理（展示端不该出现 `NaN B`），
 * 单位按 1024 进制，KB/MB 保留一位小数、GB 保留两位（与桌面端缓存页一致）。
 */

/** 1024 进制，最多到 GB。`null`/`undefined`/负数一律按 0 显示。 */
export function formatBytes(bytes: number | null | undefined): string {
  const value = Math.max(0, Number(bytes) || 0)
  if (value < 1024) return `${Math.round(value)} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}
