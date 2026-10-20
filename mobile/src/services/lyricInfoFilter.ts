import type { LyricDocument, LyricLine } from '@/types/music'

const LYRIC_INFO_KEYS = [
  '作曲',
  '作词',
  '编曲',
  '制作人',
  '专辑',
  '时间',
  '时长',
  '发行',
  'OP',
  'SP',
  '词',
  '曲',
  '吉他',
  '贝斯',
  '录音',
  '混音',
  '出品',
  '演唱',
  '和声',
  '弦乐',
  '企划',
  '录音室',
  '鼓',
  '弦乐部分'
]

const INFO_PATTERN = new RegExp(
  `(?:${LYRIC_INFO_KEYS.map((key) => key.split('').join('.*')).join('|')})[^\\n]*[:：]`,
  'i'
)

const TIMING_TOKEN = /\(\s*-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?\s*\)/g
const ANGLE_TIMING_TOKEN = /<\s*-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?\s*>/g
const BRACKET_TIMING_TOKEN = /^\s*\[\d+\s*,\s*\d+\]\s*/
const BARE_TIMING_TOKEN = /^\s*-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?\s*$/

/** Legacy plugins occasionally leak QRC/YRC timing tokens into sidecar text. */
export function sanitizeLyricText(value: unknown): string {
  return String(value ?? '')
    .replace(TIMING_TOKEN, '')
    .replace(ANGLE_TIMING_TOKEN, '')
    .replace(BRACKET_TIMING_TOKEN, '')
    .replace(BARE_TIMING_TOKEN, '')
    .trim()
}

/** Every visible field, mirroring the desktop credit filter input. */
export function lyricLineText(line: LyricLine): string {
  return [line?.text, line?.translation, line?.romanization]
    .filter((value): value is string => typeof value === 'string' && !!value.trim())
    .join(' ')
}

export function isLyricInfoLine(text: string, strict = false): boolean {
  const withoutTimestamp = text.replace(/\[[^\]]*\]/g, '').trim()
  if (strict) return withoutTimestamp.includes(':') || withoutTimestamp.includes('：')
  return INFO_PATTERN.test(text)
}

/**
 * Applies the desktop 1.14.1 lyric-credit filter to parsed lyric lines.
 * Timings, translations and romanization of the surviving lines are preserved.
 */
export function filterLyricLines(lines: LyricLine[], strict = false): LyricLine[] {
  if (!Array.isArray(lines) || !lines.length) return lines
  return lines.filter((line) => !isLyricInfoLine(lyricLineText(line), strict))
}

export function filterLyricDocument(
  document: LyricDocument,
  options: { filterInfo?: boolean; strict?: boolean } = {}
): LyricDocument {
  if (!document || !options.filterInfo) return document
  const strict = !!options.strict
  const lines = filterLyricLines(document.lines, strict)
  const plainText =
    typeof document.plainText === 'string' && document.plainText.trim()
      ? document.plainText
          .split(/\r?\n/)
          .filter((line) => !isLyricInfoLine(line, strict))
          .join('\n')
          .trim()
      : document.plainText
  if (lines.length === document.lines.length && plainText === document.plainText) return document
  return { ...document, lines, plainText }
}
