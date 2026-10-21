import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { DownloadStatus, DownloadTask } from '@/types/download'
import type { Track } from '@/types/music'
import { getDb, toPlain } from '@/services/db'
import { usePluginStore } from '@/stores/plugins'
import { useLibraryStore } from '@/stores/library'
import { useSettingsStore } from '@/stores/settings'
import { buildDownloadFilename } from '@/utils/filename'
import { isFlacFile, isMp3File, writeFlacTagsToBase64, writeMp3TagsToBase64 } from '@/services/audioTags'
import { isM4aFile, writeM4aTagsToBase64 } from '@/services/mp4Tags'
import { deleteSafDocument, writeSafFromApp } from '@/services/safImport'

export function isQueuedOrRunning(task: { status: string }): boolean {
  return task.status === 'running' || task.status === 'queued'
}

export function selectBatchDownloadCandidates<T extends { key: string; localUri?: string }>(
  items: readonly T[],
  existing: readonly { trackKey: string; status: string }[]
): T[] {
  const queued = new Set(existing.filter(isQueuedOrRunning).map((task) => task.trackKey))
  const seen = new Set<string>()
  return items.filter((track) => {
    if (track.localUri) return false
    if (queued.has(track.key) || seen.has(track.key)) return false
    seen.add(track.key)
    return true
  })
}

export function retryPatch(): { status: 'queued'; error: undefined; receivedBytes: 0 } {
  return { status: 'queued', error: undefined, receivedBytes: 0 }
}

function normalizeSubfolder(value: string): string {
  const parts = String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim().replace(/[<>:"|?*\u0000-\u001f]/g, ''))
    .filter((part) => part && part !== '.' && part !== '..')
  return (parts.length ? parts.join('/') : 'CeruMusic').slice(0, 120)
}

function storageDirectory(task: DownloadTask): Directory {
  return task.directory === 'documents' ? Directory.Documents : Directory.Data
}

function extFromMime(mime?: string, url?: string): string {
  if (mime?.includes('flac')) return 'flac'
  if (mime?.includes('mpeg')) return 'mp3'
  if (mime?.includes('mp4')) return 'm4a'
  if (mime?.includes('ogg')) return 'ogg'
  if (mime?.includes('wav')) return 'wav'
  try {
    const path = new URL(url || '').pathname
    const match = path.match(/\.([a-z0-9]{2,5})$/i)
    if (match) return match[1].toLowerCase()
  } catch {
    // Fall through.
  }
  return 'mp3'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取下载数据失败'))
    reader.readAsDataURL(blob)
  })
}

