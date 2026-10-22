import { describe, expect, it } from 'vitest'
import {
  attachmentCover,
  attachmentSubtitle,
  attachmentTitle,
  buildPlaylistAttachment,
  playlistShareable
} from './postAttachment'
import type { Track } from '@/types/music'

function track(id: string, extra: Partial<Track> = {}): Track {
  return {
    key: `wy:${id}`,
    pluginKey: 'wy-plugin',
    ref: { providerId: 'wy', kind: 'track', id, scope: 'provider' } as Track['ref'],
    title: `歌 ${id}`,
    artists: ['歌手'],
    qualities: ['320k'],
    playable: true,
    raw: {},
    ...extra
  }
}

const playlist = { id: 'p1', name: '我的歌单', cover: 'cover.jpg', cloudId: 'cloud-1' }

describe('playlist shareability', () => {
  it('keeps only online tracks', () => {
    // 本地文件与已下载副本只存在于本机，分享出去会变成坏引用。
    const result = playlistShareable([
      track('1'),
      track('2', { localUri: 'file:///a.mp3' }),
      track('3', { downloadedPath: 'file:///b.mp3' })
    ])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.songs.map((song) => song.songmid)).toEqual(['1'])
  })

  it('refuses a playlist with nothing shareable instead of sending an empty card', () => {
    const result = playlistShareable([track('2', { localUri: 'file:///a.mp3' })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('没有可分享的在线歌曲')
  })
})

describe('playlist attachment', () => {
  it('builds a preview of at most three songs and counts all shareable ones', () => {
    const tracks = ['1', '2', '3', '4', '5'].map((id) => track(id))
    const attachment = buildPlaylistAttachment(playlist, tracks)
    expect(attachment.type).toBe('playlist')
    expect(attachment.listId).toBe('cloud-1')
    expect(attachment.preview).toHaveLength(3)
    expect(attachment.songCount).toBe(5)
  })

  it('falls back to the first preview cover when the playlist has none', () => {
    const tracks = [track('1', { artworkUrl: 'art.jpg' })]
    const attachment = buildPlaylistAttachment({ ...playlist, cover: undefined }, tracks)
    expect(attachment.cover).toBe('art.jpg')
  })

  it('refuses a playlist that was never synced to the cloud', () => {
    // 没有云端 ID 时服务端解析不了歌单，发出去就是一张点不开的卡片。
    expect(() =>
      buildPlaylistAttachment({ ...playlist, cloudId: undefined }, [track('1')])
    ).toThrow('还没有同步到云端')
  })

  it('refuses an empty playlist', () => {
    expect(() => buildPlaylistAttachment(playlist, [])).toThrow('没有可分享的在线歌曲')
  })
})

describe('attachment display', () => {
  it('titles and subtitles differ by attachment type', () => {
    const song = { type: 'song' as const, song: { name: '晴天', singer: '周杰伦' } }
    expect(attachmentTitle(song)).toBe('晴天')
    expect(attachmentSubtitle(song)).toBe('周杰伦')

    const list = { type: 'playlist' as const, name: '精选', songCount: 12 }
    expect(attachmentTitle(list)).toBe('精选')
    expect(attachmentSubtitle(list)).toBe('12 首歌曲')
  })

  it('falls back when fields are missing', () => {
    expect(attachmentTitle(null)).toBe('')
    expect(attachmentTitle({ type: 'song', song: {} })).toBe('音乐')
    expect(attachmentSubtitle({ type: 'playlist', songCount: 0 })).toBe('0 首歌曲')
  })

  it('reads the cover from the shape each type uses', () => {
    expect(attachmentCover({ type: 'song', song: { img: 'a.jpg' } })).toBe('a.jpg')
    expect(attachmentCover({ type: 'playlist', preview: [{ img: 'b.jpg' }] })).toBe('b.jpg')
    expect(attachmentCover({ type: 'playlist', cover: 'c.jpg', preview: [{ img: 'b.jpg' }] })).toBe(
      'c.jpg'
    )
    expect(attachmentCover(null)).toBe('')
  })
})
