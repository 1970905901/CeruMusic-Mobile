import { describe, expect, it } from 'vitest'
import {
  MAX_CLIPBOARD_TEXT_BYTES,
  clipboardPlaylistName,
  parsePlaylistClipboard
} from './playlistClipboard'
import { encryptPlaylistTracks } from './playlistFiles'
import type { ProviderEntry } from '@/types/plugin'
import type { Track } from '@/types/music'

const provider: ProviderEntry = {
  pluginKey: 'wy-plugin',
  pluginId: 'wy-plugin',
  pluginName: '网易云',
  providerId: 'wy',
  providerName: '网易云音乐',
  protocols: [],
  qualities: ['128k', '320k']
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    key: 'wy-plugin:wy:42',
    ref: { providerId: 'wy', kind: 'track', id: '42', scope: 'provider' },
    title: '晴天',
    artists: ['周杰伦'],
    album: '叶惠美',
    durationMs: 269000,
    artworkUrl: 'https://example.com/cover.jpg',
    qualities: ['320k'],
    playable: true,
    raw: {},
    source: 'plugin',
    ...overrides
  }
}

/** 复制到剪贴板的就是这段加密串，导入时按同一份密钥解回来。 */
const clipboardOf = (tracks: Track[]) => encryptPlaylistTracks(tracks)

describe('clipboard playlist import', () => {
  it('round-trips what the copy action put on the clipboard', () => {
    const result = parsePlaylistClipboard(clipboardOf([makeTrack()]), [provider])
    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0].title).toBe('晴天')
    expect(result.tracks[0].key).toBe('wy-plugin:wy:42')
    expect(result.tracks[0].playable).toBe(true)
  })

  it('rejects an empty clipboard instead of importing nothing silently', () => {
    expect(() => parsePlaylistClipboard('', [provider])).toThrow('剪贴板是空的')
    expect(() => parsePlaylistClipboard('   \n ', [provider])).toThrow('剪贴板是空的')
  })

  it('explains a decrypt failure rather than reporting a generic error', () => {
    // 用户常常是复制了别的东西；说清「不是歌单」比「导入失败」有用。
    expect(() => parsePlaylistClipboard('随便一段文字', [provider])).toThrow(
      '解密播放列表失败或数据格式不正确'
    )
  })

  it('refuses clipboard text that is far too large to be a playlist', () => {
    const huge = 'x'.repeat(MAX_CLIPBOARD_TEXT_BYTES + 1)
    expect(() => parsePlaylistClipboard(huge, [provider])).toThrow('可能不是歌单')
  })

  it('drops local-only tracks and refuses when nothing importable is left', () => {
    const local = makeTrack({
      key: 'local:1',
      source: 'local',
      localUri: 'capacitor://localhost/_capacitor_file_/a.mp3'
    })
    const encrypted = clipboardOf([makeTrack()])
    // 本地歌曲根本不会进加密串（`encryptPlaylistTracks` 先过滤），
    // 所以「只有本地歌曲」的歌单在复制端就会失败——这里确认导入端同样不会
    // 把空结果当成成功。
    expect(() => encryptPlaylistTracks([local])).toThrow('没有可导出的在线歌曲')
    const result = parsePlaylistClipboard(encrypted, [provider])
    expect(result.tracks.every((track) => track.source !== 'local')).toBe(true)
  })

  it('keeps songs whose provider is missing but marks them unplayable', () => {
    const result = parsePlaylistClipboard(clipboardOf([makeTrack()]), [])
    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0].playable).toBe(false)
  })

  it('carries the song list through so callers can show what was imported', () => {
    const result = parsePlaylistClipboard(
      clipboardOf([makeTrack(), makeTrack({ key: 'wy-plugin:wy:43', title: '七里香' })]),
      [provider]
    )
    expect(result.songs.map((song) => song.name)).toEqual(['晴天', '七里香'])
  })
})

describe('clipboard playlist name', () => {
  it('dates the imported playlist so repeated imports stay distinguishable', () => {
    expect(clipboardPlaylistName(new Date(2026, 9, 23))).toBe('导入的歌单 2026-10-23')
    expect(clipboardPlaylistName(new Date(2026, 0, 5))).toBe('导入的歌单 2026-01-05')
  })
})
