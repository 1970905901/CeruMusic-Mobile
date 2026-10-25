import type { Track } from '@/types/music'
import { ceruApi } from '@/services/ceruApi'
import { checkUploadImageSafe } from '@/services/nsfwCheck'

export interface CloudSongList {
  id: string
  name: string
  describe: string
  cover: string
  filePath?: string
  localId: string
  updatedAt: string
}

export interface CloudSongTypeDto {
  type: string
  size: string
}

export interface CloudSongDto {
  songmid: string
  hash?: string
  name: string
  singer: string
  albumId: string
  albumName: string
  source: string
  interval: string
  img: string
  lrc?: string
  types: CloudSongTypeDto[]
  _types?: Record<string, any>
  typeUrl?: Record<string, any>
  pluginResource?: Record<string, any>
  pos?: number
}

export interface CreateUserSongListDto {
  localId: string
  name: string
  describe: string
  cover?: string | Blob
  songlist: CloudSongDto[]
}

export interface UpdateUserSongListDto {
  listId: string
  localId?: string
  name?: string
  describe?: string
  cover?: string | Blob
  songlist?: CloudSongDto[]
}

const BASE = '/user-songlist'

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatInterval(durationMs?: number): string {
  const totalSeconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000))
  return pad(Math.floor(totalSeconds / 60)) + ':' + pad(totalSeconds % 60)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/** Local files and downloads have no provider identity the cloud can resolve. */
export function isShareableTrack(track: Track): boolean {
  return (
    !!track &&
    track.source !== 'local' &&
    !track.localUri &&
    !track.localPath &&
    !track.downloadedPath
  )
}

/** Public provider refs travel by songmid/source; private refs need the full resource. */
function isPrivateRef(ref: Track['ref']): boolean {
  return !!ref && (ref.scope !== 'provider' || ref.connectionId !== undefined)
}

export function trackToCloudSong(track: Track): CloudSongDto {
  const raw = isObject(track.raw) ? track.raw : {}
  const original = isObject(raw.ref?.data?.song) ? raw.ref.data.song : {}
  const metadata = isObject(raw.metadata) ? raw.metadata : {}
  const types: CloudSongTypeDto[] = (track.qualities || []).map((type) => {
    const sizeBytes = track.qualitySizes?.[type]
    const originalSize = isObject(original._types?.[type]) ? original._types[type].size : undefined
    const size =
      Number.isSafeInteger(sizeBytes) && sizeBytes && sizeBytes > 0
        ? formatSize(sizeBytes)
        : typeof originalSize === 'string' && originalSize.trim()
          ? originalSize
          : '未知'
    return { type, size }
  })
  const song: CloudSongDto = {
    songmid: String(track.ref?.id ?? raw.songmid ?? ''),
    name: track.title || (typeof original.name === 'string' ? original.name : '') || '未知歌曲',
    singer:
      (track.artists || []).join(' / ') ||
      (typeof original.singer === 'string' ? original.singer : '') ||
      '未知歌手',
    albumId: String(track.albumId ?? original.albumId ?? '0'),
    albumName:
      track.album || (typeof original.albumName === 'string' ? original.albumName : '') || '未知专辑',
    source: track.ref?.providerId || String(raw.source || ''),
    interval:
      (typeof original.interval === 'string' && original.interval) ||
      formatInterval(track.durationMs),
    img: track.artworkUrl || (typeof original.img === 'string' ? original.img : '') || 'default-cover',
    types
  }
  const hash = metadata.hash || original.hash
  if (hash) song.hash = String(hash)
  if (typeof original.lrc === 'string' && original.lrc) song.lrc = original.lrc
  if (isObject(original._types)) song._types = original._types
  if (isObject(raw.typeUrl)) song.typeUrl = raw.typeUrl
  if (isPrivateRef(track.ref)) song.pluginResource = JSON.parse(JSON.stringify(track.ref))
  return song
}

export function playlistTracksToCloud(tracks: readonly Track[]): CloudSongDto[] {
  return tracks.filter(isShareableTrack).map(trackToCloudSong)
}

/** Legacy cloud backends cannot distinguish two sources sharing one songmid. */
export function assertLegacySongIdentities(songs: readonly CloudSongDto[]): void {
  const ids = new Map<string, string>()
  for (const song of songs) {
    const previous = ids.get(song.songmid)
    if (previous !== undefined && previous !== song.source) {
      throw new Error('当前云端不支持同 ID 的不同来源歌曲，请升级后端')
    }
    ids.set(song.songmid, song.source)
  }
}

