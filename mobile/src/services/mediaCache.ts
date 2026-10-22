import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Track } from '@/types/music'
import { isAudioContentType, notAudioMessage } from '@/services/downloadContentType'

export interface MediaCacheIndexEntry {
  key: string
  requestUrl: string
  mime: string
  quality: string
  sizeBytes: number
  hits: number
  createdAt: number
  lastAccess: number
}

export interface MediaCacheStats {
  supported: boolean
  entries: number
  sizeBytes: number
  /** 各音质占用的条目与字节数，供设置页画音质占比图 */
  qualities: Array<{ quality: string; count: number; sizeBytes: number }>
}

export interface CachedAudio {
  url: string
  mime: string
  quality: string
}

interface MediaCacheDB extends DBSchema {
  entries: {
    key: string
    value: MediaCacheIndexEntry
  }
}

const CACHE_NAME = 'ceru-media-cache-v1'
const REQUEST_ORIGIN = 'https://cache.ceru.local/audio/'
const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024

let dbPromise: Promise<IDBPDatabase<MediaCacheDB>> | null = null

function getDb(): Promise<IDBPDatabase<MediaCacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MediaCacheDB>('ceru-media-cache', 1, {
      upgrade(db) {
        db.createObjectStore('entries', { keyPath: 'key' })
      }
    })
  }
  return dbPromise
}

function cacheStorage(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches
}

export function isMediaCacheSupported(): boolean {
  return cacheStorage() !== null
}

export function buildMediaCacheRequestUrl(key: string): string {
  return REQUEST_ORIGIN + encodeURIComponent(key)
}

export function mediaCacheKeyForTrack(track: Track): string {
  const ref = track.raw?.ref ?? track.ref ?? {}
  const scope = ref.scope === 'provider' ? 'public' : 'private'
  const pluginId = scope === 'private' ? String(ref.pluginId ?? '') : ''
  const providerId = String(ref.providerId || '')
  const id = String(ref.id ?? track.key)
  return JSON.stringify(['mobile-audio', scope, pluginId, providerId, id])
}

export function isTrackCacheable(track: Track): boolean {
  return (
    !!track &&
    track.ref?.kind === 'track' &&
    !!track.ref?.providerId &&
    !!track.ref?.id &&
    !track.localUri &&
    !track.localPath &&
    !track.localRelativePath &&
    !track.downloadedPath &&
    !track.downloadedRelativePath
  )
}

export function qualityRank(quality: string, qualities: readonly string[]): number {
  const value = String(quality || '').toLowerCase()
  if (!value) return -1
  return qualities.findIndex((item) => String(item || '').toLowerCase() === value)
}

export function shouldCacheQuality(
  requestedQuality: string,
  qualities: readonly string[],
  maxQuality: string
): boolean {
  const max = String(maxQuality || '').toLowerCase()
  if (!max) return true
  const requestedRank = qualityRank(requestedQuality, qualities)
  const maxRank = qualityRank(max, qualities)
  if (requestedRank < 0 || maxRank < 0) return false
  return requestedRank <= maxRank
}

export function qualitySatisfiesRequest(
  cachedQuality: string,
  requestedQuality: string,
  qualities: readonly string[]
): boolean {
  const cachedRank = qualityRank(cachedQuality, qualities)
  const requestedRank = qualityRank(requestedQuality, qualities)
  if (cachedRank < 0 || requestedRank < 0) return cachedRank >= 0
  return cachedRank >= requestedRank
}

/**
 * LFU + LRU scoring. Pure LRU would evict a frequently played track after one
 * old access; frequency prevents that while recency breaks frequency ties.
 */
