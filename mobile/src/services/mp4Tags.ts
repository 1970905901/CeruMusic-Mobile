import type { WritableAudioTags } from './audioTags'

interface Mp4Box {
  type: string
  prefix: Uint8Array
  children?: Mp4Box[]
  payload?: Uint8Array
  start: number
  size: number
}

const CONTAINERS = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'edts',
  'dinf',
  'udta',
  'meta',
  'mvex',
  'moof',
  'traf',
  'wave',
  'sinf',
  'schi',
  'ipro',
  'meco',
  'hnti',
  'hinf',
  'tref'
])

function u32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  ) >>> 0
}

function u64(bytes: Uint8Array, offset: number): number {
  return u32(bytes, offset) * 0x100000000 + u32(bytes, offset + 4)
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff
  target[offset + 1] = (value >>> 16) & 0xff
  target[offset + 2] = (value >>> 8) & 0xff
  target[offset + 3] = value & 0xff
}

function writeU64(target: Uint8Array, offset: number, value: number): void {
  const high = Math.floor(value / 0x100000000)
  const low = value - high * 0x100000000
  writeU32(target, offset, high)
  writeU32(target, offset + 4, low)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = ''
  for (let index = 0; index < length; index++) value += String.fromCharCode(bytes[offset + index])
  return value
}

function typeBytes(type: string): Uint8Array {
  if (type.length !== 4) throw new Error('MP4 box 类型必须为 4 字节')
  return Uint8Array.from([0, 1, 2, 3].map((index) => type.charCodeAt(index) & 0xff))
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

function parseBoxes(source: Uint8Array, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = []
  let offset = start
  while (offset < end) {
    if (offset + 8 > end) throw new Error('MP4 box 头部不完整')
    let size = u32(source, offset)
    const type = ascii(source, offset + 4, 4)
    let header = 8
    if (size === 1) {
      if (offset + 16 > end) throw new Error('MP4 64 位 box 头部不完整')
      size = u64(source, offset + 8)
      header = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) {
      throw new Error('MP4 box 大小无效')
    }
    const payloadStart = offset + header
    const payloadEnd = offset + size
    if (type === 'meta') {
      if (payloadStart + 4 > payloadEnd) throw new Error('MP4 meta box 无效')
      boxes.push({
        type,
        prefix: source.subarray(payloadStart, payloadStart + 4),
        children: parseBoxes(source, payloadStart + 4, payloadEnd),
        start: offset,
        size
      })
    } else if (CONTAINERS.has(type)) {
      boxes.push({
        type,
        prefix: new Uint8Array(0),
        children: parseBoxes(source, payloadStart, payloadEnd),
        start: offset,
        size
      })
    } else {
      boxes.push({
        type,
        prefix: new Uint8Array(0),
        payload: source.subarray(payloadStart, payloadEnd),
        start: offset,
        size
      })
    }
    offset += size
  }
  if (offset !== end) throw new Error('MP4 box 边界不一致')
  return boxes
}

function boxBody(box: Mp4Box): number {
  let body = box.prefix.length
  if (box.children) {
    for (const child of box.children) body += boxByteLength(child)
  } else {
    body += box.payload?.length ?? 0
  }
  return body
}

function boxHeaderLength(box: Mp4Box): number {
  return 8 + boxBody(box) > 0xffffffff ? 16 : 8
}

function boxByteLength(box: Mp4Box): number {
  return boxHeaderLength(box) + boxBody(box)
}

function serializeBox(box: Mp4Box): Uint8Array {
  const bodyLength = boxBody(box)
  const headerLength = bodyLength + 8 > 0xffffffff ? 16 : 8
  const size = headerLength + bodyLength
  const output = new Uint8Array(size)
  const type = typeBytes(box.type)
  output.set(type, 4)
  if (headerLength === 8) {
    if (size > 0xffffffff) throw new Error('MP4 box 大小超出 32 位')
    writeU32(output, 0, size)
  } else {
    writeU32(output, 0, 1)
    writeU64(output, 8, size)
  }
  let offset = headerLength
  output.set(box.prefix, offset)
  offset += box.prefix.length
  if (box.children) {
    for (const child of box.children) {
      const bytes = serializeBox(child)
      output.set(bytes, offset)
      offset += bytes.length
    }
  } else if (box.payload) {
    output.set(box.payload, offset)
  }
  return output
}

function makeBox(type: string, payload: Uint8Array): Mp4Box {
  return {
    type,
    prefix: new Uint8Array(0),
    payload,
    start: 0,
    size: 0
  }
}

function makeContainer(type: string, children: Mp4Box[], prefix = new Uint8Array(0)): Mp4Box {
  return {
    type,
    prefix,
    children,
    start: 0,
    size: 0
  }
}

function textData(value: string): Uint8Array {
  const text = new TextEncoder().encode(value)
  const payload = new Uint8Array(8 + text.length)
  writeU32(payload, 0, 1)
  payload.set(text, 8)
  return payload
}

function imageData(coverDataUrl?: string): { data: Uint8Array; type: number } | undefined {
  if (!coverDataUrl?.startsWith('data:') || !coverDataUrl.includes(',')) return undefined
  const header = coverDataUrl.slice(5, coverDataUrl.indexOf(','))
  const mime = header.split(';')[0].toLowerCase()
  if (!mime.startsWith('image/')) return undefined
  try {
    const binary = atob(coverDataUrl.slice(coverDataUrl.indexOf(',') + 1))
    const data = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index)
    return { data, type: mime.includes('png') ? 14 : 13 }
  } catch {
    return undefined
  }
}

