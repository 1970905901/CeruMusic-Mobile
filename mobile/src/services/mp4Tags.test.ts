import { describe, expect, it } from 'vitest'
import { isM4aFile, writeM4aTags } from './mp4Tags'

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  bytes[0] = (value >>> 24) & 0xff
  bytes[1] = (value >>> 16) & 0xff
  bytes[2] = (value >>> 8) & 0xff
  bytes[3] = value & 0xff
  return bytes
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return concat([u32(8 + payload.length), new TextEncoder().encode(type), payload])
}

function metaBox(ilst: Uint8Array): Uint8Array {
  const hdlr = new Uint8Array(25)
  hdlr.set(new TextEncoder().encode('mdir'), 8)
  return box('meta', concat([u32(0), box('hdlr', hdlr), ilst]))
}

function textItem(type: string, value: string): Uint8Array {
  const text = new TextEncoder().encode(value)
  return box(type, box('data', concat([u32(1), u32(0), text])))
}

function buildFile(options: { withMetadata: boolean; fragmented?: boolean }): Uint8Array {
  const ftyp = box('ftyp', new TextEncoder().encode('M4A isomM4A '))
  const buildMoov = (chunkOffset: number): Uint8Array => {
    const stco = box('stco', concat([u32(0), u32(1), u32(chunkOffset)]))
    const trak = box('trak', box('mdia', box('minf', box('stbl', stco))))
    const children = [trak]
    if (options.withMetadata) {
      children.push(
        box('udta', metaBox(box('ilst', textItem(String.fromCharCode(0xa9) + 'nam', 'Old title'))))
      )
    }
    return box('moov', concat(children))
  }
  const placeholder = buildMoov(0)
  const chunkOffset = ftyp.length + placeholder.length + 8
  const moov = buildMoov(chunkOffset)
  const mdat = box('mdat', new Uint8Array(64).fill(7))
  const parts = [ftyp, moov, mdat]
  if (options.fragmented) parts.push(box('moof', new Uint8Array(0)))
  return concat(parts)
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0
}

function child(bytes: Uint8Array, start: number, end: number, type: string) {
  let offset = start
  while (offset + 8 <= end) {
    const size = readU32(bytes, offset)
    const current = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (size < 8 || offset + size > end) throw new Error('bad box')
    if (current === type) return { start: offset + 8, end: offset + size, size }
    offset += size
  }
  throw new Error('box not found: ' + type)
}

function findPath(bytes: Uint8Array, types: string[]) {
  let start = 0
  let end = bytes.length
  for (let index = 0; index < types.length; index++) {
    const found = child(bytes, start, end, types[index])
    start = found.start
    end = found.end
    if (types[index] === 'meta') start += 4
  }
  return { start, end }
}

describe('M4A/MP4 tag writer', () => {
  it('detects M4A/MP4 file names and MIME types', () => {
    expect(isM4aFile('song.m4a', '')).toBe(true)
    expect(isM4aFile('song.mp4', '')).toBe(true)
    expect(isM4aFile('song.bin', 'audio/x-m4a')).toBe(true)
    expect(isM4aFile('song.mp3', 'audio/mpeg')).toBe(false)
  })

  it('writes ilst metadata and adjusts stco when moov grows', () => {
    const source = buildFile({ withMetadata: true })
    const oldMoov = findPath(source, ['moov'])
    const oldStco = findPath(source, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco'])
    const oldOffset = readU32(source, oldStco.start + 8)
    const tagged = new Uint8Array(
      writeM4aTags(source.buffer, {
        title: 'New title',
        artists: ['Artist One', 'Artist Two'],
        album: 'New album',
        year: 2026,
        genres: ['Pop'],
        lyrics: 'New lyrics'
      })
    )
    const newMoov = findPath(tagged, ['moov'])
    const newStco = findPath(tagged, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco'])
    const newOffset = readU32(tagged, newStco.start + 8)
    const delta = newMoov.end - newMoov.start - (oldMoov.end - oldMoov.start)
    expect(delta).not.toBe(0)
    expect(newOffset).toBe(oldOffset + delta)
    const ilst = findPath(tagged, ['moov', 'udta', 'meta', 'ilst'])
    const text = new TextDecoder().decode(tagged.subarray(ilst.start, ilst.end))
    expect(text).toContain('New title')
    expect(text).toContain('New album')
    expect(text).toContain('New lyrics')
    expect(text).not.toContain('Old title')
  })

  it('adds a metadata container when udta/meta/ilst are absent', () => {
    const source = buildFile({ withMetadata: false })
    const tagged = new Uint8Array(writeM4aTags(source.buffer, { title: 'Only title' }))
    const ilst = findPath(tagged, ['moov', 'udta', 'meta', 'ilst'])
    expect(new TextDecoder().decode(tagged.subarray(ilst.start, ilst.end))).toContain('Only title')
    const stco = findPath(tagged, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco'])
    expect(readU32(tagged, stco.start + 8)).toBeGreaterThan(0)
  })

  it('rejects fragmented files instead of corrupting moof-relative data', () => {
    const source = buildFile({ withMetadata: false, fragmented: true })
    expect(() => writeM4aTags(source.buffer, { title: 'Nope' })).toThrow('分片 MP4/M4A')
  })
})
