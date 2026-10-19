import { CERU_API_RESOURCE } from '@/services/authClient'
import { ceruApi } from '@/services/ceruApi'

const BASE = '/share'

export interface ShareSongInfo {
  songmid: string | number
  hash?: string
  name: string
  singer: string
  albumName?: string
  albumId?: string | number
  source: string
  interval?: string
  img?: string
  types?: any[]
  _types?: Record<string, any>
  pluginResource?: Record<string, any>
  [key: string]: any
}

export interface ShareLyric {
  lrc?: string
  yrc?: string
  qrc?: string
  ttml?: string
  trans?: string
  format?: 'lrc' | 'yrc' | 'qrc' | 'ttml'
}

export interface ShareComment {
  userName: string
  avatar?: string
  text: string
  likedCount?: number
  timeStr?: string
  location?: string
}

export interface CreateSharePayload {
  pluginMd5: string
  source: string
  ttlDays: number
  quality?: string
  song: ShareSongInfo
  lyric?: ShareLyric
  hotComments?: ShareComment[]
}

export interface CreateShareResult {
  id: string
  url: string
  template: string
}

export interface ShareDetail {
  id: string
  username: string
  source: string
  quality?: string
  song: ShareSongInfo
  lyric?: ShareLyric
  hotComments?: ShareComment[]
  createdAt: number
  expiresAt: number
  audioUrl: string
  coverProxyUrl: string | null
}

export interface PlaylistShareSongInfo {
  songmid: string | number
  hash?: string
  name: string
  singer: string
  albumName: string
  albumId: string | number
  source: string
  interval: string
  img: string
  types: any[]
  pos?: number
}

export interface PlaylistShareDetail {
  id: string
  username: string
  allowWebPlayback: boolean
  canPlay: boolean
  playExpiresAt: number | null
  createdAt: number
  openInAppScheme: string
  playlist: {
    id: string
    name: string
    describe: string
    cover: string
    updatedAt: string
    total: number
    songs: PlaylistShareSongInfo[]
  }
}

export interface CreatePlaylistShareResult {
  id: string
  url: string
  template: string
  playExpiresAt: number | null
}

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const text = query.toString()
  return text ? '?' + text : ''
}

async function publicGet<T>(path: string): Promise<T> {
  const response = await fetch(CERU_API_RESOURCE + path, {
    headers: { Accept: 'application/json' }
  })
  const text = await response.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || '请求失败 (' + response.status + ')')
  }
  return (payload?.data ?? payload) as T
}

export const shareApi = {
  precheck(payload: { pluginMd5: string }) {
    return ceruApi<{ hasPlugin: boolean }>(BASE + '/precheck', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  uploadPlugin(payload: { pluginCode: string; md5: string; type: 'cr' | 'lx' }) {
    return ceruApi<{ ok: boolean; message?: string }>(BASE + '/upload-plugin', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  create(payload: CreateSharePayload) {
    return ceruApi<CreateShareResult>(BASE + '/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  createPlaylist(payload: {
    cloudPlaylistId: string
    allowWebPlayback: boolean
    ttlDays?: number
    pluginMd5?: string
    quality?: string
  }) {
    return ceruApi<CreatePlaylistShareResult>(BASE + '/playlist/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  getById(id: string) {
    return publicGet<ShareDetail>(BASE + '/' + encodeURIComponent(id))
  },

  getPlaylistById(id: string, limit?: number, pos?: number) {
    return publicGet<PlaylistShareDetail>(
      BASE + '/playlist/' + encodeURIComponent(id) + queryString({ limit, pos })
    )
  }
}

export default shareApi
