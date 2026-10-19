import { Capacitor, registerPlugin } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { base64ToArrayBuffer } from '@/services/audioTags'
import { useLibraryStore } from '@/stores/library'

interface SafEntry {
  uri: string
  name: string
  mime: string
  directory: boolean
  size: number
  modifiedAt: number
}

interface SafPlugin {
  pickDirectory(): Promise<{ uri: string; name: string }>
  listChildren(options: { uri: string }): Promise<{ items: SafEntry[]; truncated: boolean }>
  copyToApp(options: { uri: string; name: string }): Promise<{
    relativePath: string
    name: string
    size: number
    uri: string
  }>
}

const Saf = registerPlugin<SafPlugin>('Saf')
const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'mp4', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'webm', 'wma', 'aiff', 'aif', 'alac'
])
const MAX_FILES = 2000
const MAX_DEPTH = 12

function extension(name: string): string {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

function mimeForAudio(name: string): string {
  const values: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/opus',
    webm: 'audio/webm',
    wma: 'audio/x-ms-wma',
    aiff: 'audio/aiff',
    aif: 'audio/aiff',
    alac: 'audio/mp4'
  }
  return values[extension(name)] || 'audio/mpeg'
}

function isAudio(name: string): boolean {
  return AUDIO_EXTENSIONS.has(extension(name))
}

export function safImportSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function collectFiles(
  uri: string,
  depth: number,
  output: SafEntry[]
): Promise<void> {
  if (depth > MAX_DEPTH || output.length >= MAX_FILES) return
  const result = await Saf.listChildren({ uri })
  for (const entry of result.items) {
    if (output.length >= MAX_FILES) return
    if (entry.directory) {
      await collectFiles(entry.uri, depth + 1, output)
    } else if (isAudio(entry.name)) {
      output.push(entry)
    }
  }
  if (result.truncated) {
    throw new Error('文件夹内容超过系统单次读取上限，请选择更小的文件夹')
  }
}

export interface SafImportResult {
  folder: string
  imported: number
  skipped: number
  failed: number
  truncated: boolean
}

export async function importSafFolder(
  onProgress?: (message: string) => void
): Promise<SafImportResult> {
  if (!safImportSupported()) throw new Error('当前平台不支持 Android SAF 文件夹导入')
  const folder = await Saf.pickDirectory()
  const entries: SafEntry[] = []
  onProgress?.('正在扫描文件夹…')
  await collectFiles(folder.uri, 0, entries)
  if (!entries.length) {
    return { folder: folder.name, imported: 0, skipped: 0, failed: 0, truncated: false }
  }
  const library = useLibraryStore()
  let imported = 0
  let skipped = 0
  let failed = 0
  let truncated = false
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    onProgress?.(`正在导入 ${index + 1}/${entries.length}：${entry.name}`)
    let copied: Awaited<ReturnType<SafPlugin['copyToApp']>> | null = null
    try {
      copied = await Saf.copyToApp({ uri: entry.uri, name: entry.name })
      const data = await Filesystem.readFile({
        path: copied.relativePath,
        directory: Directory.Data
      })
      const base64 = typeof data.data === 'string' ? data.data : ''
      if (!base64) throw new Error('读取导入文件失败')
      const bytes = new Uint8Array(base64ToArrayBuffer(base64))
      const file = new File([bytes], entry.name, { type: mimeForAudio(entry.name) })
      const record = await library.importLocalFile(file, {
        sourcePath: 'saf:' + entry.uri
      })
      if (record) imported++
      else skipped++
    } catch (error) {
      failed++
      console.warn('SAF 导入失败', entry.name, error)
    } finally {
      if (copied) {
        await Filesystem.deleteFile({
          path: copied.relativePath,
          directory: Directory.Data
        }).catch(() => undefined)
      }
    }
  }
  return { folder: folder.name, imported, skipped, failed, truncated }
}
