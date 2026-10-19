export interface DownloadFilenameContext {
  title: string
  artist?: string
  album?: string
  quality?: string
  ext: string
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
    ext
  }
  const rendered = source.replace(/\{([a-z]+)\}/gi, (match, key: string) => {
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