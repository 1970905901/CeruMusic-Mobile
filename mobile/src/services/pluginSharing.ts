import { assertResourceRef, type ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'

export interface ShareDescriptorRequest {
  track?: unknown
  title?: unknown
  artists?: unknown
}

export interface ShareDescriptor {
  version: 1
  track: ResourceRef
  title: string
  artists: string[]
}

export interface CreateShareResult {
  id: string
  url: string
  template: string
}

export interface ReadShareResult extends ShareDescriptor {
  version: 1
}

const MAX_DESCRIPTOR_BYTES = 3072

function bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

function base64UrlEncode(text: string): string {
  const bytesArray = new TextEncoder().encode(text)
  let binary = ''
  for (let index = 0; index < bytesArray.length; index += 0x8000) {
    binary += String.fromCharCode(...bytesArray.subarray(index, index + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytesArray = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytesArray[index] = binary.charCodeAt(index)
  return new TextDecoder().decode(bytesArray)
}

function assertDescriptor(data: any): ReadShareResult {
  assertResourceRef(data?.track)
  if (
    data?.version !== 1 ||
    data.track.kind !== 'track' ||
    typeof data.title !== 'string' ||
    !Array.isArray(data.artists) ||
    data.artists.some((name: any) => typeof name !== 'string')
  ) {
    throw new Error('分享信息格式错误')
  }
  const { pluginId, providerId, kind, id } = data.track
  return {
    version: 1,
    track: { pluginId, providerId, kind, id },
    title: data.title,
    artists: data.artists
  }
}

/** Data-only app links. No plugin source, private resource data, token or media URL. */
export function createShareDescriptor(input: ShareDescriptorRequest): CreateShareResult {
  const ref = input.track
  assertResourceRef(ref)
  if (ref.kind !== 'track') throw new Error('只能分享歌曲资源')
  const data: ShareDescriptor = {
    version: 1,
    track: { pluginId: ref.pluginId, providerId: ref.providerId, kind: 'track', id: ref.id },
    title: String(input.title || '').slice(0, 200),
    artists: ((input.artists ?? []) as unknown[])
      .slice(0, 12)
      .map((name: any) => String(name).slice(0, 120))
  }
  const text = JSON.stringify(data)
  if (bytes(text) > MAX_DESCRIPTOR_BYTES) throw new Error('分享信息过长')
  const id = 'v2_' + base64UrlEncode(text)
  const url = 'cerumusic://share/' + id
  return {
    id,
    url,
    template: `${data.artists.join('、')}《${data.title}》 ${url}（在澜音中打开）`
  }
}

export function readShareDescriptor(id: string): ReadShareResult {
  const descriptorId = String(id || '')
  if (!/^v2_[A-Za-z0-9_-]{1,4096}$/.test(descriptorId)) throw new Error('分享链接格式错误')
  try {
    return assertDescriptor(JSON.parse(base64UrlDecode(descriptorId.slice(3))))
  } catch (error) {
    if (error instanceof Error && ['分享信息格式错误'].includes(error.message)) throw error
    throw new Error('分享链接格式错误')
  }
}

export function shareDescriptorFromUrl(value: string): ReadShareResult {
  const url = new URL(String(value || ''))
  if (url.protocol !== 'cerumusic:' || url.hostname !== 'share' || !url.pathname.startsWith('/')) {
    throw new Error('不是澜音分享链接')
  }
  return readShareDescriptor(url.pathname.slice(1))
}
