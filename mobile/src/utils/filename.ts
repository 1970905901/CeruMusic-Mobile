export interface DownloadFilenameContext {
  title: string
  artist?: string
  album?: string
  quality?: string
  /** 平台/音源名，对应桌面版 `%u`。 */
  platform?: string
  /** 覆盖日期占位符，默认取当天。 */
  date?: Date
  ext: string
}

/** 桌面版 `%t/%s/%a/%u/%d/%q` 与移动端 `{title}` 两种写法都接受。 */
const PERCENT_TOKENS: Record<string, keyof DownloadFilenameContext> = {
  '%t': 'title',
  '%s': 'artist',
  '%a': 'album',
  '%u': 'platform',
  '%d': 'date',
  '%q': 'quality'
}

function formatDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const RESERVED = /[\\/:*?"<>|\u0000-\u001f]/g

export function sanitizeFilenamePart(value: unknown, fallback = '未知'): string {
  const text = String(value ?? '')
    .replace(RESERVED, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 160)
    .trim()
  return text || fallback
}

export function renderFilenameTemplate(template: string | undefined, context: DownloadFilenameContext): string {
  const source = (template || '{artist} - {title}').trim() || '{artist} - {title}'
  const ext = sanitizeFilenamePart(context.ext || 'mp3', 'mp3').toLowerCase()
  const values: Record<string, string> = {
    title: sanitizeFilenamePart(context.title, '未知歌曲'),
    artist: sanitizeFilenamePart(context.artist, '未知艺术家'),
    album: sanitizeFilenamePart(context.album, '未知专辑'),
    quality: sanitizeFilenamePart(context.quality, '自动'),
    // 平台缺失时桌面版会保留原样占位符；这里给一个可读兜底而不是留 "%u"。
    platform: sanitizeFilenamePart(context.platform, '未知平台'),
    date: formatDate(context.date ?? new Date()),
    ext
  }
  // 先处理桌面版的 %x 写法，再处理移动原有的 {name} 写法。
  const withPercent = source.replace(/%[tsaudq]/g, (match) => {
    const key = PERCENT_TOKENS[match]
    return key ? values[key as string] ?? match : match
  })
  const rendered = withPercent.replace(/\{([a-z]+)\}/gi, (match, key: string) => {
    const value = values[key.toLowerCase()]
    return value === undefined ? match : value
  })
  return sanitizeFilenamePart(rendered, values.title)
}

export function buildDownloadFilename(
  template: string | undefined,
  context: DownloadFilenameContext
): string {
  const ext = sanitizeFilenamePart(context.ext || 'mp3', 'mp3').toLowerCase()
  let base = renderFilenameTemplate(template, context)
  if (base.toLowerCase().endsWith('.' + ext)) base = base.slice(0, -(ext.length + 1))
  return `${sanitizeFilenamePart(base, '未知歌曲')}.${ext}`
}