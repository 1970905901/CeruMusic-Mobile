import { describe, expect, it } from 'vitest'
import { localTagsPayload } from './localTagsPayload'

/**
 * `localMusic.getTags` 只承诺「读取标签」。移动端此前把内部 `LocalTrackRecord`
 * 原样返回，连带 `path` / `relativePath`（设备上的真实路径）一起交给插件——
 * 插件拿到路径就能绕过 `files.*` 的句柄体系直接读写文件。
 */
describe('local music tag payload', () => {
  it('keeps the musical metadata plugins actually need', () => {
    const payload = localTagsPayload({
      key: 'local:1',
      title: '七里香',
      artist: '周杰伦',
      album: '七里香',
      year: 2004,
      genre: 'Pop',
      durationMs: 299_000,
      fileName: 'song.mp3',
      mime: 'audio/mpeg',
      size: 12_345,
      lyrics: '[00:00.00]...',
      cover: 'data:image/png;base64,x'
    })
    expect(payload).toMatchObject({
      title: '七里香',
      artist: '周杰伦',
      album: '七里香',
      year: 2004,
      durationMs: 299_000,
      fileName: 'song.mp3'
    })
  })

  it('never leaks the device path or internal key', () => {
    const record = {
      key: 'local:1',
      title: 'Song',
      fileName: 'song.mp3',
      path: '/storage/emulated/0/Music/song.mp3',
      relativePath: 'music/song.mp3',
      sourcePath: '/sdcard/song.mp3',
      createdAt: 1
    }
    const payload = localTagsPayload(record)
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('/storage/emulated')
    expect(serialized).not.toContain('sdcard')
    expect(serialized).not.toContain('relativePath')
    expect(serialized).not.toContain('createdAt')
    expect(serialized).not.toContain('local:1')
  })

  it('returns an empty object for a missing record', () => {
    // 契约是 JsonObject；返回 null 会让插件解构时抛错。
    expect(localTagsPayload(null)).toEqual({})
    expect(localTagsPayload(undefined)).toEqual({})
  })

  it('drops nullish fields instead of emitting null values', () => {
    const payload = localTagsPayload({ title: 'Song', album: null, year: undefined })
    expect(payload).toEqual({ title: 'Song' })
  })
})
