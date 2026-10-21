import type { LyricDocument, LyricLine } from '@/types/music'
import { formatLyricTimestamp } from './lyricShare'

/**
 * 下载标签写入选项，对齐桌面版 `TagWriteOptions`（`renderer/store/Settings.ts`）。
 *
 * 差异说明：桌面版借助 AMLL 内置导出器支持 9 种歌词格式；移动端没有打包 AMLL，
 * 只有插件转换器能产出其它格式，而下载流程是非交互的，因此这里只提供移动端
 * 能自己忠实生成的两种：逐行 LRC 与保留翻译/音译的 TTML。
 */
export const TAG_LYRIC_FORMATS = ['lrc', 'ttml'] as const
export type TagLyricFormat = (typeof TAG_LYRIC_FORMATS)[number]

export interface TagWriteOptions {
  /** 标题、艺术家、专辑 */
  basicInfo: boolean
  /** 把封面嵌入音频文件 */
  cover: boolean
  /** 把歌词写入音频文件元信息 */
  lyrics: boolean
  /** 在音频文件旁单独保存同名歌词文件 */
  downloadLyrics: boolean
  lyricFormat: TagLyricFormat
}

export const TAG_LYRIC_FORMAT_LABELS: Record<TagLyricFormat, string> = {
  lrc: '标准 LRC（逐行）',
  ttml: 'TTML（保留翻译与音译）'
}

/**
 * 默认全部关闭，与移动端此前的 `downloadWriteTags: false` 保持一致，
 * 避免升级后给既有用户静默写入标签。
 */
export const DEFAULT_TAG_WRITE_OPTIONS: TagWriteOptions = {
  basicInfo: false,
  cover: false,
  lyrics: false,
  downloadLyrics: false,
  lyricFormat: 'lrc'
}

function isTagLyricFormat(value: unknown): value is TagLyricFormat {
  return TAG_LYRIC_FORMATS.includes(value as TagLyricFormat)
}

/**
 * 归一化任意来源的标签选项（本地存储、云同步、旧版布尔开关）。
 * `legacyWriteTags` 是被本模块取代的 `downloadWriteTags`，它只写基础信息。
 */
export function normalizeTagWriteOptions(
  raw: unknown,
  legacyWriteTags?: unknown
): TagWriteOptions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_TAG_WRITE_OPTIONS, basicInfo: legacyWriteTags === true }
  }
  const source = raw as Record<string, unknown>
  return {
    basicInfo: source.basicInfo === true,
    cover: source.cover === true,
    lyrics: source.lyrics === true,
    downloadLyrics: source.downloadLyrics === true,
    lyricFormat: isTagLyricFormat(source.lyricFormat) ? source.lyricFormat : 'lrc'
  }
}

/** 是否有任何内容需要嵌入音频文件。 */
export function embedsAnyTag(options: TagWriteOptions): boolean {
  return options.basicInfo || options.cover || options.lyrics
}

/** 是否需要获取歌词（内嵌或外置都算）。 */
export function needsLyrics(options: TagWriteOptions): boolean {
  return options.lyrics || options.downloadLyrics
}

/** 外置歌词文件的后缀，与导出格式一致。 */
export function tagLyricExtension(options: TagWriteOptions): string {
  return options.lyricFormat
}

export function describeTagWriteOptions(options: TagWriteOptions): string {
  const enabled: string[] = []
  if (options.basicInfo) enabled.push('基础信息')
  if (options.cover) enabled.push('封面')
  if (options.lyrics) enabled.push('歌词')
  if (options.downloadLyrics) enabled.push('单独下载歌词')
  return enabled.length ? enabled.join('、') : '未写入任何标签'
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

/** LRC 只保留逐行时间轴，与桌面版 `stringifyLrc` 口径一致。 */
function buildLrc(lines: LyricLine[]): string {
  return lines
    .map((line) => `${formatLyricTimestamp(line.startMs)}${line.text.trim()}`)
    .join('\n')
}

/** 逐行时间戳按 TTML 的 hh:mm:ss.ff 计时，含厘秒。 */
function ttmlTime(ms: number): string {
  const total = Math.max(0, Math.round(Number(ms) || 0))
  const centis = Math.floor(total / 10) % 100
  const seconds = Math.floor(total / 1000)
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}.${pad(centis)}`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function ttmlAlternative(role: string, value: string): string {
  return `<span ttm:role="${role}">${escapeXml(value)}</span>`
}

function resolveEnd(line: LyricLine, next?: LyricLine): number | undefined {
  if (Number.isFinite(line.endMs) && (line.endMs as number) > line.startMs) return line.endMs
  if (next && next.startMs > line.startMs) return next.startMs
  return undefined
}

function buildTtml(lines: LyricLine[]): string {
  const paragraphs = lines.map((line, index) => {
    const end = resolveEnd(line, lines[index + 1])
    const attrs = [`begin="${ttmlTime(line.startMs)}"`, end ? `end="${ttmlTime(end)}"` : '']
      .filter(Boolean)
      .join(' ')
    const spans = [
      line.translation?.trim() ? ttmlAlternative('x-translation', line.translation.trim()) : '',
      line.romanization?.trim() ? ttmlAlternative('x-romanization', line.romanization.trim()) : ''
    ].join('')
    return `      <p ${attrs}>${escapeXml(line.text.trim())}${spans}</p>`
  })
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">',
    '  <body>',
    '    <div>',
    ...paragraphs,
    '    </div>',
    '  </body>',
    '</tt>'
  ].join('\n')
}

/**
 * 把解析后的歌词序列化为标签/外置文件文本。
 * 与桌面版 `exportBuiltinLyrics` 一样，没有带时间的歌词时不产出内容（不要写出空文件）。
 */
export function serializeTagLyrics(document: LyricDocument | null, format: TagLyricFormat): string {
  const lines = (document?.lines ?? []).filter((line) => line.text?.trim())
  if (!lines.length) return ''
  return format === 'ttml' ? buildTtml(lines) : buildLrc(lines)
}
