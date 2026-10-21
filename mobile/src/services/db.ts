import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { PluginRecord } from '@/types/plugin'
import type { FavoriteEntry, HistoryEntry, Playlist, Track } from '@/types/music'
import type { DownloadTask, LocalTrackRecord } from '@/types/download'

interface CeruMobileDB extends DBSchema {
  plugins: {
    key: string
    value: PluginRecord
  }
  kv: {
    key: string
    value: unknown
  }
  tracks: {
    key: string
    value: Track
    indexes: { 'by-plugin': string }
  }
  playlists: {
    key: string
    value: Playlist
  }
  favorites: {
    key: string
    value: FavoriteEntry
  }
  history: {
    key: string
    value: HistoryEntry
    indexes: { 'by-played-at': number }
  }
  downloads: {
    key: string
    value: DownloadTask
    indexes: { 'by-created-at': number }
  }
  localTracks: {
    key: string
    value: LocalTrackRecord
    indexes: { 'by-created-at': number }
  }
}

let dbPromise: Promise<IDBPDatabase<CeruMobileDB>> | null = null

export function toPlain<T>(value: T): T {
  if (value === null || value === undefined) return value
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

export function getDb(): Promise<IDBPDatabase<CeruMobileDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CeruMobileDB>('ceru-music-mobile', 1, {
      upgrade(db) {
        db.createObjectStore('plugins', { keyPath: 'key' })
        db.createObjectStore('kv')
        const tracks = db.createObjectStore('tracks', { keyPath: 'key' })
        tracks.createIndex('by-plugin', 'pluginKey')
        db.createObjectStore('playlists', { keyPath: 'id' })
        db.createObjectStore('favorites', { keyPath: 'key' })
        const history = db.createObjectStore('history', { keyPath: 'id' })
        history.createIndex('by-played-at', 'playedAt')
        const downloads = db.createObjectStore('downloads', { keyPath: 'id' })
        downloads.createIndex('by-created-at', 'createdAt')
        const local = db.createObjectStore('localTracks', { keyPath: 'key' })
        local.createIndex('by-created-at', 'createdAt')
      }
    })
  }
  return dbPromise
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb()
  const value = await db.get('kv', key)
  return value === undefined ? fallback : (value as T)
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.put('kv', toPlain(value), key)
}

export async function kvDelete(key: string): Promise<void> {
  const db = await getDb()
  await db.delete('kv', key)
}

export async function clearPluginKv(pluginKey: string): Promise<void> {
  const db = await getDb()
  const keys = await db.getAllKeys('kv')
  const tx = db.transaction('kv', 'readwrite')
  for (const key of keys) {
    if (isPluginKvKey(String(key), pluginKey)) await tx.store.delete(key)
  }
  await tx.done
}

/**
 * 判断某个 kv 键是否属于指定插件。
 *
 * 键形如 plugin:<pluginKey>:<userKey>。插件 key 之间可能互为前缀
 * （例如 a 与 a:b），因此必须按「plugin:<key>:」整段前缀匹配，
 * 不能只判断 startsWith(pluginKey)。
 */
export function isPluginKvKey(key: string, pluginKey: string): boolean {
  if (!pluginKey) return false
  return key.startsWith('plugin:' + pluginKey + ':')
}
