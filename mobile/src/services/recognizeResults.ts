/**
 * 听歌识曲结果的归一化，对齐桌面版 `views/music/recognize.vue`：
 * 结果项除了歌名 / 歌手 / 封面，还可能带 `startTime`（毫秒），表示这段录音
 * 对应在歌曲里的位置。桌面版会把它显示成「识别片段 03:12」并在播放后跳到该处，
 * 移动端此前直接丢弃了这个字段，只能从歌曲开头播放。
 *
 * 插件返回的结构并不统一（数组 / `items` / `songs`，字段名也有多种），
 * 归一化集中在这里，页面只消费同一份形状。
 */

export interface RecognitionResult {
  title: string
  artist: string
  cover?: string
  /** 识别片段在歌曲中的起点（毫秒）；0 或缺省表示从开头播放。 */
  startTimeMs: number
  raw: Record<string, unknown>
}

const UNKNOWN_TITLE = '未知歌曲'
const UNKNOWN_ARTIST = '未知艺术家'

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    // 部分音源把歌手给成 `['A', 'B']`，直接 String() 会得到 "[object Object]" 或逗号串。
    if (Array.isArray(value)) {
      const names = value.map((entry) => pickString(entry)).filter(Boolean) as string[]
      if (names.length) return names.join(' / ')
    }
    if (value && typeof value === 'object') {
      const nested = pickString((value as Record<string, unknown>).name)
      if (nested) return nested
    }
  }
  return undefined
}

/**
 * 解析片段起点。仅当值明显是毫秒时才当作毫秒：
 * 插件偶尔会给出秒数（如 12.5），小于 1000 且带小数的值按秒处理更符合直觉。
 */
export function parseStartTimeMs(value: unknown): number {
  const raw = typeof value === 'string' ? Number(value) : value
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0
  const ms = raw < 1000 && !Number.isInteger(raw) ? raw * 1000 : raw
  return Math.max(0, Math.round(ms))
}

export function formatStartTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function toList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const record = value as { items?: unknown; songs?: unknown } | null
  if (Array.isArray(record?.items)) return record.items
  if (Array.isArray(record?.songs)) return record.songs
  return []
}

export function normalizeRecognitionResults(value: unknown): RecognitionResult[] {
  return toList(value).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return [
      {
        title: pickString(record.name, record.title, record.songName) ?? UNKNOWN_TITLE,
        artist:
          pickString(record.singer, record.artist, record.subtitle, record.artists) ??
          UNKNOWN_ARTIST,
        cover: pickString(record.img, record.artworkUrl, record.cover, record.pic),
        startTimeMs: parseStartTimeMs(record.startTime ?? record.startTimeMs),
        raw: record
      }
    ]
  })
}
