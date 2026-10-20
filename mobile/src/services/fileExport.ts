import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { arrayBufferToBase64 } from '@/services/audioTags'

export interface SaveFileOptions {
  name: string
  data: string | Uint8Array
  mime?: string
  title?: string
  text?: string
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Write a generated file to the cache directory and open the system share sheet. */
export async function saveAndShareFile(options: SaveFileOptions): Promise<void> {
  const bytes = toBytes(options.data)
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: options.name,
      data: arrayBufferToBase64(exactBuffer(bytes)),
      directory: Directory.Cache
    })
    const uri = await Filesystem.getUri({ path: options.name, directory: Directory.Cache })
    await Share.share({
      title: options.title || options.name,
      text: options.text || options.name,
      url: Capacitor.convertFileSrc(uri.uri)
    })
    return
  }
  const blob = new Blob([exactBuffer(bytes)], { type: options.mime || 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = options.name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}
