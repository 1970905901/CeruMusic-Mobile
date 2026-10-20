import { describe, expect, it } from 'vitest'
import { sortTracks, TRACK_SORT_OPTIONS } from '@/services/trackSorter'
import type { Track } from '@/types/music'

function makeTrack(id: string, title: string, artist: string, album?: string, durationMs?: number): Track {
  return {
    key: `test:${id}`,
    ref: { id, kind: 'song', providerId: 'test' },
    title,
    artists: [artist],
    subtitle: artist,
    album,
    durationMs,
    qualities: [],
    playable: true,
    raw: {}
  }
}

describe('Track Sorter Utility', () => {
  const songs: Track[] = [
    makeTrack('1', '晴天', '周杰伦', '叶惠美', 269000),
    makeTrack('2', '1989', 'Taylor Swift', '1989', 212000),
    makeTrack('3', 'Apple', 'Charli xcx', 'BRAT', 151000),
    makeTrack('4', '七里香', '周杰伦', '七里香', 299000),
    makeTrack('5', 'Bad Guy', 'Billie Eilish', undefined, 194000)
  ]

  it('exposes sort options with default as first', () => {
    expect(TRACK_SORT_OPTIONS.length).toBe(9)
    expect(TRACK_SORT_OPTIONS[0].type).toBe('default')
  })

  it('preserves order under default sort', () => {
    const sorted = sortTracks(songs, 'default')
    expect(sorted.map((s) => s.key)).toEqual(songs.map((s) => s.key))
  })

  it('sorts by title ascending and descending', () => {
    const asc = sortTracks(songs, 'title_asc')
    // 数字(1989) -> 大写英文(Apple, Bad Guy) -> 中文拼音(晴天 qing -> 七里香 qi)
    expect(asc[0].title).toBe('1989')
    expect(asc[1].title).toBe('Apple')
    expect(asc[2].title).toBe('Bad Guy')
    expect(asc[3].title).toBe('七里香') // qi
    expect(asc[4].title).toBe('晴天')   // qing

    const desc = sortTracks(songs, 'title_desc')
    expect(desc[0].title).toBe('晴天')
    expect(desc[1].title).toBe('七里香')
    expect(desc[desc.length - 1].title).toBe('1989')
  })

  it('sorts by artist ascending and descending', () => {
    const asc = sortTracks(songs, 'artist_asc')
    expect(asc[0].artists[0]).toBe('Billie Eilish')
    expect(asc[1].artists[0]).toBe('Charli xcx')
    expect(asc[2].artists[0]).toBe('Taylor Swift')
    expect(asc[3].artists[0]).toBe('周杰伦')

    const desc = sortTracks(songs, 'artist_desc')
    expect(desc[0].artists[0]).toBe('周杰伦')
    expect(desc[desc.length - 1].artists[0]).toBe('Billie Eilish')
  })

  it('sorts by album handling missing albums gracefully', () => {
    const asc = sortTracks(songs, 'album_asc')
    // 有专辑优先排在前面，缺少专辑的排在末尾
    expect(asc[0].album).toBe('1989')
    expect(asc[1].album).toBe('BRAT')
    expect(asc[asc.length - 1].album).toBeUndefined()
  })

  it('sorts by duration ascending and descending', () => {
    const asc = sortTracks(songs, 'duration_asc')
    expect(asc.map((s) => s.durationMs)).toEqual([151000, 194000, 212000, 269000, 299000])

    const desc = sortTracks(songs, 'duration_desc')
    expect(desc.map((s) => s.durationMs)).toEqual([299000, 269000, 212000, 194000, 151000])
  })

  it('handles empty and single-item track arrays', () => {
    expect(sortTracks([], 'title_asc')).toEqual([])
    const single = [songs[0]]
    expect(sortTracks(single, 'duration_desc')).toEqual(single)
  })
})