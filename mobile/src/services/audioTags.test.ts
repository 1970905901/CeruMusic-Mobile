import { describe, expect, it } from 'vitest'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  writeFlacTags,
  writeMp3Tags
} from './audioTags'

describe('audio tag helpers', () => {
  it('round-trips base64 without changing bytes', () => {
    const source = new Uint8Array([0, 1, 2, 127, 128, 255])
    const encoded = arrayBufferToBase64(source.buffer)
    expect(Array.from(new Uint8Array(base64ToArrayBuffer(encoded)))).toEqual(Array.from(source))
  })

  it('writes FLAC Vorbis comments and preserves audio frames', () => {
    const streamInfo = new Uint8Array(34)
    const audio = new Uint8Array([0xff, 0xf8, 0x69, 0x08, 0x00, 0x01])
    const source = new Uint8Array(4 + 4 + streamInfo.length + audio.length)
    source.set([0x66, 0x4c, 0x61, 0x43], 0)
    source[4] = 0x80
    source[7] = streamInfo.length
    source.set(streamInfo, 8)
    source.set(audio, 8 + streamInfo.length)
    const tagged = new Uint8Array(
      writeFlacTags(source.buffer, {
        title: 'FLAC Title',
        artists: ['Artist A', 'Artist B'],
        album: 'Album',
        year: 2024,
        genres: ['Pop', 'Rock'],
        lyrics: 'line one\nline two'
      })
    )
    expect(String.fromCharCode(...tagged.slice(0, 4))).toBe('fLaC')
    const text = new TextDecoder().decode(tagged)
    expect(text).toContain('TITLE=FLAC Title')
    expect(text).toContain('ARTIST=Artist A / Artist B')
    expect(text).toContain('DATE=2024')
    expect(text).toContain('GENRE=Pop / Rock')
    expect(text).toContain('LYRICS=line one')
    expect(Array.from(tagged.slice(tagged.length - audio.length))).toEqual(Array.from(audio))
  })

  it('writes an ID3v2 header and keeps the audio payload', () => {
    const source = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00])
    const tagged = new Uint8Array(
      writeMp3Tags(source.buffer, { title: 'Title', artists: ['Artist'], album: 'Album' })
    )
    expect(String.fromCharCode(tagged[0], tagged[1], tagged[2])).toBe('ID3')
    const payload = tagged.slice(tagged.length - source.length)
    expect(Array.from(payload)).toEqual(Array.from(source))
  })
})
