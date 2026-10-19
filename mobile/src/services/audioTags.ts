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
}