function itemBox(type: string, data: Uint8Array): Mp4Box {
  return makeContainer(type, [makeBox('data', data)])
}

function buildIlst(tags: WritableAudioTags): Mp4Box | undefined {
  const items: Mp4Box[] = []
  if (tags.title) items.push(itemBox(String.fromCharCode(0xa9) + 'nam', textData(tags.title)))
  if (tags.artists?.length) {
    items.push(itemBox(String.fromCharCode(0xa9) + 'ART', textData(tags.artists.join(' / '))))
  }
  if (tags.album) items.push(itemBox(String.fromCharCode(0xa9) + 'alb', textData(tags.album)))
  if (tags.year && Number.isFinite(tags.year)) {
    items.push(itemBox(String.fromCharCode(0xa9) + 'day', textData(String(Math.trunc(tags.year)))))
  }
  if (tags.genres?.length) {
    items.push(itemBox(String.fromCharCode(0xa9) + 'gen', textData(tags.genres.join(' / '))))
  }
  if (tags.lyrics) items.push(itemBox(String.fromCharCode(0xa9) + 'lyr', textData(tags.lyrics)))
  const cover = imageData(tags.coverDataUrl)
  if (cover) {
    const payload = new Uint8Array(8 + cover.data.length)
    writeU32(payload, 0, cover.type)
    payload.set(cover.data, 8)
    items.push(makeContainer('covr', [makeBox('data', payload)]))
  }
  return items.length ? makeContainer('ilst', items) : undefined
}

function createHdlr(): Mp4Box {
  const payload = new Uint8Array(25)
  const handler = new TextEncoder().encode('mdir')
  payload.set(handler, 8)
  return makeBox('hdlr', payload)
}

function findChild(box: Mp4Box, type: string): Mp4Box | undefined {
  return box.children?.find((child) => child.type === type)
}

