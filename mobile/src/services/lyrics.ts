import type { LyricDocument, LyricLine } from '@/types/music'

function parseTime(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const number = Number(trimmed)
    return number < 1000 ? Math.round(number * 1000) : Math.round(number)
  }
  const match = trimmed.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/)
  if (match) {
    const hours = Number(match[1] || 0)
    const minutes = Number(match[2])
    const seconds = Number(match[3])
    const fraction = match[4] ? Number((match[4] + '000').slice(0, 3)) : 0
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction
  }
  return null
}

function cleanText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = []
  const offsetMatch = text.match(/\[offset:([+-]?\d+)\]/i)
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0
  for (const rawLine of text.split(/\r?\n/)) {
    const tags = [...rawLine.matchAll(/\[(\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?)\]/g)]
    if (!tags.length) continue
    const content = rawLine.replace(/\[[^\]]*\]/g, '').trim()
    if (!content) continue
    for (const tag of tags) {
      const startMs = parseTime(tag[1])
      if (startMs === null) continue
      lines.push({ startMs: startMs + offset, text: content })
    }
  }
  lines.sort((a, b) => a.startMs - b.startMs)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i + 1]) lines[i].endMs = lines[i + 1].startMs
  }
  return lines
}

function parseTtml(text: string): LyricLine[] {
  const lines: LyricLine[] = []
  const paragraphPattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi
  let match: RegExpExecArray | null
  while ((match = paragraphPattern.exec(text))) {
    const attrs = match[1]
    const begin = attrs.match(/\bbegin\s*=\s*["']([^"']+)["']/i)?.[1]
    const end = attrs.match(/\bend\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!begin) continue
    const startMs = parseTime(begin)
    if (startMs === null) continue
    const content = cleanText(match[2])
    if (!content) continue
    lines.push({
      startMs,
      endMs: end ? parseTime(end) ?? undefined : undefined,
      text: content
    })
  }
  lines.sort((a, b) => a.startMs - b.startMs)
  return lines
}

function parseCrLyric(document: any): LyricLine[] {
  const lines: LyricLine[] = []
  for (const line of document?.lines ?? []) {
    const startMs = Number(line.startTimeMs)
    if (!Number.isFinite(startMs)) continue
    const text = cleanText(String(line.text ?? line.words?.map((word: any) => word.text).join('') ?? ''))
    if (!text) continue
    lines.push({
      startMs,
      endMs: Number.isFinite(line.endTimeMs) ? Number(line.endTimeMs) : undefined,
      text,
      translation: line.translation || line.translations?.[0]?.text,
      romanization: line.romanization || line.romanizations?.[0]?.text
    })
  }
  return lines.sort((a, b) => a.startMs - b.startMs)
}

export function parseLyrics(value: any): LyricDocument {
  if (!value) return { lines: [], format: 'plain' }
  if (Array.isArray(value.lines)) {
    return { lines: parseCrLyric(value), plainText: value.plainText, format: 'crlyric' }
  }
  const text =
    typeof value === 'string'
      ? value
      : typeof value.raw === 'string'
        ? value.raw
        : typeof value.content === 'string'
          ? value.content
          : typeof value.text === 'string'
            ? value.text
            : ''
  if (!text) return { lines: [], format: 'plain' }
  if (/<tt\b|<p\b/i.test(text)) {
    return { lines: parseTtml(text), format: 'ttml' }
  }
  if (/\[\d{1,2}:\d{1,2}/.test(text)) {
    return { lines: parseLrc(text), format: 'lrc' }
  }
  return {
    lines: [],
    plainText: text.trim(),
    format: 'plain'
  }
}

export function currentLyricIndex(lines: LyricLine[], positionMs: number): number {
  if (!lines.length) return -1
  let low = 0
  let high = lines.length - 1
  let result = -1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (lines[mid].startMs <= positionMs) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}
export function lyricValueToLrc(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value.lines)) {
    return value.lines
      .map((line: any) => {
        const ms = Number(line.startTimeMs ?? line.startMs ?? 0)
        const minutes = Math.floor(ms / 60000)
        const seconds = ((ms % 60000) / 1000).toFixed(2).padStart(5, '0')
        return '[' + String(minutes).padStart(2, '0') + ':' + seconds + ']' + String(line.text || '')
      })
      .join('\n')
  }
  if (typeof value.raw === 'string') return value.raw
  if (typeof value.content === 'string') return value.content
  if (typeof value.text === 'string') return value.text
  return ''
}
