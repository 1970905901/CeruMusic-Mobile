import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { DownloadStatus, DownloadTask } from '@/types/download'
import type { LyricDocument, Track } from '@/types/music'
import { getDb, toPlain } from '@/services/db'
import { usePluginStore } from '@/stores/plugins'
import { useLibraryStore } from '@/stores/library'
import { useSettingsStore } from '@/stores/settings'
import { buildDownloadFilename } from '@/utils/filename'
import {
  isFlacFile,
  isMp3File,
  writeFlacTagsToBase64,
  writeMp3TagsToBase64,
  type WritableAudioTags
} from '@/services/audioTags'
import { isM4aFile, writeM4aTagsToBase64 } from '@/services/mp4Tags'
import { deleteSafDocument, writeSafFromApp } from '@/services/safImport'
import { parseLyrics } from '@/services/lyrics'
import { blobToDataUrl } from '@/services/imageUtils'
import { embedsAnyTag, serializeTagLyrics, tagLyricExtension } from '@/services/tagWriteOptions'
import { selectTasksToRequeue, selectTasksToStart } from '@/services/downloadPump'
import { resolveTrackQuality } from '@/services/batchDownloadQuality'
import {
  MISSING_DOWNLOAD_MESSAGE,
  isMissingFileError,
  tasksNeedingValidation
} from '@/services/downloadValidation'

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
  /** 正在执行中的任务 id：防止同一任务被并发拉起两次。 */
  const inFlight = new Set<string>()

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
      // 桌面版 %u 取歌曲来源；移动端用音源名，缺失时由模板兜底。
      platform:
        pluginStore.selectedProvider(track?.ref?.providerId ?? '')?.providerName ||
        track?.ref?.providerId,
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

  /**
   * 解析下载时需要的歌词文档，供内嵌与「单独下载歌词文件」共用。
   * 与桌面版 DownloadManager 的 lyricFetcher 同口径：失败不阻断下载，只记警告。
   */
  async function resolveTagLyric(
    task: DownloadTask,
    track: Track | undefined
  ): Promise<LyricDocument | null> {
    if (!track) return null
    try {
      const localLyrics = typeof track.raw?.lrc === 'string' ? track.raw.lrc : ''
      if (localLyrics) return parseLyrics(localLyrics)
      return parseLyrics(await pluginStore.lyrics(track))
    } catch (error) {
      console.warn('获取下载歌词失败', error)
      return null
    }
  }

  /**
   * 拉取封面并转成 data URL 以便嵌入标签。跨域直链拿不到时返回 undefined，
   * 与桌面版一致——封面失败不影响音频与歌词写入。
   */
  async function resolveTagCover(task: DownloadTask): Promise<string | undefined> {
    const url = task.cover
    if (!url) return undefined
    if (url.startsWith('data:')) return url
    try {
      const response = await CapacitorHttp.request({
        url,
        method: 'GET',
        responseType: 'blob',
        connectTimeout: 15000,
        readTimeout: 30000
      })
      if (response.status < 200 || response.status >= 300) return undefined
      const data = response.data
      if (data instanceof Blob) return await blobToDataUrl(data)
      const mime =
        response.headers?.['content-type'] || response.headers?.['Content-Type'] || 'image/jpeg'
      const base64 = await responseToBase64(data)
      return `data:${mime};base64,${base64}`
    } catch (error) {
      console.warn('获取下载封面失败', error)
      return undefined
    }
  }

  async function prepareDownloadData(
    task: DownloadTask,
    base64: string,
    ext: string,
    mime: string
  ): Promise<string> {
    const options = settings.tagWriteOptions
    if (!embedsAnyTag(options)) return base64
    const isMp3 = isMp3File(`download.${ext}`, mime)
    const isFlac = isFlacFile(`download.${ext}`, mime)
    const isM4a = isM4aFile(`download.${ext}`, mime)
    if (!isMp3 && !isFlac && !isM4a) return base64
    const track = library.getTrack(task.trackKey)
    try {
      const tags: WritableAudioTags = {
        ...(options.basicInfo
          ? {
              title: task.title,
              artists: task.artist.split(/\s*\/\s*/).filter(Boolean),
              album: track?.album
            }
          : {}),
        ...(options.cover ? { coverDataUrl: await resolveTagCover(task) } : {}),
        ...(options.lyrics
          ? {
              lyrics: serializeTagLyrics(
                await resolveTagLyric(task, track),
                options.lyricFormat
              ) || undefined
            }
          : {})
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

  /** 音频文件同一路径下的同名歌词文件路径。 */
  function sidecarLyricPath(audioPath: string, extension: string): string {
    const slash = audioPath.lastIndexOf('/')
    const dot = audioPath.lastIndexOf('.')
    const base = dot > slash ? audioPath.slice(0, dot) : audioPath
    return `${base}.${extension}`
  }

  /**
   * 「单独下载歌词文件」：与桌面版 downloadWorker 一样，在音频同目录写一份同名歌词。
   * 失败只记警告——歌词是附赠品，不能因为它让已完成的下载变成失败。
   */
  async function writeSidecarLyric(task: DownloadTask, audioPath: string): Promise<void> {
    const options = settings.tagWriteOptions
    if (!options.downloadLyrics) return
    const track = library.getTrack(task.trackKey)
    try {
      const text = serializeTagLyrics(await resolveTagLyric(task, track), options.lyricFormat)
      if (!text) return
      const path = sidecarLyricPath(audioPath, tagLyricExtension(options))
      if (task.directory === 'saf') {
        if (!task.safUri) return
        const stagingPath = `saf-staging/${task.id}.${tagLyricExtension(options)}`
        await Filesystem.writeFile({
          path: stagingPath,
          data: text,
          directory: Directory.Data,
          encoding: Encoding.UTF8,
          recursive: true
        })
        try {
          await writeSafFromApp({
            sourcePath: stagingPath,
            treeUri: task.safUri,
            relativePath: path,
            mime: 'text/plain'
          })
        } finally {
          await Filesystem.deleteFile({ path: stagingPath, directory: Directory.Data }).catch(
            () => undefined
          )
        }
        return
      }
      await Filesystem.writeFile({
        path,
        data: text,
        directory: storageDirectory(task),
        encoding: Encoding.UTF8,
        recursive: true
      })
    } catch (error) {
      console.warn('写入歌词文件失败', error)
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
        await writeSidecarLyric(task, result.relativePath)
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
    await writeSidecarLyric(task, path)
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

  /**
   * 原生 HTTP 下载。`CapacitorHttp` 不支持中止，暂停/取消只能改状态；
   * 请求返回后必须再确认一次任务是否仍是 running，否则一次已经取消的任务
   * 会在后台下载完成后被写回「已完成」，甚至在用户删掉它之后重新出现在列表里。
   */
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
    // 传输期间用户可能已暂停/取消/删除该任务；此时不写文件、不改状态。
    const current = tasks.value.find((item) => item.id === task.id)
    if (!current || current.status !== 'running') return
    const base64 = await prepareDownloadData(task, rawBase64, ext, String(mime))
    if (!tasks.value.some((item) => item.id === task.id && item.status === 'running')) return
    await completeDownload(task, path, base64, ext, String(mime))
  }

  /**
   * 校验已完成的任务，文件已被删除/移动的改判为失败（桌面版 `validateFiles`）。
   *
   * 移动到「已完成」分页时调用。只有确认为「不存在」才改判——权限抖动或
   * 原生桥接异常都当作无法确认而保持原样，避免把整页下载凭空标成失败。
   */
  async function validateFiles(): Promise<number> {
    let changed = 0
    for (const task of tasksNeedingValidation(tasks.value)) {
      try {
        await Filesystem.stat({
          path: task.relativePath as string,
          directory: storageDirectory(task)
        })
      } catch (error) {
        if (!isMissingFileError(error)) {
          console.warn('无法确认下载文件是否存在', task.id, error)
          continue
        }
        updateTask(task.id, { status: 'failed', error: MISSING_DOWNLOAD_MESSAGE })
        // 歌曲上挂着的下载地址同样失效了；不清掉的话点播放还是会走那个已不存在的路径。
        const track = library.getTrack(task.trackKey)
        if (track && track.downloadedRelativePath === task.relativePath) {
          library.upsertTrack({
            ...track,
            downloadedPath: undefined,
            downloadedRelativePath: undefined
          })
        }
        changed++
      }
    }
    return changed
  }

  /**
   * 调整同时下载数，对齐桌面版 `setMaxConcurrentDownloads`：
   * - 调小后若在途任务多于新上限，把**最后开始**的退回队列（不是直接砍掉）；
   * - 随后补位，调大时立刻把排队中的任务拉起来，不必等当前任务结束。
   */
  function setMaxConcurrent(value: number): void {
    const limit = Math.max(1, Math.min(5, Math.trunc(value) || 1))
    settings.settings.maxConcurrentDownloads = limit
    for (const id of selectTasksToRequeue(tasks.value, limit)) {
      activeRequests.get(id)?.abort()
      activeRequests.delete(id)
      updateTask(id, { status: 'queued', receivedBytes: 0 })
    }
    pumpQueue()
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

  /**
   * 批量下载。`quality` 给定时对**每首歌**各自降级到它支持的档位
   * （桌面版 `handleDownloadBatch` 的 `calculateBestQuality`），
   * 而不是把同一个档位硬塞给所有歌。
   */
  async function createBatchDownloads(
    items: Track[],
    quality?: string,
    qualityOrder: readonly string[] = []
  ): Promise<number> {
    const candidates = selectBatchDownloadCandidates(items, tasks.value)
    let enqueued = 0
    for (const track of candidates) {
      const perTrack = quality
        ? resolveTrackQuality(track, quality, qualityOrder) ?? quality
        : undefined
      await createDownload(track, perTrack)
      enqueued++
    }
    return enqueued
  }

  /**
   * 并发位空出来后补位。
   *
   * 暂停/取消一个正在运行的任务会腾出一个位置，但此前没有任何人接手，
   * 队列里剩下的歌要等到下一次有任务结束才会动——`pauseAll` 后恢复、
   * 或取消一个任务时尤其明显。这里在状态变化后统一拉起可开始的任务。
   */
  function pumpQueue(): void {
    const ids = selectTasksToStart(tasks.value, settings.settings.maxConcurrentDownloads)
    for (const id of ids) void runTask(id)
  }

  async function runTask(id: string): Promise<void> {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    if (task.status === 'completed' || task.status === 'cancelled') return
    // 原生 HTTP 请求无法中止：暂停后 iframe 仍在跑，若此时恢复又拉一次，
    // 两次传输会同时写同一个文件。用一张「在途」表保证同一任务只有一条链路。
    if (inFlight.has(id)) return
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
    inFlight.add(id)
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
    } finally {
      inFlight.delete(id)
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
    pumpQueue()
  }

  function resume(ids: string[]): void {
    for (const id of ids) {
      const task = tasks.value.find((item) => item.id === id)
      if (!task) continue
      if (task.status === 'completed') continue
      updateTask(id, { status: 'queued' })
      void runTask(id)
    }
    // 恢复的这些任务可能因为并发已满而退回 queued，补位一次让它们按顺序排上。
    pumpQueue()
  }

  function cancel(ids: string[]): void {
    for (const id of ids) {
      activeRequests.get(id)?.abort()
      activeRequests.delete(id)
      updateTask(id, { status: 'cancelled' })
    }
    pumpQueue()
  }

  function retry(ids: string[]): void {
    for (const id of ids) {
      const task = tasks.value.find((item) => item.id === id)
      if (!task || task.status === 'completed') continue
      updateTask(id, retryPatch())
      void runTask(id)
    }
  }

  /**
   * 重新下载一个已完成的任务（文件损坏、想换音质重下）。
   *
   * 与 `retry` 不同：`retry` 明确跳过已完成的任务，这里要把它退回队列。
   * 先删掉旧文件再入队：`resolveDownloadPath` 是按「同名文件是否已存在」挑名字的，
   * 旧文件留着就会写成「歌名 (1).mp3」，点一次「重新下载」反而多出一份。
   * 代价是重下失败时旧文件已经没了——但任务会留在列表里可再次重试，
   * 比悄悄堆一份重复文件更诚实。
   */
  async function redownload(id: string): Promise<void> {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    try {
      if (task.directory === 'saf') {
        if (task.filePath) await deleteSafDocument(task.filePath)
      } else if (task.relativePath) {
        await Filesystem.deleteFile({
          path: task.relativePath,
          directory: storageDirectory(task)
        })
      }
    } catch {
      // 文件可能已被用户删掉；无论是否存在都继续重下。
    }
    updateTask(id, {
      ...retryPatch(),
      filePath: undefined,
      relativePath: undefined,
      totalBytes: undefined
    })
    void runTask(id)
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
    // 删除一个正在下载的任务同样空出了并发位；不补位的话队列会停在这里。
    pumpQueue()
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
    validateFiles,
    setMaxConcurrent,
    createDownload,
    createBatchDownloads,
    pause,
    resume,
    cancel,
    retry,
    redownload,
    remove,
    share,
    play,
    asHostTasks,
    createHostDownloads,
    clearCompleted,
    pauseAll,
    resumeAll,
    clearQueue,
    clearFailed,
    pumpQueue
  }
})
