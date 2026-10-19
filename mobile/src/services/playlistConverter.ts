import CryptoJS from 'crypto-js'
import { gunzipSync } from 'fflate'

const SECRET_KEY = 'CeruMusic-PlaylistSecretKey'

export interface ConvertedPlaylistSong {
  songmid: string
  singer: string
  name: string
  albumName: string
  albumId?: string
  source: string
  interval: string
  img: string
  lrc: null
  types: Record<string, { size: string }>
  _types?: unknown
  typeUrl: Record<string, unknown>
  url: string
}

function convertQualityTypes(qualities: any): Record<string, { size: string }> {
  const types: Record<string, { size: string }> = {}
  if (!Array.isArray(qualities)) return { '128k': { size: '未知' } }
  for (const quality of qualities) {
    if (typeof quality?.type !== 'string') continue
    const value = quality.type.toLowerCase()
    if (value.includes('flac')) types[value.includes('24') ? 'flac24bit' : 'flac'] = { size: '未知' }
    else if (value.includes('320')) types['320k'] = { size: '未知' }
    else if (value.includes('128')) types['128k'] = { size: '未知' }
    else types[value] = { size: '未知' }
  }
  return Object.keys(types).length ? types : { '128k': { size: '未知' } }
}
export function convertPlaylist(input: any): ConvertedPlaylistSong[] {
  const playlist = input?.type === 'playListPart_v2' && input.data ? input.data : input
  if (!Array.isArray(playlist?.list)) throw new Error('原始歌单格式无效')
  return playlist.list.map((song: any) => {
    const meta = song?.meta || {}
    return {
      songmid: String(meta.hash ?? meta.songId ?? ''),
      singer: String(song?.singer ?? '未知艺术家'),
      name: String(song?.name ?? '未知歌曲'),
      albumName: String(meta.albumName ?? '未知专辑'),
      albumId: meta.albumId ? String(meta.albumId) : undefined,
      source: String(song?.source ?? 'unknown'),
      interval: String(song?.interval ?? '0:00'),
      img: String(meta.picUrl ?? ''),
      lrc: null,
      types: convertQualityTypes(meta.qualitys),
      _types: meta._qualitys,
      typeUrl: {},
      url: ''
    }
  })
}

export function encryptPlaylist(songs: ConvertedPlaylistSong[]): string {
  return CryptoJS.AES.encrypt(JSON.stringify(songs), SECRET_KEY).toString()
}

export async function parsePlaylistFile(file: File): Promise<any> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.json')) return JSON.parse(await file.text())
  if (name.endsWith('.lxmc')) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let unpacked: Uint8Array
    try {
      unpacked = gunzipSync(bytes)
    } catch {
      unpacked = bytes
    }
    return JSON.parse(new TextDecoder().decode(unpacked))
  }
  throw new Error('仅支持 .json 或 .lxmc 歌单文件')
}