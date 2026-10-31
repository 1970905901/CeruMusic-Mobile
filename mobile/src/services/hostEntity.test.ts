import { describe, expect, it } from 'vitest'
import { pluginTrackContext, toHostEntity } from './hostEntity'
import type { Track } from '@/types/music'

/**
 * 交给插件的歌曲实体必须符合 SDK 的 `ContentEntity`：`ref`、`title`、
 * `metadata.artists`、`capabilities` 都在。
 *
 * 移动端此前直接把 `track.raw` 送出去。插件搜出来的歌没问题（`raw` 就是它自己
 * 产出的实体），但**本地音乐**的 `raw` 是 `{ local, lrc, year, genre }`、
 * **下载任务**的 `raw` 是 `{ ref: { providerId: 'download' }, title, capabilities: [] }`：
 * 插件读 `entity.ref.kind` 直接 TypeError，读 `metadata.artists` 得到 undefined，
 * 判断「能不能解析 / 有没有歌词」时也完全没有 `capabilities` 可读。
 */

function localTrack(): Track {
  return {
    key: 'local:1',
    ref: { providerId: 'local', kind: 'track', id: 'local:1', scope: 'provider' },
    title: '七里香',
    artists: ['周杰伦'],
    album: '七里香',
    albumId: '9',
    durationMs: 299_000,
    qualities: [],
    playable: true,
    raw: { local: true, lrc: null, year: 2004, genre: 'Pop' },
    localUri: 'file:///song.mp3',
    localPath: '/storage/emulated/0/Music/song.mp3',
    source: 'local'
  }
}

describe('host entity for plugins', () => {
  it('rebuilds a local track whose raw has no ref or metadata', () => {
    const entity = toHostEntity(localTrack())
    expect(entity.ref).toEqual(localTrack().ref)
    expect(entity.title).toBe('七里香')
    expect(entity.metadata.artists).toEqual(['周杰伦'])
    expect(entity.metadata.album).toEqual({ id: '9', title: '七里香' })
    expect(entity.metadata.durationMs).toBe(299_000)
    expect(entity.capabilities).toEqual(['music.resolve@1'])
    expect(entity.playable).toBe(true)
  })

  it('annotates online tracks with the provider capabilities plugins check', () => {
    // 桌面 `toPluginTrack` 始终带 `music.resolve@1` / `music.lyrics@1`；
    // 插件据此判断这首能不能解析、有没有歌词。此前整个字段是缺失的。
    const track: Track = {
      ...localTrack(),
      key: 'test:1',
      ref: { providerId: 'test', kind: 'track', id: '1', scope: 'provider' },
      raw: { ref: { providerId: 'test', kind: 'track', id: '1', scope: 'provider' }, title: 'Song' },
      localUri: undefined,
      localPath: undefined,
      source: 'plugin',
      qualities: ['128k', '320k'],
      qualitySizes: { '320k': 1234 }
    }
    const entity = toHostEntity(track)
    expect(entity.capabilities).toEqual(['music.resolve@1', 'music.lyrics@1'])
    expect(entity.metadata.qualities).toEqual(['128k', '320k'])
    expect(entity.metadata.qualitySizes).toEqual({ '320k': 1234 })
  })

  it('treats downloaded copies as local, not provider tracks', () => {
    const entity = toHostEntity({
      ...localTrack(),
      key: 'test:2',
      ref: { providerId: 'test', kind: 'track', id: '2', scope: 'provider' },
      localUri: undefined,
      downloadedPath: 'file:///downloads/song.mp3',
      source: 'download'
    })
    expect(entity.capabilities).toEqual(['music.resolve@1'])
  })

  it('never leaks host-local paths in an entity', () => {
    // `toHostEntity` 只从结构化字段重建，天然不带 localUri / localPath；
    // 这条测试把「以后有人加字段时别把本机路径塞进去」钉住。
    const entity = toHostEntity(localTrack())
    const serialized = JSON.stringify(entity)
    expect(serialized).not.toContain('file:///')
    expect(serialized).not.toContain('/storage/emulated')
  })
})

describe('plugin track context', () => {
  it('keeps the provider entity for plugin tracks', () => {
    const track: Track = {
      key: 'test:1',
      ref: { providerId: 'test', kind: 'track', id: '1', scope: 'provider' },
      title: 'Song',
      artists: ['Artist'],
      qualities: [],
      playable: true,
      raw: {
        ref: { providerId: 'test', kind: 'track', id: '1', scope: 'provider' },
        title: 'Song',
        localPath: '/private/song.mp3'
      }
    }
    expect(pluginTrackContext(track)).toEqual({
      ref: { providerId: 'test', kind: 'track', id: '1', scope: 'provider' },
      title: 'Song'
    })
  })

  it('falls back to the rebuilt entity when raw has no ref', () => {
    // 本地曲目与下载任务的 `raw` 没有引用：菜单命令此前就拿到一个假实体。
    const entity = pluginTrackContext(localTrack())
    expect(entity.ref).toEqual(localTrack().ref)
    expect(entity.title).toBe('七里香')
    expect(entity.metadata.artists).toEqual(['周杰伦'])
    expect(entity.capabilities).toEqual(['music.resolve@1'])
    expect(JSON.stringify(entity)).not.toContain('/storage/emulated')
  })
})