export const useDownloadStore = defineStore('downloads', () => {
  const pluginStore = usePluginStore()
  const library = useLibraryStore()
  const settings = useSettingsStore()
  const tasks = ref<DownloadTask[]>([])
  const initialized = ref(false)
  const activeRequests = new Map<string, XMLHttpRequest>()

  const runningCount = computed(
    () => tasks.value.filter((task) => task.status === 'running' || task.status === 'queued').length
  )
  const completed = computed(() => tasks.value.filter((task) => task.status === 'completed'))

  async function init(): Promise<void> {
    if (initialized.value) return
    const db = await getDb()
    tasks.value = (await db.getAll('downloads')).sort((a, b) => b.createdAt - a.createdAt)
    initialized.value = true
    for (const task of tasks.value) {
      if (task.status === 'running' || task.status === 'queued') {
        task.status = 'paused'
        await db.put('downloads', toPlain(task))
      }
    }
  }

  async function persist(task: DownloadTask): Promise<void> {
    const db = await getDb()
    await db.put('downloads', toPlain(task))
    pluginStore.publishDownloads({
      id: task.id,
      track: library.getTrack(task.trackKey)?.raw ?? { ref: { providerId: 'download', kind: 'track', id: task.id }, title: task.title, capabilities: [] },
      status: task.status === 'cancelled' ? 'cancelled' : task.status,
      receivedBytes: task.receivedBytes,
      totalBytes: task.totalBytes,
      error: task.error ? { code: 'INTERNAL', message: task.error } : undefined
    })
  }

  function updateTask(id: string, patch: Partial<DownloadTask>): void {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    Object.assign(task, patch, { updatedAt: Date.now() })
    void persist(task)
  }

  function downloadPrefix(task: DownloadTask): string {
    if (task.directory !== 'documents') return 'downloads'
    return normalizeSubfolder(settings.settings.downloadSubfolder)
  }

  async function resolveDownloadPath(task: DownloadTask, ext: string): Promise<string> {
    const track = library.getTrack(task.trackKey)
    const filename = buildDownloadFilename(settings.settings.downloadFilenameTemplate, {
      title: task.title,
      artist: task.artist,
      album: track?.album,
      quality: task.quality,
      ext
    })
    if (task.directory === 'saf') return `${downloadPrefix(task)}/${filename}`
    const dot = filename.lastIndexOf('.')
    const base = dot > 0 ? filename.slice(0, dot) : filename
    const extension = dot > 0 ? filename.slice(dot + 1) : ext
    const directory = storageDirectory(task)
    const prefix = downloadPrefix(task)
    let suffix = 1
    while (suffix < 1000) {
      const candidate = prefix + '/' + base + (suffix > 1 ? ' (' + suffix + ')' : '') + '.' + extension
      try {
        await Filesystem.stat({ path: candidate, directory })
        suffix++
      } catch {
        return candidate
      }
    }
    return prefix + '/' + task.id + '.' + extension
  }

  async function prepareDownloadData(
    task: DownloadTask,
    base64: string,
    ext: string,
    mime: string
  ): Promise<string> {
    if (!settings.settings.downloadWriteTags) return base64
    const isMp3 = isMp3File(`download.${ext}`, mime)
    const isFlac = isFlacFile(`download.${ext}`, mime)
    const isM4a = isM4aFile(`download.${ext}`, mime)
    if (!isMp3 && !isFlac && !isM4a) return base64
    const track = library.getTrack(task.trackKey)
    try {
      const tags = {
        title: task.title,
        artists: task.artist.split(/\s*\/\s*/).filter(Boolean),
        album: track?.album
      }
      return isMp3
        ? writeMp3TagsToBase64(base64, tags)
        : isFlac
          ? writeFlacTagsToBase64(base64, tags)
          : writeM4aTagsToBase64(base64, tags)
    } catch (error) {
      console.warn('写入下载文件标签失败', error)
      return base64
    }
  }

  async function completeDownload(
    task: DownloadTask,
    path: string,
    base64: string,
    ext: string,
    mime: string
  ): Promise<void> {
    if (task.directory === 'saf') {
      if (!task.safUri) throw new Error('缺少 Android SAF 下载目录授权')
      const stagingPath = `saf-staging/${task.id}.${ext}`
      await Filesystem.writeFile({
        path: stagingPath,
        data: base64,
        directory: Directory.Data,
        recursive: true
      })
      try {
        const result = await writeSafFromApp({
          sourcePath: stagingPath,
          treeUri: task.safUri,
          relativePath: path,
          mime
        })
        updateTask(task.id, {
          status: 'completed',
          receivedBytes: result.size,
          totalBytes: result.size,
          filePath: result.uri,
          relativePath: result.relativePath,
          mime
        })
      } finally {
        await Filesystem.deleteFile({ path: stagingPath, directory: Directory.Data }).catch(() => undefined)
      }
      return
    }
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: storageDirectory(task),
      recursive: true
    })
    const uri = await Filesystem.getUri({ path, directory: storageDirectory(task) })
    const size = Math.floor((base64.length * 3) / 4)
    updateTask(task.id, {
      status: 'completed',
      receivedBytes: size,
      totalBytes: size,
      filePath: uri.uri,
      relativePath: path,
      mime
    })
    const track = library.getTrack(task.trackKey)
    if (track) {
      library.upsertTrack({
        ...track,
        downloadedPath: uri.uri,
        downloadedRelativePath: path
      })
    }
  }

  async function downloadWithXhr(
    task: DownloadTask,
    url: string,
    headers?: Record<string, string>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      activeRequests.set(task.id, xhr)
      xhr.open('GET', url, true)
      xhr.responseType = 'blob'
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          try {
            xhr.setRequestHeader(key, value)
          } catch {
            // Some headers are forbidden by the WebView; the direct URL may still work.
          }
        }
      }
      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          updateTask(task.id, {
            receivedBytes: event.loaded,
            totalBytes: event.total,
            status: 'running'
          })
        } else {
          updateTask(task.id, { receivedBytes: event.loaded, status: 'running' })
        }
      }
      xhr.onerror = () => {
        activeRequests.delete(task.id)
        reject(new Error('网络下载失败'))
      }
      xhr.onabort = () => {
        activeRequests.delete(task.id)
        reject(new Error('下载已取消'))
      }
      xhr.onload = async () => {
        activeRequests.delete(task.id)
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`下载失败：HTTP ${xhr.status}`))
          return
        }
        try {
          const blob = xhr.response as Blob
          const mime = blob.type || xhr.getResponseHeader('content-type') || 'audio/mpeg'
          const ext = extFromMime(mime, url)
          const path = await resolveDownloadPath(task, ext)
          const rawBase64 = await blobToBase64(blob)
          const base64 = await prepareDownloadData(task, rawBase64, ext, mime)
          await completeDownload(task, path, base64, ext, mime)
          resolve()
        } catch (error) {
          reject(error)
        }
      }
      xhr.send()
    })
  }

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  async function responseToBase64(data: any): Promise<string> {
    if (typeof data === 'string') {
      return data.includes(',') ? data.slice(data.indexOf(',') + 1) : data
    }
    if (data instanceof Blob) return blobToBase64(data)
    if (data instanceof ArrayBuffer) return arrayBufferToBase64(data)
    if (ArrayBuffer.isView(data)) {
      return arrayBufferToBase64(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
    }
    throw new Error('下载响应不是二进制数据')
  }

  async function downloadWithNativeHttp(
    task: DownloadTask,
    url: string,
    headers?: Record<string, string>
  ): Promise<void> {
    updateTask(task.id, { status: 'running', receivedBytes: 0, error: undefined })
    const response = await CapacitorHttp.request({
      url,
      method: 'GET',
      headers,
      responseType: 'blob',
      connectTimeout: 30000,
      readTimeout: 120000
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`下载失败：HTTP ${response.status}`)
    }
    const mime =
      (response.headers && (response.headers['content-type'] || response.headers['Content-Type'])) ||
      'audio/mpeg'
    const ext = extFromMime(String(mime), url)
    const path = await resolveDownloadPath(task, ext)
    const rawBase64 = await responseToBase64(response.data)
    const base64 = await prepareDownloadData(task, rawBase64, ext, String(mime))
    await completeDownload(task, path, base64, ext, String(mime))
  }

  async function createDownload(track: Track, quality?: string): Promise<DownloadTask> {
    const directoryMode = settings.settings.downloadDirectoryMode
    if (directoryMode === 'saf') {
      if (Capacitor.getPlatform() !== 'android' || !Capacitor.isNativePlatform()) {
        throw new Error('SAF 下载目录仅在 Android 原生环境可用')
      }
      if (!settings.settings.safDownloadUri) throw new Error('请先选择 Android SAF 下载文件夹')
    }
    library.upsertTrack(track)
    const task: DownloadTask = {
      id: `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      trackKey: track.key,
      title: track.title,
      artist: track.artists.join(' / '),
      cover: track.artworkUrl,
      quality: quality || settings.settings.downloadQuality || settings.settings.preferredQuality || undefined,
      status: 'queued',
      directory: directoryMode,
      ...(directoryMode === 'saf' ? { safUri: settings.settings.safDownloadUri } : {}),
      receivedBytes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    tasks.value = [task, ...tasks.value]
    await persist(task)
    void runTask(task.id)
    return task
  }

  async function createBatchDownloads(items: Track[], quality?: string): Promise<number> {
    const candidates = selectBatchDownloadCandidates(items, tasks.value)
    let enqueued = 0
    for (const track of candidates) {
      await createDownload(track, quality)
      enqueued++
    }
    return enqueued
  }

  async function runTask(id: string): Promise<void> {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    if (task.status === 'completed' || task.status === 'cancelled') return
    const active = tasks.value.filter((item) => item.status === 'running')
    if (active.length >= Math.max(1, settings.settings.maxConcurrentDownloads)) {
      task.status = 'queued'
      return
    }
    const track = library.getTrack(task.trackKey)
    if (!track) {
      updateTask(id, { status: 'failed', error: '歌曲已不在资料库中' })
      return
    }
    updateTask(id, { status: 'running', receivedBytes: 0, error: undefined })
    try {
      const resolved = await pluginStore.resolve(track, task.quality)
      task.totalBytes = undefined
      if (Capacitor.isNativePlatform()) {
        await downloadWithNativeHttp(task, resolved.url, resolved.requestHeaders)
      } else {
        await downloadWithXhr(task, resolved.url, resolved.requestHeaders)
      }
      const next = tasks.value.find((item) => item.status === 'queued')
      if (next) void runTask(next.id)
    } catch (error) {
      const currentStatus = task.status as DownloadStatus
      if (currentStatus === 'cancelled' || currentStatus === 'paused') return
      updateTask(id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      })
      const next = tasks.value.find((item) => item.status === 'queued')
      if (next) void runTask(next.id)
    }
  }

  function pause(ids: string[]): void {
    for (const id of ids) {
      const task = tasks.value.find((item) => item.id === id)
      if (!task) continue
      activeRequests.get(id)?.abort()
      activeRequests.delete(id)
      if (task.status === 'running' || task.status === 'queued') updateTask(id, { status: 'paused' })
    }
  }

  function resume(ids: string[]): void {
    for (const id of ids) {
      const task = tasks.value.find((item) => item.id === id)
      if (!task) continue
      if (task.status === 'completed') continue
      updateTask(id, { status: 'queued' })
      void runTask(id)
    }
  }

  function cancel(ids: string[]): void {
    for (const id of ids) {
      activeRequests.get(id)?.abort()
      activeRequests.delete(id)
      updateTask(id, { status: 'cancelled' })
    }
  }

  function retry(ids: string[]): void {
    for (const id of ids) {
      const task = tasks.value.find((item) => item.id === id)
      if (!task || task.status === 'completed') continue
      updateTask(id, retryPatch())
      void runTask(id)
    }
  }

  async function remove(id: string, deleteFile = true): Promise<void> {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    activeRequests.get(id)?.abort()
    if (deleteFile && task.filePath) {
      try {
        if (task.directory === 'saf') {
          if (task.safUri) await deleteSafDocument(task.filePath)
        } else if (task.relativePath) {
          await Filesystem.deleteFile({ path: task.relativePath, directory: storageDirectory(task) })
        }
      } catch {
        // The file may already be gone or provider permission may have been revoked.
      }
    }
    const db = await getDb()
    await db.delete('downloads', id)
    tasks.value = tasks.value.filter((item) => item.id !== id)
  }

  async function share(id: string): Promise<void> {
    const task = tasks.value.find((item) => item.id === id)
    if (!task?.filePath) throw new Error('文件尚未下载完成')
    await Share.share({
      title: task.title,
      text: `${task.title} - ${task.artist}`,
      url: task.directory === 'saf' ? task.filePath : Capacitor.convertFileSrc(task.filePath)
    })
  }

  function play(id: string): Track | null {
    const task = tasks.value.find((item) => item.id === id)
    if (!task?.filePath || task.directory === 'saf') return null
    const track = library.getTrack(task.trackKey)
    if (!track) return null
    return { ...track, downloadedPath: task.filePath }
  }

  function asHostTasks() {
    return tasks.value.map((task) => ({
      id: task.id,
      track: library.getTrack(task.trackKey)?.raw ?? {
        ref: { providerId: 'download', kind: 'track', id: task.id },
        title: task.title,
        capabilities: []
      },
      status: task.status,
      receivedBytes: task.receivedBytes,
      totalBytes: task.totalBytes,
      error: task.error ? { code: 'INTERNAL', message: task.error } : undefined
    }))
  }

  async function createHostDownloads(request: any) {
    const result: DownloadTask[] = []
    for (const reference of request?.tracks ?? []) {
      const track =
        library.getTrack(`${reference.providerId}:${reference.id}`) ??
        library.getTrack(`${reference.pluginId}:${reference.providerId}:${reference.id}`)
      if (track) result.push(await createDownload(track, request?.quality))
    }
    return result.map((task) => ({
      id: task.id,
      track: library.getTrack(task.trackKey)?.raw ?? { ref: { providerId: 'download', kind: 'track', id: task.id }, title: task.title, capabilities: [] },
      status: task.status,
      receivedBytes: task.receivedBytes,
      totalBytes: task.totalBytes
    }))
  }

  async function clearCompleted(): Promise<void> {
    const ids = tasks.value.filter((task) => task.status === 'completed').map((task) => task.id)
    for (const id of ids) await remove(id, true)
  }

  function pauseAll(): void {
    const ids = tasks.value
      .filter((task) => task.status === 'running' || task.status === 'queued')
      .map((task) => task.id)
    if (ids.length) pause(ids)
  }

  function resumeAll(): void {
    const ids = tasks.value.filter((task) => task.status === 'paused').map((task) => task.id)
    if (ids.length) resume(ids)
  }

  async function clearQueue(): Promise<void> {
    const ids = tasks.value
      .filter((task) => task.status === 'running' || task.status === 'queued' || task.status === 'paused')
      .map((task) => task.id)
    for (const id of ids) await remove(id, true)
  }

  async function clearFailed(): Promise<void> {
    const ids = tasks.value
      .filter((task) => task.status === 'failed' || task.status === 'cancelled')
      .map((task) => task.id)
    for (const id of ids) await remove(id, true)
  }

  return {
    tasks,
    initialized,
    runningCount,
    completed,
    init,
    createDownload,
    createBatchDownloads,
    pause,
    resume,
    cancel,
    retry,
    remove,
    share,
    play,
    asHostTasks,
    createHostDownloads,
    clearCompleted,
    pauseAll,
    resumeAll,
    clearQueue,
    clearFailed
  }
})
