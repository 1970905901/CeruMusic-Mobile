import { describe, expect, it } from 'vitest'
import { lyricValueToLrc } from './lyrics'

/**
 * 结构化歌词转 LRC 时的时间偏移，对齐桌面 `services/pluginHostServices.ts`：
 *
 * ```ts
 * `${lyricTimestamp(Number(line.startTimeMs) + (Number(lyrics.offsetMs) || 0))}${line.text}`
 * ```
 *
 * `LyricsDocument.offsetMs` 是**整篇歌词的偏移**（LRC 的 `[offset:±ms]` 标签、
 * 以及插件给出的时间轴校正）。移动端解析 LRC 时会把 `[offset:]` 加到每一行
 * （`services/lyrics.ts` 的 `parseLrc`），但**写出**时把 `offsetMs` 丢掉了。
 * 结果是：带偏移的歌词写进本地标签、导出成 LRC、生成分享海报之后，每一行都比
 * 实际演唱时刻差一个固定量——用户在播放页对齐好的歌词，存下来就错位了。
 */

const doc = {
  lines: [
    { startMs: 1000, text: '第一句' },
    { startMs: 61_500, text: '第二句' }
  ],
  offsetMs: 0
}

describe('lyricValueToLrc offsets', () => {
  it('writes the document offset into every timestamp', () => {
    expect(lyricValueToLrc({ ...doc, offsetMs: 500 })).toBe(
      '[00:01.50]第一句\n[01:02.00]第二句'
    )
  })

  it('handles a negative offset and never emits a negative timestamp', () => {
    // 往前偏 2 秒：第一句 1 秒会被夹到 0，不能写出 `[-1:-1.00]`。
    expect(lyricValueToLrc({ ...doc, offsetMs: -2000 })).toBe(
      '[00:00.00]第一句\n[00:59.50]第二句'
    )
  })

  it('treats a missing or non-numeric offset as zero', () => {
    expect(lyricValueToLrc(doc)).toBe('[00:01.00]第一句\n[01:01.50]第二句')
    expect(lyricValueToLrc({ ...doc, offsetMs: undefined })).toBe(
      '[00:01.00]第一句\n[01:01.50]第二句'
    )
    expect(lyricValueToLrc({ ...doc, offsetMs: 'abc' })).toBe(
      '[00:01.00]第一句\n[01:01.50]第二句'
    )
  })

  it('leaves plain text and raw strings untouched', () => {
    // 这两种形态没有结构化时间轴，`offsetMs` 无从施加。
    expect(lyricValueToLrc('纯文本歌词')).toBe('纯文本歌词')
    expect(lyricValueToLrc({ raw: '[00:01.00]原始' })).toBe('[00:01.00]原始')
  })
})
