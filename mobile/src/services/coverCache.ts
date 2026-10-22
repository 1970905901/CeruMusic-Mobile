import { CapacitorHttp } from '@capacitor/core'
import { getDb } from '@/services/db'
import { blobToDataUrl } from '@/services/imageUtils'

/**
 * 封面缓存：内存 LRU + IndexedDB 落盘。
 *
 * 对齐桌面版 v2.2.0「封面也纳入缓存：下载后落盘，下次播放直接读本地」（`CoverCache.ts`）。
 * 移动端此前完全依赖 WebView 自身的 HTTP 缓存，而图片 CDN 大多带短期 cache-control，
 * 过一段时间再打开旧歌单就会出现封面加载失败——桌面端正是为修这个问题才做的落盘缓存。
 *
 * 只缓存**远程图片 URL 的结果**；本地文件与 data: 地址不经过这里。
 */

const MEMORY_LIMIT_BYTES = 8 * 1024 * 1024
const DISK_LIMIT_BYTES = 120 * 1024 * 1024
/** 超过这个大小不缓存：太大的一张图会把预算吃掉，且多半不是封面。 */
const MAX_ENTRY_BYTES = 2 * 1024 * 1024

export interface CoverCacheEntry {
  /** 原始图片地址，作为主键。 */
  url: string
  /** base64（不含 data: 前缀），可直接拼成 data URL 或写文件。 */
  data: string
  mime: string
  bytes: number
  /** 最近一次使用时间，用于淘汰。 */
  usedAt: number
}

export interface CoverMemoryCache {
  get(url: string): string | undefined
  set(url: string, dataUrl: string): void
  readonly size: number
  clear(): void
}

/**
 * 只缓存值得缓存的地址：远程 http(s) 图片。
 * `data:` 本身就是内联数据，`blob:`/本地路径不需要网络，重复缓存只会浪费空间。
 */
export function isCacheableCoverUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  const value = url.trim()
  if (!value) return false
  return /^https?:\/\//i.test(value)
}

/** 按字节从旧到新挑出应当淘汰的条目，直到总量回到上限以内。 */
export function selectEvictions(
  entries: readonly CoverCacheEntry[],
  limitBytes: number
): CoverCacheEntry[] {
  const total = entries.reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0)
  if (total <= limitBytes) return []
  const oldestFirst = [...entries].sort((left, right) => left.usedAt - right.usedAt)
  const victims: CoverCacheEntry[] = []
  let remaining = total
  for (const entry of oldestFirst) {
    if (remaining <= limitBytes) break
    victims.push(entry)
    remaining -= Number(entry.bytes) || 0
  }
  return victims
}

/** base64 的字节数（不含 padding 误差可以忽略，这里按精确算式）。 */
export function base64Bytes(data: string): number {
  const text = String(data || '')
  if (!text) return 0
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((text.length * 3) / 4) - padding)
}

/** 从 data URL 拆出 mime 与 base64；不是 data URL 时返回 null。 */
export function splitDataUrl(value: string): { mime: string; data: string } | null {
  const text = String(value || '')
  if (!text.startsWith('data:')) return null
  const comma = text.indexOf(',')
  if (comma < 0) return null
  const header = text.slice(5, comma)
  const mime = header.split(';')[0] || 'image/jpeg'
  return { mime, data: text.slice(comma + 1) }
}

export function buildDataUrl(mime: string, data: string): string {
  return `data:${mime || 'image/jpeg'};base64,${data}`
}

/**
 * 有界内存 LRU：命中即提升到最近使用位置，超预算淘汰最旧的一条。
 * 纯逻辑，便于单测（真正的落盘在 coverCacheStore）。
 */
export function createCoverMemoryCache(limitBytes = MEMORY_LIMIT_BYTES): CoverMemoryCache {
  const map = new Map<string, { dataUrl: string; bytes: number }>()
  let total = 0
  return {
    get(url: string) {
      const hit = map.get(url)
      if (!hit) return undefined
      map.delete(url)
      map.set(url, hit)
      return hit.dataUrl
    },
    set(url: string, dataUrl: string) {
      const bytes = dataUrl.length
      if (bytes > limitBytes) return
      const previous = map.get(url)
      if (previous) {
        total -= previous.bytes
        map.delete(url)
      }
      map.set(url, { dataUrl, bytes })
      total += bytes
      while (total > limitBytes && map.size > 0) {
        const oldest = map.keys().next()
        if (oldest.done) break
        const entry = map.get(oldest.value)
        map.delete(oldest.value)
        total -= entry?.bytes ?? 0
      }
    },
    get size() {
      return map.size
    },
    clear() {
      map.clear()
      total = 0
    }
  }
}

// ---------------------------------------------------------------------------
// 磁盘层：IndexedDB 的 covers store。与内存层分开，便于在 node 测试里替换。
// ---------------------------------------------------------------------------

let memory: CoverMemoryCache | null = null
let evictionScheduled = false

function memoryCache(): CoverMemoryCache {
  if (!memory) memory = createCoverMemoryCache()
  return memory
}

/** 测试用：重置内存层。 */
export function resetCoverMemoryCache(): void {
  memoryCache().clear()
}

