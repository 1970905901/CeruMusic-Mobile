import { describe, expect, it } from 'vitest'
import { playlistImportMeta, mergePlaylistImportMeta } from './playlistImportMeta'

/**
 * 插件歌单导入的元信息，对齐桌面 `views/music/songlist.vue` 的
 * `handleNetworkPlaylistImport`：
 *
 * ```ts
 * name = result.name || name
 * description = result.playlist?.description || description
 * artwork = result.playlist?.artworkUrl || artwork
 * ```
 *
 * 桌面把这个封面写进新建的歌单（`songListAPI.updateCover`），移动端此前只读
 * `page.name` 与 `page.items`，`page.playlist` 整个丢掉——导入进来的歌单在
 * 列表里是一张空白封面、也没有简介，和「音乐库 → 歌单」里其它卡片长得不一样。
 */

describe('playlistImportMeta', () => {
  it('reads the name, description and cover the importer page carries', () => {
    expect(
      playlistImportMeta({
        name: '我喜欢的音乐',
        playlist: { description: '收藏了很久', artworkUrl: 'https://cdn/cover.jpg' }
      })
    ).toEqual({
      name: '我喜欢的音乐',
      description: '收藏了很久',
      cover: 'https://cdn/cover.jpg'
    })
  })

  it('leaves missing fields undefined so the caller keeps its fallbacks', () => {
    expect(playlistImportMeta({})).toEqual({
      name: undefined,
      description: undefined,
      cover: undefined
    })
    expect(playlistImportMeta(null)).toEqual({
      name: undefined,
      description: undefined,
      cover: undefined
    })
  })

  it('ignores values that are not usable strings', () => {
    // 插件返回 `{ name: 42 }` 或空白简介时，不能把数字拼进歌单名、也不能用空白覆盖默认文案。
    expect(
      playlistImportMeta({
        name: 42,
        playlist: { description: '   ', artworkUrl: { url: 'x' } }
      })
    ).toEqual({ name: undefined, description: undefined, cover: undefined })
  })

  it('only accepts an http(s) cover, like the rest of the app', () => {
    // 封面会原样进 `<img>`；`javascript:` 之类的地址不该被当成图片地址存进歌单。
    expect(playlistImportMeta({ playlist: { artworkUrl: 'javascript:alert(1)' } }).cover).toBeUndefined()
    expect(playlistImportMeta({ playlist: { artworkUrl: 'data:image/png;base64,AA' } }).cover).toBe(
      'data:image/png;base64,AA'
    )
  })
})

describe('mergePlaylistImportMeta', () => {
  it('lets a later page fill in what an earlier page left blank', () => {
    // 桌面每页都做 `result.name || name`：后续分页给出的非空值才覆盖。
    const first = playlistImportMeta({ name: '歌单' })
    const second = playlistImportMeta({
      name: '完整的歌单名',
      playlist: { description: '简介', artworkUrl: 'https://cdn/c.jpg' }
    })
    expect(mergePlaylistImportMeta(first, second)).toEqual({
      name: '完整的歌单名',
      description: '简介',
      cover: 'https://cdn/c.jpg'
    })
  })

  it('keeps the earlier value when the later page has nothing new', () => {
    const first = playlistImportMeta({
      name: '歌单',
      playlist: { description: '简介', artworkUrl: 'https://cdn/c.jpg' }
    })
    expect(mergePlaylistImportMeta(first, playlistImportMeta({}))).toEqual(first)
  })
})