export function computeEvictionScores<T extends { hits: number; lastAccess: number }>(
  items: readonly T[]
): Map<T, number> {
  const scores = new Map<T, number>()
  if (!items.length) return scores
  let maxHits = 0
  let minTime = Infinity
  let maxTime = -Infinity
  for (const item of items) {
    maxHits = Math.max(maxHits, item.hits)
    minTime = Math.min(minTime, item.lastAccess)
    maxTime = Math.max(maxTime, item.lastAccess)
  }
  const timeSpan = maxTime - minTime
  for (const item of items) {
    const frequency = maxHits > 0 ? item.hits / maxHits : 0
    const recency = timeSpan > 0 ? (item.lastAccess - minTime) / timeSpan : 1
    scores.set(item, frequency * 0.6 + recency * 0.4)
  }
  return scores
}

export function getDefaultMediaCacheLimit(): number {
  return DEFAULT_MAX_BYTES
}

async function getCache(): Promise<Cache> {
  const storage = cacheStorage()
  if (!storage) throw new Error('当前 WebView 不支持音频缓存')
  return storage.open(CACHE_NAME)
}

async function readIndex(): Promise<MediaCacheIndexEntry[]> {
  const db = await getDb()
  return db.getAll('entries')
}

async function putIndex(entry: MediaCacheIndexEntry): Promise<void> {
  const db = await getDb()
  await db.put('entries', entry)
}

async function deleteIndex(key: string): Promise<void> {
  const db = await getDb()
  await db.delete('entries', key)
}

async function deleteCacheResponse(requestUrl: string): Promise<void> {
  await getCache().then((cache) => cache.delete(requestUrl)).catch(() => undefined)
}

async function downloadAudio(
  url: string,
  headers?: Record<string, string>
): Promise<{ buffer: ArrayBuffer; mime: string }> {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url,
      method: 'GET',
      headers,
      responseType: 'blob',
      connectTimeout: 30000,
      readTimeout: 120000
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = response.data
    const blob =
      data instanceof Blob
        ? data
        : new Blob([data as unknown as BlobPart], {
            type: response.headers?.['content-type'] || 'audio/mpeg'
          })
    const mime = String(response.headers?.['content-type'] || 'audio/mpeg')
    // 与下载同口径：200 但不是音频（登录页、JSON 报错）不能进缓存，
    // 否则这首歌的缓存永远是坏的，重播也走不出来。
    if (!isAudioContentType(mime)) throw new Error(notAudioMessage(mime))
    return { buffer: await blob.arrayBuffer(), mime }
  }
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const mime = String(response.headers.get('content-type') || 'audio/mpeg')
  if (!isAudioContentType(mime)) throw new Error(notAudioMessage(mime))
  return { buffer: await response.arrayBuffer(), mime }
}

export async function getMediaCacheStats(): Promise<MediaCacheStats> {
  if (!isMediaCacheSupported()) {
    return { supported: false, entries: 0, sizeBytes: 0, qualities: [] }
  }
  const entries = await readIndex()
  const buckets = new Map<string, { count: number; sizeBytes: number }>()
  let sizeBytes = 0
  for (const entry of entries) {
    const size = Number(entry.sizeBytes) || 0
    sizeBytes += size
    const quality = String(entry.quality || '').trim()
    const bucket = buckets.get(quality) ?? { count: 0, sizeBytes: 0 }
    bucket.count += 1
    bucket.sizeBytes += size
    buckets.set(quality, bucket)
  }
  return {
    supported: true,
    entries: entries.length,
    sizeBytes,
    qualities: [...buckets.entries()].map(([quality, bucket]) => ({ quality, ...bucket }))
  }
}

export async function getCachedAudio(
  track: Track,
  requestedQuality: string,
  qualities: readonly string[]
): Promise<CachedAudio | null> {
  if (!isMediaCacheSupported() || !isTrackCacheable(track)) return null
  const key = mediaCacheKeyForTrack(track)
  const requestUrl = buildMediaCacheRequestUrl(key)
  const db = await getDb()
  const entry = await db.get('entries', key)
  if (!entry) return null
  if (!qualitySatisfiesRequest(entry.quality, requestedQuality, qualities)) return null
  const cache = await getCache()
  const response = await cache.match(requestUrl).catch(() => null)
  if (!response) {
    await deleteIndex(key)
    return null
  }
  const blob = await response.blob()
  entry.hits = Number(entry.hits || 0) + 1
  entry.lastAccess = Date.now()
  await putIndex(entry)
  return {
    url: URL.createObjectURL(blob),
    mime: entry.mime,
    quality: entry.quality
  }
}