/**
 * 读取封面。命中内存直接返回；否则查磁盘，命中后回填内存。
 * 任何失败都当作未命中——封面是装饰品，不能因为它阻断界面。
 */
export async function getCachedCover(url: unknown): Promise<string | undefined> {
  if (!isCacheableCoverUrl(url)) return undefined
  const hot = memoryCache().get(url)
  if (hot) return hot
  try {
    const db = await getDb()
    const entry = await db.get('covers', url)
    if (!entry?.data) return undefined
    const dataUrl = buildDataUrl(entry.mime, entry.data)
    memoryCache().set(url, dataUrl)
    // 更新使用时间，让淘汰反映真实使用；失败不影响返回。
    void db
      .put('covers', { ...entry, usedAt: Date.now() })
      .catch(() => undefined)
    return dataUrl
  } catch {
    return undefined
  }
}

/** 写入封面（只在拿到完整 data URL 时调用）。旧条目会被覆盖。 */
export async function putCachedCover(url: unknown, dataUrl: string): Promise<void> {
  if (!isCacheableCoverUrl(url)) return
  const parts = splitDataUrl(dataUrl)
  if (!parts?.data) return
  const bytes = base64Bytes(parts.data)
  if (bytes <= 0 || bytes > MAX_ENTRY_BYTES) return
  memoryCache().set(url, dataUrl)
  try {
    const db = await getDb()
    await db.put('covers', {
      url,
      data: parts.data,
      mime: parts.mime,
      bytes,
      usedAt: Date.now()
    })
  } catch {
    return
  }
  scheduleEviction()
}

/** 淘汰放到下一个宏任务，避免每次写入都全表扫描。 */
function scheduleEviction(): void {
  if (evictionScheduled) return
  evictionScheduled = true
  setTimeout(() => {
    evictionScheduled = false
    void enforceCoverCacheLimit()
  }, 2000)
}

/** 把磁盘缓存压回上限以内，返回删掉的条数。 */
export async function enforceCoverCacheLimit(
  limitBytes = DISK_LIMIT_BYTES
): Promise<number> {
  try {
    const db = await getDb()
    const entries = await db.getAll('covers')
    const victims = selectEvictions(entries as CoverCacheEntry[], limitBytes)
    if (!victims.length) return 0
    const tx = db.transaction('covers', 'readwrite')
    for (const entry of victims) await tx.store.delete(entry.url)
    await tx.done
    return victims.length
  } catch {
    return 0
  }
}

/** 设置页「清空缓存」用；返回删除条数与释放字节。 */
export async function clearCoverCache(): Promise<{ deleted: number; freedBytes: number }> {
  memoryCache().clear()
  try {
    const db = await getDb()
    const entries = await db.getAll('covers')
    const freedBytes = entries.reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0)
    await db.clear('covers')
    return { deleted: entries.length, freedBytes }
  } catch {
    return { deleted: 0, freedBytes: 0 }
  }
}

/**
 * 拉取远程封面并写进缓存，返回可直接用于 <img> 的地址。
 *
 * 与桌面版一致：先给正常 URL 让浏览器立刻显示（它自己的 HTTP 缓存仍生效），
 * 同时后台抓一份落盘；下次同一个 URL 就能直接命中本地，避开 CDN 的短期缓存过期。
 * 抓取失败时静默返回原 URL——封面加载不能因为缓存出错而失败。
 */
export async function fetchAndCacheCover(url: string): Promise<void> {
  if (!isCacheableCoverUrl(url)) return
  // 已在缓存里就不必再抓。
  if (await getCachedCover(url)) return
  try {
    const response = await CapacitorHttp.request({
      url,
      method: 'GET',
      responseType: 'blob',
      connectTimeout: 15000,
      readTimeout: 30000
    })
    if (response.status < 200 || response.status >= 300) return
    // 只缓存真正的图片：CDN 的 HTML 错误页/JSON 报错也能返回 200，
    // 存进来之后这张封面永远加载失败，且占着缓存预算。
    const declared = String(
      response.headers?.['content-type'] || response.headers?.['Content-Type'] || ''
    ).toLowerCase()
    if (declared && !declared.startsWith('image/')) return
    const data = response.data
    let dataUrl: string
    if (data instanceof Blob) {
      dataUrl = await blobToDataUrl(data)
    } else {
      const mime =
        response.headers?.['content-type'] || response.headers?.['Content-Type'] || 'image/jpeg'
      const base64 =
        typeof data === 'string'
          ? data.slice(data.indexOf(',') + 1)
          : bytesToBase64(data as ArrayBufferLike | ArrayBufferView)
      dataUrl = buildDataUrl(String(mime), base64)
    }
    await putCachedCover(url, dataUrl)
  } catch {
    // 网络或跨域限制导致的失败都忽略：原 URL 仍可显示。
  }
}

function bytesToBase64(value: ArrayBufferLike | ArrayBufferView): string {
  const bytes = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value as ArrayBuffer)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export async function getCoverCacheStats(): Promise<{ entries: number; bytes: number }> {
  try {
    const db = await getDb()
    const entries = await db.getAll('covers')
    return {
      entries: entries.length,
      bytes: entries.reduce((sum, entry) => sum + (Number(entry.bytes) || 0), 0)
    }
  } catch {
    return { entries: 0, bytes: 0 }
  }
}
