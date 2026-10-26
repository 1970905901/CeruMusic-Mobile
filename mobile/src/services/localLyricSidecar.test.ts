import { describe, expect, it } from 'vitest'
import {
  baseName,
  decodeLyricText,
  pickSidecarLyric,
  preferLyrics,
  sidecarLyricExtension
} from './localLyricSidecar'

describe('sidecar lyric extension', () => {
  it('accepts only the formats the mobile parser understands', () => {
    expect(sidecarLyricExtension('a.lrc')).toBe('lrc')
    expect(sidecarLyricExtension('a.TTML')).toBe('ttml')
    // qrc/krc 需要插件转换器；读进来只会解析成空文档。
    expect(sidecarLyricExtension('a.qrc')).toBe(null)
    expect(sidecarLyricExtension('a.txt')).toBe(null)
    expect(sidecarLyricExtension('noext')).toBe(null)
    expect(sidecarLyricExtension('.lrc')).toBe(null)
  })
})

describe('base name', () => {
  it('strips directories and the extension', () => {
    expect(baseName('Music/Album/01 歌名.mp3')).toBe('01 歌名')
    expect(baseName('C:\\Music\\song.flac')).toBe('song')
    expect(baseName('noext')).toBe('noext')
  })
})

describe('picking a sidecar lyric', () => {
  it('matches the audio base name in the same folder listing', () => {
    const candidates = ['01.mp3', '01.lrc', '02.lrc', 'cover.jpg']
    expect(pickSidecarLyric('01.mp3', candidates)).toBe('01.lrc')
  })

  it('ignores case differences in the base name', () => {
    expect(pickSidecarLyric('Song.mp3', ['SONG.LRC'])).toBe('SONG.LRC')
  })

  it('does not match a lyric whose base name only shares a prefix', () => {
    // 01.lrc 属于 01.mp3，不属于 010.mp3——前缀相同不等于同名。
    expect(pickSidecarLyric('010.mp3', ['01.lrc'])).toBe(null)
  })

  it('prefers LRC when both LRC and TTML exist', () => {
    expect(pickSidecarLyric('song.mp3', ['song.ttml', 'song.lrc'])).toBe('song.lrc')
  })

  it('returns null when the folder has no lyric for this audio', () => {
    expect(pickSidecarLyric('song.mp3', ['other.lrc', 'song.jpg'])).toBe(null)
    expect(pickSidecarLyric('song.mp3', [])).toBe(null)
  })
})

describe('decoding Filesystem.readFile output', () => {
  it('keeps plain text as-is (web platform)', () => {
    expect(decodeLyricText('[00:01.00]第一句\n[00:05.00]第二句')).toBe(
      '[00:01.00]第一句\n[00:05.00]第二句'
    )
  })

  it('decodes base64 into UTF-8 text (native platforms)', () => {
    // 原生端 readFile 默认返回 base64；直接当文本用会把整份歌词显示成乱码。
    const original = '[00:01.00]中文歌词\n[00:05.00]second line'
    const bytes = new TextEncoder().encode(original)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    expect(decodeLyricText(btoa(binary))).toBe(original)
  })

  it('treats text containing brackets as plain text, not base64', () => {
    expect(decodeLyricText('[ti:歌名]')).toBe('[ti:歌名]')
  })
})

describe('embedded beats sidecar', () => {
  it('keeps the embedded lyric when it has content', () => {
    // 桌面版同序：内嵌标签优先，缺失时才读同目录文件。
    expect(preferLyrics('[00:01]词', '[00:02]文件')).toBe('[00:01]词')
  })

  it('falls back to the sidecar when the embedded lyric is blank', () => {
    expect(preferLyrics('   ', '[00:02]文件')).toBe('[00:02]文件')
    expect(preferLyrics(undefined, '[00:02]文件')).toBe('[00:02]文件')
  })

  it('returns undefined when neither source has content', () => {
    expect(preferLyrics('', null)).toBeUndefined()
    expect(preferLyrics(undefined, '  ')).toBeUndefined()
  })
})
