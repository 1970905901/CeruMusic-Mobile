import { describe, expect, it } from 'vitest'
import { describeCloudOverwrite, planCloudOverwrite } from './cloudPlaylistOverwrite'
import type { CloudSongDto } from './cloudSongList'
import type { Track } from '@/types/music'

const song = (overrides: Partial<CloudSongDto> = {}): CloudSongDto => ({
  songmid: '123',
  name: '晴天',
  singer: '周杰伦',
  albumId: '9',
  albumName: '叶惠美',
  source: 'wy',
  interval: '4:29',
  img: 'cover.jpg',
  types: [{ type: '320k', size: '10MB' }],
  ...overrides
})

const provider = { pluginKey: 'wy-plugin', providerId: 'wy', qualities: ['128k', '320k'] }

const localTrack = (overrides: Partial<Track> = {}): Track => ({
  key: 'wy-plugin:wy:999',
  ref: { providerId: 'wy', kind: 'track', id: '999', scope: 'provider' },
  title: '本地歌',
  artists: ['歌手'],
  qualities: ['320k'],
  playable: true,
  raw: {},
  ...overrides
})

describe('cloud playlist overwrite plan', () => {
  it('maps cloud songs into tracks in cloud order', () => {
    const plan = planCloudOverwrite(
      [song({ songmid: '1' }), song({ songmid: '2', name: '七里香' })],
      [],
      [provider]
    )
    expect(plan.tracks.map((track) => track.title)).toEqual(['晴天', '七里香'])
    expect(plan.tracks.map((track) => track.key)).toEqual(['wy-plugin:wy:1', 'wy-plugin:wy:2'])
    expect(plan.duplicates).toBe(0)
  })

  it('collapses duplicate cloud entries instead of writing the same song twice', () => {
    // 旧版本允许同一首歌在云端歌单里出现两次；直接写入会产生两条一模一样的条目，
    // 之后「移除歌曲」也只能删掉其中一条。
    const plan = planCloudOverwrite([song(), song(), song({ songmid: '2' })], [], [provider])
    expect(plan.tracks).toHaveLength(2)
    expect(plan.duplicates).toBe(1)
  })

  it('counts local files that the cloud cannot hold and therefore drops', () => {
    const local = [
      localTrack({ key: 'local:1', localUri: 'file:///a.mp3', source: 'local' }),
      localTrack({ key: 'dl:2', downloadedPath: '/b.mp3', source: 'download' }),
      localTrack({ key: 'wy-plugin:wy:3' })
    ]
    const plan = planCloudOverwrite([song()], local, [provider])
    expect(plan.droppedLocal).toBe(2)
  })

  it('reports how many restored songs have no provider installed', () => {
    const plan = planCloudOverwrite(
      [song({ songmid: '1', source: 'wy' }), song({ songmid: '2', source: 'kg' })],
      [],
      [provider]
    )
    expect(plan.unplayable).toBe(1)
    expect(plan.tracks[1].playable).toBe(false)
  })

  it('survives an empty cloud response without inventing tracks', () => {
    const plan = planCloudOverwrite([], [localTrack({ localUri: 'file:///x.mp3' })], [provider])
    expect(plan.tracks).toEqual([])
    expect(plan.droppedLocal).toBe(1)
    expect(plan.unplayable).toBe(0)
  })
})

describe('cloud overwrite wording', () => {
  it('always states how many songs will replace the local list', () => {
    const text = describeCloudOverwrite(
      planCloudOverwrite([song(), song({ songmid: '2' })], [], [provider])
    )
    expect(text).toContain('云端的 2 首歌曲替换本机歌单内容')
    expect(text).not.toContain('本地文件')
    expect(text).not.toContain('无法播放')
  })

  it('warns about dropped local copies before the user confirms', () => {
    const text = describeCloudOverwrite(
      planCloudOverwrite(
        [song()],
        [localTrack({ key: 'local:1', localUri: 'file:///a.mp3', source: 'local' })],
        [provider]
      )
    )
    expect(text).toContain('本机的 1 首本地文件 / 已下载副本会被移出歌单')
  })

  it('warns when the restored songs cannot be played without their plugin', () => {
    const text = describeCloudOverwrite(
      planCloudOverwrite([song({ source: 'kg' })], [], [provider])
    )
    expect(text).toContain('1 首没有对应的音源插件')
  })
})
