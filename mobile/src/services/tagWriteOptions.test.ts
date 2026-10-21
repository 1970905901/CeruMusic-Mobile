import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TAG_WRITE_OPTIONS,
  describeTagWriteOptions,
  embedsAnyTag,
  needsLyrics,
  normalizeTagWriteOptions,
  serializeTagLyrics,
  tagLyricExtension
} from './tagWriteOptions'
import type { LyricDocument } from '@/types/music'

const document: LyricDocument = {
  format: 'lrc',
  lines: [
    { startMs: 0, endMs: 15400, text: '今天我', translation: 'Today I' },
    { startMs: 15400, text: '寒夜里看雪飘过', romanization: 'han ye li kan xue piao guo' }
  ]
}

describe('tag write options normalising', () => {
  it('turns the legacy boolean switch into basic-info only', () => {
    // 旧版只有一个 downloadWriteTags 开关，只写标题/艺术家/专辑。
    const options = normalizeTagWriteOptions(undefined, true)
    expect(options).toEqual({ ...DEFAULT_TAG_WRITE_OPTIONS, basicInfo: true })
  })

  it('defaults every option to off so upgrades never write tags silently', () => {
    expect(normalizeTagWriteOptions(undefined, undefined)).toEqual(DEFAULT_TAG_WRITE_OPTIONS)
    expect(embedsAnyTag(DEFAULT_TAG_WRITE_OPTIONS)).toBe(false)
  })

  it('rejects non-boolean and unknown format values instead of trusting them', () => {
    const options = normalizeTagWriteOptions({
      basicInfo: 'yes',
      cover: 1,
      lyrics: true,
      downloadLyrics: null,
      lyricFormat: 'qrc'
    })
    expect(options).toEqual({
      basicInfo: false,
      cover: false,
      lyrics: true,
      downloadLyrics: false,
      lyricFormat: 'lrc'
    })
  })

  it('keeps a supported lyric format', () => {
    expect(normalizeTagWriteOptions({ lyricFormat: 'ttml' }).lyricFormat).toBe('ttml')
  })
})

describe('tag write intent', () => {
  it('treats a sidecar lyric file as needing lyrics even when embedding is off', () => {
    const options = { ...DEFAULT_TAG_WRITE_OPTIONS, downloadLyrics: true }
    expect(needsLyrics(options)).toBe(true)
    expect(embedsAnyTag(options)).toBe(false)
  })

  it('names the sidecar extension after the export format', () => {
    expect(tagLyricExtension({ ...DEFAULT_TAG_WRITE_OPTIONS, lyricFormat: 'ttml' })).toBe('ttml')
    expect(tagLyricExtension({ ...DEFAULT_TAG_WRITE_OPTIONS, lyricFormat: 'lrc' })).toBe('lrc')
  })

  it('reports what will actually be written', () => {
    expect(describeTagWriteOptions(DEFAULT_TAG_WRITE_OPTIONS)).toBe('未写入任何标签')
    expect(
      describeTagWriteOptions({ ...DEFAULT_TAG_WRITE_OPTIONS, basicInfo: true, cover: true })
    ).toBe('基础信息、封面')
  })
})

describe('tag lyric serialisation', () => {
  it('writes line-level LRC timestamps', () => {
    const text = serializeTagLyrics(document, 'lrc')
    expect(text.split('\n')).toEqual(['[00:00.00]今天我', '[00:15.40]寒夜里看雪飘过'])
  })

  it('drops translation and romanization in LRC, which cannot carry them', () => {
    expect(serializeTagLyrics(document, 'lrc')).not.toContain('Today I')
  })

  it('keeps translation and romanization in TTML', () => {
    const text = serializeTagLyrics(document, 'ttml')
    expect(text).toContain('<span ttm:role="x-translation">Today I</span>')
    expect(text).toContain('<span ttm:role="x-romanization">han ye li kan xue piao guo</span>')
    expect(text).toContain('begin="00:00:00.00"')
  })

  it('falls back to the next line when a line has no end time', () => {
    const text = serializeTagLyrics(document, 'ttml')
    expect(text).toContain('begin="00:00:00.00" end="00:00:15.40"')
  })

  it('produces nothing when there is no timed lyric to write', () => {
    // 空内容绝不能变成空文件或空标签。
    expect(serializeTagLyrics({ lines: [], format: 'plain' }, 'lrc')).toBe('')
    expect(serializeTagLyrics(null, 'ttml')).toBe('')
    expect(
      serializeTagLyrics({ lines: [{ startMs: 0, text: '   ' }], format: 'lrc' }, 'lrc')
    ).toBe('')
  })

  it('escapes TTML markup so lyric text cannot break the document', () => {
    const text = serializeTagLyrics(
      { lines: [{ startMs: 0, text: 'a <b> & "c"' }], format: 'lrc' },
      'ttml'
    )
    expect(text).toContain('a &lt;b&gt; &amp; &quot;c&quot;')
    expect(text).not.toContain('<b>')
  })
})