function ensureMetadataContainer(moov: Mp4Box, ilst: Mp4Box): void {
  let udta = findChild(moov, 'udta')
  if (!udta) {
    udta = makeContainer('udta', [])
    moov.children!.push(udta)
  }
  let meta = findChild(udta, 'meta')
  if (!meta) {
    meta = makeContainer('meta', [createHdlr(), ilst], new Uint8Array(4))
    udta.children!.push(meta)
    return
  }
  if (!findChild(meta, 'hdlr')) meta.children!.unshift(createHdlr())
  const index = meta.children!.findIndex((child) => child.type === 'ilst')
  if (index >= 0) meta.children![index] = ilst
  else meta.children!.push(ilst)
}

function patchChunkOffsets(box: Mp4Box, oldMoovEnd: number, delta: number): void {
  if (box.type === 'stco' && box.payload) {
    const payload = box.payload
    if (payload.length < 8) throw new Error('MP4 stco box 无效')
    const count = u32(payload, 4)
    if (8 + count * 4 > payload.length) throw new Error('MP4 stco 条目不完整')
    for (let index = 0; index < count; index++) {
      const offset = 8 + index * 4
      const value = u32(payload, offset)
      if (value >= oldMoovEnd) {
        const next = value + delta
        if (next < 0 || next > 0xffffffff) throw new Error('M4A 文件过大，stco 偏移溢出')
        writeU32(payload, offset, next)
      }
    }
    return
  }
  if (box.type === 'co64' && box.payload) {
    const payload = box.payload
    if (payload.length < 8) throw new Error('MP4 co64 box 无效')
    const count = u32(payload, 4)
    if (8 + count * 8 > payload.length) throw new Error('MP4 co64 条目不完整')
    for (let index = 0; index < count; index++) {
      const offset = 8 + index * 8
      const value = u64(payload, offset)
      if (value >= oldMoovEnd) {
        const next = value + delta
        if (next < 0 || !Number.isSafeInteger(next)) throw new Error('M4A 文件过大，co64 偏移溢出')
        writeU64(payload, offset, next)
      }
    }
    return
  }
  if (box.children) {
    for (const child of box.children) patchChunkOffsets(child, oldMoovEnd, delta)
  }
}

export function isM4aFile(fileName = '', mime = ''): boolean {
  return /\.(m4a|mp4)$/i.test(fileName) || /audio\/(mp4|x-m4a|m4a)/i.test(mime)
}

/**
 * Rewrites iTunes-style metadata under moov/udta/meta/ilst. The moov size may
 * change, so absolute stco/co64 chunk offsets are shifted when mdat follows it.
 * Fragmented MP4 is rejected because its chunk offsets live in moof boxes.
 */
export function writeM4aTags(buffer: ArrayBufferLike, tags: WritableAudioTags): ArrayBuffer {
  const source = new Uint8Array(buffer)
  if (source.length < 12) throw new Error('不是有效的 M4A/MP4 文件')
  const boxes = parseBoxes(source, 0, source.length)
  if (boxes.some((box) => box.type === 'moof')) {
    throw new Error('分片 MP4/M4A 暂不支持写入标签')
  }
  const moovIndex = boxes.findIndex((box) => box.type === 'moov')
  if (moovIndex < 0) throw new Error('M4A/MP4 缺少 moov box')
  const moov = boxes[moovIndex]
  const ilst = buildIlst(tags)
  if (!ilst) return source.slice().buffer as ArrayBuffer
  ensureMetadataContainer(moov, ilst)
  const newMoovSize = boxByteLength(moov)
  const oldMoovEnd = moov.start + moov.size
  const delta = newMoovSize - moov.size
  if (delta !== 0) patchChunkOffsets(moov, oldMoovEnd, delta)
  const output = boxes.map((box) => serializeBox(box))
  return concat(output).buffer as ArrayBuffer
}

export function writeM4aTagsToBase64(base64: string, tags: WritableAudioTags): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  const tagged = new Uint8Array(writeM4aTags(bytes.buffer, tags))
  let output = ''
  const chunk = 0x8000
  for (let index = 0; index < tagged.length; index += chunk) {
    output += String.fromCharCode(...tagged.subarray(index, index + chunk))
  }
  return btoa(output)
}
