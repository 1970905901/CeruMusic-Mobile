import { describe, expect, it } from 'vitest'
import { convertPlaylist, encryptPlaylist } from './playlistConverter'

describe('playlist converter', () => {
  it('converts a desktop playlist into Ceru mobile playlist rows', () => {
    const songs = convertPlaylist({
      list: [
        {
          name: '夜曲',
          singer: '周杰伦',
          source: 'wy',
          interval: '03:46',
          meta: { hash: 'abc', albumName: '十一月的萧邦', qualitys: [{ type: '320k' }, { type: 'flac' }] }
        }
      ]
    })
    expect(songs[0]).toMatchObject({
      songmid: 'abc',
      name: '夜曲',
      singer: '周杰伦',
      albumName: '十一月的萧邦',
      source: 'wy',
      types: { '320k': { size: '未知' }, flac: { size: '未知' } }
    })
  })

  it('encrypts the converted playlist as non-empty ciphertext', () => {
    const songs = convertPlaylist({ list: [{ name: 'A', singer: 'B', meta: { hash: '1' } }] })
    const encrypted = encryptPlaylist(songs)
    expect(encrypted.length).toBeGreaterThan(20)
    expect(encrypted).not.toContain('"name"')
  })
})