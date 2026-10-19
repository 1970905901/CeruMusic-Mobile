import { describe, expect, it } from 'vitest'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  writeMp3Tags
} from './audioTags'

describe('audio tag helpers', () => {
  it('round-trips base64 without changing bytes', () => {
    const source = new Uint8Array([0, 1, 2, 127, 128, 255])
    const encoded = arrayBufferToBase64(source.buffer)
    expect(Array.from(new Uint8Array(base64ToArrayBuffer(encoded)))).toEqual(Array.from(source))
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