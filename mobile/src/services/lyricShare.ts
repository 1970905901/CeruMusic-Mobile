import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import type { LyricLine, Track } from '@/types/music'

export interface LyricShareOptions {
  track?: Track | null
  lines: LyricLine[]
  selectedIndices: Set<number> | number[]
  includeTranslation?: boolean
  includeRomanization?: boolean
  includeTimestamp?: boolean
  plainTextFallback?: string
}

export function formatLyricTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const totalCs = Math.floor(ms / 10)
  const cs = totalCs % 100
  const totalSec = Math.floor(totalCs / 100)
  const sec = totalSec % 60
  const min = Math.floor(totalSec / 60)
  return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}]`
}

export function buildLyricShareText(options: LyricShareOptions): string {
  const {
    track,
    lines,
    selectedIndices,
    includeTranslation = true,
    includeRomanization = false,
    includeTimestamp = false,
    plainTextFallback = ''
  } = options

  const out: string[] = []

  if (track?.title) {
    const artistPart = track.artists?.length ? ` - ${track.artists.join(' / ')}` : ''
    const albumPart = track.album ? ` (${track.album})` : ''
    out.push(`《${track.title}》${artistPart}${albumPart}`)
    out.push('')
  }

  const indexSet = selectedIndices instanceof Set ? selectedIndices : new Set(selectedIndices)

  if (lines.length > 0) {
    const sortedIndices = Array.from(indexSet).sort((a, b) => a - b)
    for (const idx of sortedIndices) {
      const line = lines[idx]
      if (!line || !line.text?.trim()) continue
      const prefix = includeTimestamp ? `${formatLyricTimestamp(line.startMs)} ` : ''
      out.push(prefix + line.text.trim())

      const indent = includeTimestamp ? '          ' : ''
      if (includeTranslation && line.translation?.trim()) {
        out.push(indent + line.translation.trim())
      }
      if (includeRomanization && line.romanization?.trim()) {
        out.push(indent + line.romanization.trim())
      }
    }
  } else if (plainTextFallback?.trim()) {
    out.push(plainTextFallback.trim())
  }

  return out.join('\n').trim()
}

export async function copyLyricText(text: string): Promise<boolean> {
  if (!text.trim()) return false
  try {
    await Clipboard.write({ string: text })
    return true
  } catch {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // fallback
    }
    return false
  }
}

export async function shareLyricText(title: string, text: string): Promise<boolean> {
  if (!text.trim()) return false
  try {
    await Share.share({
      title,
      text,
      dialogTitle: '分享歌词'
    })
    return true
  } catch {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text })
        return true
      }
    } catch {
      // ignore
    }
    return false
  }
}