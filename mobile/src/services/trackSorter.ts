import type { Track } from '@/types/music'

export type TrackSortType =
  | 'default'
  | 'title_asc'
  | 'title_desc'
  | 'artist_asc'
  | 'artist_desc'
  | 'album_asc'
  | 'album_desc'
  | 'duration_asc'
  | 'duration_desc'

export interface TrackSortOption {
  type: TrackSortType
  label: string
}

export const TRACK_SORT_OPTIONS: TrackSortOption[] = [
  { type: 'default', label: '默认顺序' },
  { type: 'title_asc', label: '歌曲名 (A - Z)' },
  { type: 'title_desc', label: '歌曲名 (Z - A)' },
  { type: 'artist_asc', label: '歌手名 (A - Z)' },
  { type: 'artist_desc', label: '歌手名 (Z - A)' },
  { type: 'album_asc', label: '专辑名 (A - Z)' },
  { type: 'album_desc', label: '专辑名 (Z - A)' },
  { type: 'duration_asc', label: '时长 (从短到长)' },
  { type: 'duration_desc', label: '时长 (从长到短)' }
]

function cleanStr(s: string | undefined): string {
  return (s || '').replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim()
}

function getPriority(s: string): number {
  if (!s) return 4
  const first = s.charAt(0)
  if (/[0-9]/.test(first)) return 0
  if (/[A-Z]/.test(first)) return 1
  if (/[a-z]/.test(first)) return 2
  return 3 // 中文及其他
}

function compareStrings(str1: string | undefined, str2: string | undefined, asc: boolean): number {
  const c1 = cleanStr(str1)
  const c2 = cleanStr(str2)
  if (!c1 && !c2) return 0
  if (!c1) return 1
  if (!c2) return -1

  const p1 = getPriority(c1)
  const p2 = getPriority(c2)
  if (p1 !== p2) {
    return asc ? p1 - p2 : p2 - p1
  }

  return asc ? c1.localeCompare(c2, 'zh-CN') : c2.localeCompare(c1, 'zh-CN')
}

export function sortTracks(tracks: Track[], sortType: TrackSortType): Track[] {
  if (!tracks.length || sortType === 'default') {
    return [...tracks]
  }

  const list = [...tracks]
  list.sort((a, b) => {
    switch (sortType) {
      case 'title_asc':
        return compareStrings(a.title, b.title, true)
      case 'title_desc':
        return compareStrings(a.title, b.title, false)
      case 'artist_asc':
        return compareStrings(
          a.artists?.join('/') || a.subtitle,
          b.artists?.join('/') || b.subtitle,
          true
        )
      case 'artist_desc':
        return compareStrings(
          a.artists?.join('/') || a.subtitle,
          b.artists?.join('/') || b.subtitle,
          false
        )
      case 'album_asc':
        return compareStrings(a.album, b.album, true)
      case 'album_desc':
        return compareStrings(a.album, b.album, false)
      case 'duration_asc': {
        const d1 = a.durationMs ?? 0
        const d2 = b.durationMs ?? 0
        return d1 - d2
      }
      case 'duration_desc': {
        const d1 = a.durationMs ?? 0
        const d2 = b.durationMs ?? 0
        return d2 - d1
      }
      default:
        return 0
    }
  })

  return list
}