export async function cacheAudio(options: {
  track: Track
  requestedQuality: string
  url: string
  headers?: Record<string, string>
  maxBytes?: number
  maxQuality?: string
}): Promise<CachedAudio | null> {
  const {
    track,
    requestedQuality,
    url,
    headers,
    maxBytes = DEFAULT_MAX_BYTES,
    maxQuality = 'flac'
  } = options
  if (
    !isMediaCacheSupported() ||
    !isTrackCacheable(track) ||
    !shouldCacheQuality(requestedQuality, track.qualities, maxQuality)
  ) {
    return null
  }
  const key = mediaCacheKeyForTrack(track)
  const requestUrl = buildMediaCacheRequestUrl(key)
  const db = await getDb()
  const existing = await db.get('entries', key)
  if (
    existing &&
    qualitySatisfiesRequest(existing.quality, requestedQuality, track.qualities)
  ) {
    return null
  }
  const download = await downloadAudio(url, headers)
  if (!download.buffer.byteLength) throw new Error('音频数据为空，未写入缓存')
  const cache = await getCache()
  const blob = new Blob([download.buffer], { type: download.mime })
  try {
    await cache.put(requestUrl, new Response(blob))
  } catch (error) {
    await deleteCacheResponse(requestUrl)
    throw error instanceof Error ? error : new Error(String(error))
  }
  const now = Date.now()
  await putIndex({
    key,
    requestUrl,
    mime: download.mime,
    quality: requestedQuality,
    sizeBytes: download.buffer.byteLength,
    hits: 1,
    createdAt: now,
    lastAccess: now
  })
  await enforceMediaCacheLimit(maxBytes)
  return {
    url: URL.createObjectURL(blob),
    mime: download.mime,
    quality: requestedQuality
  }
}

export async function enforceMediaCacheLimit(
  maxBytes = DEFAULT_MAX_BYTES
): Promise<{ evicted: number; freedBytes: number }> {
  let evicted = 0
  let freedBytes = 0
  if (!isMediaCacheSupported() || !Number.isFinite(maxBytes) || maxBytes <= 0) {
    return { evicted, freedBytes }
  }
  const entries = await readIndex()
  let total = entries.reduce((sum, entry) => sum + (Number(entry.sizeBytes) || 0), 0)
  if (total <= maxBytes) return { evicted, freedBytes }
  const cache = await getCache()
  const scores = computeEvictionScores(entries)
  const ordered = [...entries].sort((left, right) => {
    const leftScore = scores.get(left) ?? 0
    const rightScore = scores.get(right) ?? 0
    return leftScore - rightScore
  })
  for (const entry of ordered) {
    if (total <= maxBytes) break
    await cache.delete(entry.requestUrl).catch(() => undefined)
    await deleteIndex(entry.key)
    total -= Number(entry.sizeBytes) || 0
    freedBytes += Number(entry.sizeBytes) || 0
    evicted++
  }
  return { evicted, freedBytes }
}

export async function clearMediaCache(): Promise<{ deleted: number; freedBytes: number }> {
  if (!isMediaCacheSupported()) return { deleted: 0, freedBytes: 0 }
  const entries = await readIndex()
  const cache = await getCache()
  for (const entry of entries) {
    await cache.delete(entry.requestUrl).catch(() => undefined)
  }
  const db = await getDb()
  await db.clear('entries')
  return {
    deleted: entries.length,
    freedBytes: entries.reduce((sum, entry) => sum + (Number(entry.sizeBytes) || 0), 0)
  }
}