let capabilityCache: { value: boolean; until: number } | undefined

export async function supportsSongIdentity(): Promise<boolean> {
  if (capabilityCache && capabilityCache.until > Date.now()) return capabilityCache.value
  let value = false
  try {
    const result = await ceruApi<{ songIdentity?: number }>(BASE + '/capabilities')
    value = Number(result?.songIdentity) >= 2
  } catch {
    value = false
  }
  capabilityCache = { value, until: Date.now() + 60_000 }
  return value
}

async function prepareCloudSongs(songs: CloudSongDto[]): Promise<CloudSongDto[]> {
  if (await supportsSongIdentity()) return songs
  if (songs.some((song) => song.pluginResource)) {
    throw new Error('当前云端不支持保存私有歌曲引用，请升级后端')
  }
  assertLegacySongIdentities(songs)
  return songs
}

async function coverField(cover?: string | Blob): Promise<Blob | string | undefined> {
  if (!cover) return undefined
  if (cover instanceof Blob) return cover
  const text = String(cover).trim()
  if (!text) return undefined
  if (text.startsWith('data:') || text.startsWith('blob:')) {
    try {
      const response = await fetch(text)
      return await response.blob()
    } catch {
      return undefined
    }
  }
  return text
}

function appendCover(form: FormData, cover: Blob | string | undefined): void {
  if (!cover) return
  if (cover instanceof Blob) form.append('cover', cover, 'cover.png')
  else form.append('cover', cover)
}

/**
 * 上传封面前的鉴黄拦截（对齐桌面版 `cloudSongList.ts` 两处 `checkImageIsSafe`）。
 * 桌面版检测失败（模型加载不了等）时放行并只记警告，这里沿用同一口径。
 */
async function assertCoverSafe(cover: Blob | string | undefined): Promise<void> {
  if (!cover) return
  const result = await checkUploadImageSafe(cover)
  if (!result.safe) throw new Error('歌单封面包含违规内容，请更换图片')
  if (result.skipped) console.warn('封面安全检测未执行（放行）:', result.reason)
}

export const cloudSongListApi = {
  getUserSongLists() {
    return ceruApi<CloudSongList[]>(BASE)
  },

  getSongListDetail(id: string, sort: 'asc' | 'desc' = 'asc', limit?: number, pos?: number) {
    if (!id) throw new Error('歌单 ID 不能为空')
    const params = new URLSearchParams({ id, sort })
    if (limit !== undefined) params.set('limit', String(limit))
    if (pos !== undefined) params.set('pos', String(pos))
    return ceruApi<{ list: CloudSongDto[]; total: number }>(BASE + '/list?' + params.toString())
  },

  async createUserSongList(data: CreateUserSongListDto): Promise<CloudSongList> {
    const songlist = await prepareCloudSongs(data.songlist)
    const form = new FormData()
    form.append('localId', data.localId)
    form.append('name', data.name)
    form.append('describe', data.describe || '')
    const cover = await coverField(data.cover)
    await assertCoverSafe(cover)
    appendCover(form, cover)
    form.append('songlist', JSON.stringify(songlist))
    return ceruApi<CloudSongList>(BASE, { method: 'POST', body: form })
  },

  /**
   * 删除云端歌单。桌面版 `deleteUserSongList` 同口径（DELETE 带 `listId`）。
   *
   * 移动端此前没有这个方法：删除本地歌单只删了 IndexedDB，云端那份永远留着，
   * 而且手机上没有别的地方能删掉它——用户以为删干净了，换设备登录又冒出来。
   */
  deleteUserSongList(listId: string): Promise<unknown> {
    if (!listId) throw new Error('歌单 ID 不能为空')
    return ceruApi(BASE, {
      method: 'DELETE',
      body: JSON.stringify({ listId })
    })
  },

  async updateUserSongList(data: UpdateUserSongListDto): Promise<{ id: string; updatedAt: string }> {
    const songlist = data.songlist ? await prepareCloudSongs(data.songlist) : undefined
    const form = new FormData()
    form.append('listId', data.listId)
    if (data.localId) form.append('localId', data.localId)
    if (data.name) form.append('name', data.name)
    if (data.describe) form.append('describe', data.describe)
    const cover = await coverField(data.cover)
    await assertCoverSafe(cover)
    appendCover(form, cover)
    if (songlist) form.append('songlist', JSON.stringify(songlist))
    return ceruApi<{ id: string; updatedAt: string }>(BASE, { method: 'PATCH', body: form })
  }
}

export default cloudSongListApi
