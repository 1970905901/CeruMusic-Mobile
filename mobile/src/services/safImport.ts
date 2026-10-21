import { Capacitor, registerPlugin } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { base64ToArrayBuffer } from '@/services/audioTags'
import { useSettingsStore } from '@/stores/settings'
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
  writeFromApp(options: {
    sourcePath: string
    treeUri: string
    relativePath: string
    mime: string
  }): Promise<{ uri: string; name: string; relativePath: string; size: number }>
  deleteDocument(options: { uri: string }): Promise<{ deleted: boolean }>
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

export interface SafImportOptions {
  minSizeKb?: number
  minDurationSec?: number
}

export interface SafImportResult {
  folder: string
  imported: number
  skipped: number
  failed: number
  truncated: boolean
  filteredSize?: number
  filteredDuration?: number
}

export async function importSafFolder(
  onProgress?: (message: string) => void,
  options?: SafImportOptions
): Promise<SafImportResult> {
  if (!safImportSupported()) throw new Error('当前平台不支持 Android SAF 文件夹导入')
  const settingsStore = useSettingsStore()
  const minSizeKb = options?.minSizeKb ?? settingsStore.settings.localScanFilterMinSizeKb ?? 100
  const minDurationSec = options?.minDurationSec ?? settingsStore.settings.localScanFilterMinDurationSec ?? 30
  const folder = await Saf.pickDirectory()
  const entries: SafEntry[] = []
  onProgress?.('正在扫描文件夹…')
  await collectFiles(folder.uri, 0, entries)
  if (!entries.length) {
    return { folder: folder.name, imported: 0, skipped: 0, failed: 0, truncated: false, filteredSize: 0, filteredDuration: 0 }
  }
  const library = useLibraryStore()
  let imported = 0
  let skipped = 0
  let failed = 0
  let truncated = false
  let filteredSize = 0
  let filteredDuration = 0
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    onProgress?.(`正在导入 ${index + 1}/${entries.length}：${entry.name}`)
    if (minSizeKb > 0 && entry.size > 0 && entry.size < minSizeKb * 1024) {
      filteredSize++
      skipped++
      continue
    }
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
      if (minSizeKb > 0 && bytes.byteLength < minSizeKb * 1024) {
        filteredSize++
        skipped++
        continue
      }
      const file = new File([bytes], entry.name, { type: mimeForAudio(entry.name) })
      // 重复文件与「时长过短被过滤」都返回 null，这里分不清就会把过滤数量漏掉，
      // 界面只能笼统显示「跳过/过滤」。先用同一个判据判一次，把过滤单独计数。
      const outcome = await library.importLocalFileWithReason(file, {
        sourcePath: 'saf:' + entry.uri,
        minDurationSec
      })
      if (outcome.record) {
        imported++
      } else if (outcome.reason === 'duration') {
        filteredDuration++
        skipped++
      } else {
        skipped++
      }
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
  return { folder: folder.name, imported, skipped, failed, truncated, filteredSize, filteredDuration }
}

export async function pickSafDirectory(): Promise<{ uri: string; name: string }> {
  if (!safImportSupported()) throw new Error('当前平台不支持 Android SAF 目录')
  return Saf.pickDirectory()
}

export async function writeSafFromApp(options: {
  sourcePath: string
  treeUri: string
  relativePath: string
  mime: string
}): Promise<{ uri: string; name: string; relativePath: string; size: number }> {
  if (!safImportSupported()) throw new Error('当前平台不支持 Android SAF 下载')
  return Saf.writeFromApp(options)
}

export async function deleteSafDocument(uri: string): Promise<void> {
  if (!safImportSupported()) return
  await Saf.deleteDocument({ uri })
}
