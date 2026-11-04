import { beforeEach, describe, expect, it, vi } from 'vitest'

// 导入路径会把音频写进 Filesystem；happy-dom 没有对应的原生实现，用内存替身。
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: vi.fn(async () => ({ uri: 'file:///x' })),
    readFile: vi.fn(async () => ({ data: '' })),
    getUri: vi.fn(async () => ({ uri: 'file:///x' })),
    stat: vi.fn(async () => ({ size: 0 })),
    deleteFile: vi.fn(async () => undefined)
  }
}))

vi.mock('@/services/db', () => ({
  toPlain: (value: any) => JSON.parse(JSON.stringify(value)),
  getDb: vi.fn(async () => ({
    getAll: vi.fn(async () => []),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => undefined),
    transaction: vi.fn(() => ({ store: { put: vi.fn() }, done: Promise.resolve() }))
  }))
}))

import { createPinia, setActivePinia } from 'pinia'
import {
  baseName,
  decodeLyricText,
  pickEmbeddedLyric,
  pickSidecarLyric,
  preferLyrics,
  sidecarLyricExtension
} from './localLyricSidecar'
import { useLibraryStore } from '@/stores/library'

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
    expect(pickSidecarLyric('01.mp3', ['01 - 伴奏.lrc'])).toBeNull()
  })
})

describe('decoding lyric text', () => {
  it('keeps plain text untouched', () => {
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
})

describe('preferring the embedded lyric', () => {
  it('keeps the embedded lyric ahead of the sidecar file', () => {
    expect(preferLyrics('[00:01]内嵌', '[00:01]外置')).toBe('[00:01]内嵌')
    expect(preferLyrics('', '[00:01]外置')).toBe('[00:01]外置')
    expect(preferLyrics(undefined, undefined)).toBeUndefined()
  })
})

/**
 * 内嵌歌词，对齐桌面 `main/services/localLyrics.ts` 的 `resolveLocalLyrics`：
 * 先读音频标签里的歌词（ID3 USLT、Vorbis `LYRICS`、MP4 `©lyr`），读不到才找
 * 同目录的 `.lrc` / `.ttml`。
 */
describe('pickEmbeddedLyric', () => {
  it('reads the tag form music-metadata actually returns', () => {
    // `common.lyrics` 是字符串数组（可能有多条 USLT）。
    expect(pickEmbeddedLyric(['[00:01.00]第一句'])).toBe('[00:01.00]第一句')
  })

  it('takes the first non-empty entry when a file carries several', () => {
    expect(pickEmbeddedLyric(['', '   ', '[00:01.00]第二语言'])).toBe('[00:01.00]第二语言')
  })

  it('accepts a bare string for parsers that return one', () => {
    expect(pickEmbeddedLyric('[00:01.00]单条')).toBe('[00:01.00]单条')
  })

  it('returns undefined when there is no lyric, so the sidecar can take over', () => {
    expect(pickEmbeddedLyric(undefined)).toBeUndefined()
    expect(pickEmbeddedLyric([])).toBeUndefined()
    expect(pickEmbeddedLyric('   ')).toBeUndefined()
    expect(pickEmbeddedLyric(null)).toBeUndefined()
    // 只写了一个空标签的音频不该挡住同名 .lrc。
    expect(pickEmbeddedLyric([''])).toBeUndefined()
  })

  it('drops entries that are not text instead of stringifying objects', () => {
    // 结构化歌词标签（部分容器）不能被 `String()` 变成 `[object Object]` 存进歌单。
    expect(pickEmbeddedLyric([{ text: 'x' }, '[00:01.00]正常'])).toBe('[00:01.00]正常')
  })
})

describe('embedded lyric reaches the imported track', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('stores the embedded lyric when the audio file carries one', async () => {
    // 导入路径此前只读同目录歌词文件：带内嵌歌词、没有 .lrc 的音轨导进来就没有歌词。
    const library = useLibraryStore()
    const file = new File([new Uint8Array([1, 2, 3])], 'song.mp3', { type: 'audio/mpeg' })
    const record = await library.importLocalFile(file, {
      preParsed: { title: '歌名', lyrics: '[00:01.00]内嵌歌词' }
    })
    expect(record?.lyrics).toBe('[00:01.00]内嵌歌词')
  })
})
