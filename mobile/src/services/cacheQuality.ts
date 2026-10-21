import { getQualityDisplayName } from '@/services/qualityNames'

/**
 * 缓存音质占比（桌面端 `Settings/MusicCache.vue` 环形图的移动端等价实现）。
 *
 * 桌面端由后端返回 `qualityBreakdown`；移动端缓存索引本来就按条目存了
 * `quality` 与 `sizeBytes`，这里直接本地聚合，规则仍然是「按音质从低到高排序、
 * 占比相对音频总量、未知音质用中性灰」。
 */

export interface CacheQualityEntry {
  quality?: string
  sizeBytes?: number
}

export interface CacheQualitySegment {
  quality: string
  label: string
  count: number
  size: number
  /** 0–100，相对全部音频缓存体积 */
  percent: number
  color: string
  sizeFormatted: string
}

export interface CacheQualityBreakdown {
  segments: CacheQualitySegment[]
  audioBytes: number
  audioFormatted: string
}

/** 低音质偏浅、高音质偏深；同一音质每次进来颜色一致，便于记忆。 */
export const CACHE_QUALITY_COLORS = ['#93b8f5', '#0052d9', '#366ef4', '#2447a8', '#182f7a']
/** 未知音质用中性灰，避免与已知音质抢视觉焦点 */
export const CACHE_UNKNOWN_COLOR = '#b8bcc4'

export function formatCacheBytes(bytes: number): string {
  const value = Math.max(0, Number(bytes) || 0)
  if (value < 1024) return `${Math.round(value)} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * 音质排序权重：优先用插件声明的顺序（由低到高），
 * 未声明的音质排在后面并保持首次出现顺序；空值与「未知」固定垫底。
 */
function qualityRank(quality: string, known: readonly string[]): number {
  if (!quality || quality === '未知') return Number.MAX_SAFE_INTEGER
  const index = known.findIndex((item) => item.toLowerCase() === quality.toLowerCase())
  return index < 0 ? known.length : index
}

export function summarizeCacheQualities(
  entries: readonly CacheQualityEntry[],
  qualityOrder: readonly string[] = []
): CacheQualityBreakdown {
  const buckets = new Map<string, { count: number; size: number }>()
  let audioBytes = 0
  for (const entry of entries ?? []) {
    const size = Math.max(0, Number(entry?.sizeBytes) || 0)
    if (size <= 0) continue
    const quality = String(entry?.quality ?? '').trim() || '未知'
    const bucket = buckets.get(quality) ?? { count: 0, size: 0 }
    bucket.count += 1
    bucket.size += size
    buckets.set(quality, bucket)
    audioBytes += size
  }

  const ordered = [...buckets.entries()]
    .map(([quality, bucket]) => ({ quality, ...bucket }))
    .sort((left, right) => {
      const delta = qualityRank(left.quality, qualityOrder) - qualityRank(right.quality, qualityOrder)
      return delta !== 0 ? delta : right.size - left.size
    })

  const segments = ordered.map((item, index) => ({
    quality: item.quality,
    label: item.quality === '未知' ? '未知' : getQualityDisplayName(item.quality) || item.quality,
    count: item.count,
    size: item.size,
    percent: audioBytes > 0 ? Math.max(0, Math.min(100, (item.size / audioBytes) * 100)) : 0,
    color: item.quality === '未知' ? CACHE_UNKNOWN_COLOR : CACHE_QUALITY_COLORS[index % CACHE_QUALITY_COLORS.length],
    sizeFormatted: formatCacheBytes(item.size)
  }))

  return {
    segments,
    audioBytes,
    audioFormatted: formatCacheBytes(audioBytes)
  }
}

/**
 * 把分段列表转成 SVG 环形图的 stroke-dasharray 片段。
 * 半径固定 50（viewBox 120×120），周长即 2πr；用 stroke-dashoffset 依次错开。
 */
export interface CacheDonutArc {
  color: string
  dashArray: string
  dashOffset: number
}

export function buildDonutArcs(
  segments: readonly { color: string; percent: number }[],
  radius = 50
): CacheDonutArc[] {
  const circumference = 2 * Math.PI * Math.max(1, radius)
  let consumed = 0
  return segments.map((segment) => {
    const percent = Math.max(0, Math.min(100, Number(segment.percent) || 0))
    const length = (percent / 100) * circumference
    const arc: CacheDonutArc = {
      color: segment.color,
      dashArray: `${length} ${Math.max(0, circumference - length)}`,
      dashOffset: -consumed
    }
    consumed += length
    return arc
  })
}
