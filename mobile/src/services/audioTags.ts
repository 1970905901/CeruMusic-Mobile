import { ID3Writer } from 'browser-id3-writer'

export interface WritableAudioTags {
  title?: string
  artists?: string[]
  album?: string
  year?: number
  genres?: string[]
  lyrics?: string
  coverDataUrl?: string
}

export function isMp3File(fileName = '', mime = ''): boolean {
  return /\.mp3$/i.test(fileName) || /audio\/(mpeg|mp3)/i.test(mime)
}

export function base64ToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function dataUrlToArrayBuffer(value?: string): ArrayBuffer | undefined {
  if (!value || !value.startsWith('data:') || !value.includes(',')) return undefined
  try {
    return base64ToArrayBuffer(value)
  } catch {
    return undefined
  }
}

/** Rewrites an MP3 file with ID3v2.3 tags. Non-MP3 callers must not use this. */
export function writeMp3Tags(buffer: ArrayBufferLike, tags: WritableAudioTags): ArrayBuffer {
  const writer = new ID3Writer(buffer)
  if (tags.title) writer.setFrame('TIT2', tags.title)
  if (tags.artists?.length) writer.setFrame('TPE1', tags.artists)
  if (tags.album) writer.setFrame('TALB', tags.album)
  if (tags.year && Number.isFinite(tags.year)) writer.setFrame('TYER', Math.trunc(tags.year))
  if (tags.genres?.length) writer.setFrame('TCON', tags.genres)
  if (tags.lyrics) {
    writer.setFrame('USLT', {
      description: 'Lyrics',
      language: 'eng',
      lyrics: tags.lyrics
    })
  }
  const cover = dataUrlToArrayBuffer(tags.coverDataUrl)
  if (cover) {
    writer.setFrame('APIC', {
      type: 3 as any,
      data: cover,
      description: 'Cover'
    })
  }
  return writer.addTag()
}

export function writeMp3TagsToBase64(base64: string, tags: WritableAudioTags): string {
  return arrayBufferToBase64(writeMp3Tags(base64ToArrayBuffer(base64), tags))
}function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function uint32be(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ])
}

function uint32le(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ])
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function parseDataUrl(value?: string): { mime: string; data: Uint8Array } | undefined {
  if (!value || !value.startsWith('data:') || !value.includes(',')) return undefined
  const header = value.slice(5, value.indexOf(','))
  const mime = header.split(';')[0] || 'image/jpeg'
  try {
    return { mime, data: new Uint8Array(base64ToArrayBuffer(value)) }
  } catch {
    return undefined
  }
}

function vorbisComment(tags: WritableAudioTags): Uint8Array {
  const comments: string[] = []
  if (tags.title) comments.push('TITLE=' + tags.title)
  if (tags.artists?.length) comments.push('ARTIST=' + tags.artists.join(' / '))
  if (tags.album) comments.push('ALBUM=' + tags.album)
  if (tags.year) comments.push('DATE=' + String(Math.trunc(tags.year)))
  if (tags.genres?.length) comments.push('GENRE=' + tags.genres.join(' / '))
  if (tags.lyrics) comments.push('LYRICS=' + tags.lyrics)
  const vendor = utf8('CeruMusic Mobile')
  const encoded = comments.map((comment) => {
    const value = utf8(comment)
    return concatBytes([uint32le(value.length), value])
  })
  return concatBytes([
    uint32le(vendor.length),
    vendor,
    uint32le(encoded.length),
    ...encoded
  ])
}

function flacPicture(tags: WritableAudioTags): Uint8Array | undefined {
  const cover = parseDataUrl(tags.coverDataUrl)
  if (!cover) return undefined
  const mime = utf8(cover.mime)
  const description = new Uint8Array(0)
  return concatBytes([
    uint32be(3),
    uint32be(mime.length),
    mime,
    uint32be(description.length),
    description,
    uint32be(0),
    uint32be(0),
    uint32be(0),
    uint32be(0),
    uint32be(cover.data.length),
    cover.data
  ])
}

export function isFlacFile(fileName = '', mime = ''): boolean {
  return /\.flac$/i.test(fileName) || /audio\/(x-flac|flac)/i.test(mime)
}

/**
 * Rewrites FLAC metadata blocks with Vorbis comments and a front-cover picture.
 * Audio frames are copied byte-for-byte.
 */
export function writeFlacTags(buffer: ArrayBufferLike, tags: WritableAudioTags): ArrayBuffer {
  const source = new Uint8Array(buffer)
  if (
    source.length < 8 ||
    source[0] !== 0x66 ||
    source[1] !== 0x4c ||
    source[2] !== 0x61 ||
    source[3] !== 0x43
  ) {
    throw new Error('不是有效的 FLAC 文件')
  }
  const blocks: Array<{ type: number; data: Uint8Array }> = []
  let offset = 4
  let last = false
  while (!last && offset + 4 <= source.length) {
    const type = source[offset] & 0x7f
    last = (source[offset] & 0x80) !== 0
    const length =
      (source[offset + 1] << 16) | (source[offset + 2] << 8) | source[offset + 3]
    const start = offset + 4
    const end = start + length
    if (end > source.length) throw new Error('FLAC 元数据块损坏')
    blocks.push({ type, data: source.slice(start, end) })
    offset = end
  }
  if (!blocks.length || blocks[0].type !== 0) throw new Error('FLAC 缺少 STREAMINFO')
  const audio = source.slice(offset)
  const preserved = blocks.filter((block) => block.type !== 4 && block.type !== 6)
  const comment = vorbisComment(tags)
  const picture = flacPicture(tags)
  const outputBlocks: Array<{ type: number; data: Uint8Array }> = [
    preserved[0],
    ...preserved.slice(1),
    { type: 4, data: comment },
    ...(picture ? [{ type: 6, data: picture }] : [])
  ]
  const parts: Uint8Array[] = [new Uint8Array([0x66, 0x4c, 0x61, 0x43])]
  for (let index = 0; index < outputBlocks.length; index++) {
    const block = outputBlocks[index]
    const length = block.data.length
    if (length > 0xffffff) throw new Error('FLAC 标签过大')
    const header = new Uint8Array(4)
    header[0] = (index === outputBlocks.length - 1 ? 0x80 : 0) | block.type
    header[1] = (length >>> 16) & 0xff
    header[2] = (length >>> 8) & 0xff
    header[3] = length & 0xff
    parts.push(header, block.data)
  }
  parts.push(audio)
  return concatBytes(parts).buffer as ArrayBuffer
}

export function writeFlacTagsToBase64(base64: string, tags: WritableAudioTags): string {
  return arrayBufferToBase64(writeFlacTags(base64ToArrayBuffer(base64), tags))
}
