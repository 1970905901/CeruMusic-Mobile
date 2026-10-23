import CryptoJS from 'crypto-js'
import { gunzipWithLimit } from '@/services/gzipLimit'

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

/** 转换器的输入上限：歌单 JSON 与解压后的 `.lxmc` 都按这个卡。 */
export const MAX_CONVERTER_INPUT_BYTES = 32 * 1024 * 1024
export const MAX_CONVERTER_UNPACKED_BYTES = 64 * 1024 * 1024

export async function parsePlaylistFile(file: File): Promise<any> {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.json') && !name.endsWith('.lxmc')) {
    throw new Error('仅支持 .json 或 .lxmc 歌单文件')
  }
  if (file.size > MAX_CONVERTER_INPUT_BYTES) {
    throw new Error(
      `歌单文件超过 ${Math.round(MAX_CONVERTER_INPUT_BYTES / 1024 / 1024)} MB，请拆分后再转换`
    )
  }
  if (name.endsWith('.json')) return JSON.parse(await file.text())
  const bytes = new Uint8Array(await file.arrayBuffer())
  let unpacked: Uint8Array
  try {
    // 与歌单文件导入同一口径：压缩比可上千倍，不能直接 `gunzipSync`。
    unpacked = gunzipWithLimit(bytes, MAX_CONVERTER_UNPACKED_BYTES)
  } catch (error) {
    if (error instanceof Error && error.message.includes('解压后过大')) throw error
    // 不是 gzip 就按明文 JSON 处理（LXMC 也有未压缩的变体）。
    unpacked = bytes
  }
  return JSON.parse(new TextDecoder().decode(unpacked))
}