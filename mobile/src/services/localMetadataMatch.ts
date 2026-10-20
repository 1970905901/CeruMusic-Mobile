import type { Track } from '@/types/music'

const UNKNOWN_TITLES = new Set(['未知曲目', 'unknown title', 'unknown'])
const UNKNOWN_ARTISTS = new Set(['未知艺术家', 'unknown artist', 'unknown'])

/** Minimum score required before an online result is written to a local track. */
export const MIN_MATCH_SCORE = 0.5

export interface LocalMetadataMatchProgress {
  processed: number
  total: number
  matched: number
}

export interface LocalMetadataMatchResult {
  processed: number
  total: number
  matched: number
}

export interface LocalMetadataMatchOptions {
  /** Local tracks to match; already filtered to those missing metadata. */
  tracks: Track[]
  /** Searches one source and returns candidate tracks. */
  search: (query: string) => Promise<Track[]>
  /** Resolves lyrics for a picked candidate; failures must not abort the run. */
  lyrics: (track: Track) => Promise<string>
  /**
   * Persists matched metadata for one local track. Receives the local track and
   * the picked candidate so the caller decides which fields to fill.
   */
  apply: (track: Track, picked: Track, metadata: { cover?: string; lyrics?: string }) => Promise<boolean>
  concurrency?: number
  minScore?: number
  onProgress?: (progress: LocalMetadataMatchProgress) => void
}

function normalizeText(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/[（(\[【][^）)\]】]*[）)\]】]/g, ' ')
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUnknown(value: string | undefined, unknowns: Set<string>): boolean {
  const normalized = normalizeText(value)
  return !normalized || unknowns.has(normalized)
}

function fileNameStem(path: string | undefined): string {
  if (!path) return ''
  const name = path.split(/[\\/]/).pop() || ''
  return name.replace(/\.[^.]+$/, '')
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeText(value).split(' ').filter(Boolean))
}

function textRatio(left: string, right: string): number {
  const a = normalizeText(left)
  const b = normalizeText(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9
  const leftTokens = tokenSet(a)
  const rightTokens = tokenSet(b)
  let shared = 0
  for (const token of leftTokens) if (rightTokens.has(token)) shared++
  const denominator = Math.max(leftTokens.size, rightTokens.size)
  return denominator ? (shared / denominator) * 0.8 : 0
}

function durationProximity(left: number | undefined, right: number | undefined): number {
  if (!left || !right) return 0.5
  const deltaSeconds = Math.abs(left - right) / 1000
  if (deltaSeconds <= 5) return 1
  if (deltaSeconds >= 60) return 0
  return 1 - (deltaSeconds - 5) / 55
}

/** True when the embedded title could not be read and should be filled online. */
export function hasUnknownTitle(track: Track): boolean {
  return isUnknown(track.title, UNKNOWN_TITLES)
}

/** True when the embedded artist could not be read and should be filled online. */
export function hasUnknownArtist(track: Track): boolean {
  return isUnknown(track.artists?.[0], UNKNOWN_ARTISTS)
}

/** A local track needs online matching when a core field is missing or unknown. */
export function needsMetadataMatch(track: Track): boolean {
  if (!track.artworkUrl) return true
  if (!track.album) return true
  return hasUnknownTitle(track) || hasUnknownArtist(track)
}

/**
 * Query used to look the local file up online. Falls back to the file name when
 * the embedded title or artist could not be read.
 */
export function buildMatchQuery(track: Track): string {
  const stem = fileNameStem(track.localPath || track.localUri)
  const title = isUnknown(track.title, UNKNOWN_TITLES) ? stem : track.title
  const artist = isUnknown(track.artists?.[0], UNKNOWN_ARTISTS) ? '' : track.artists.join(' ')
  return `${title} ${artist}`.trim()
}

/** Weighted title/artist/duration score between a local track and a candidate. */
export function scoreMatch(track: Track, candidate: Track): number {
  const titleScore = textRatio(track.title, candidate.title)
  const artistScore = textRatio(track.artists?.[0] || '', candidate.artists?.[0] || '')
  return titleScore * 0.55 + artistScore * 0.3 + durationProximity(track.durationMs, candidate.durationMs) * 0.15
}

/** Highest scoring candidate, or null when nothing reaches the score floor. */
export function pickBestMatch(
  track: Track,
  candidates: Track[],
  minScore = MIN_MATCH_SCORE
): Track | null {
  let best: Track | null = null
  let bestScore = minScore
  for (const candidate of candidates) {
    const score = scoreMatch(track, candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

/**
 * Matches every track against one source, applying cover and lyrics as they are
 * found. Individual failures are counted as unmatched and never abort the run.
 */
export async function runLocalMetadataMatch(
  options: LocalMetadataMatchOptions
): Promise<LocalMetadataMatchResult> {
  const total = options.tracks.length
  const concurrency = Math.max(1, options.concurrency ?? 2)
  let processed = 0
  let matched = 0

  for (let index = 0; index < total; index += concurrency) {
    const chunk = options.tracks.slice(index, index + concurrency)
    await Promise.all(
      chunk.map(async (track) => {
        try {
          const query = buildMatchQuery(track)
          if (!query) return
          const candidates = await options.search(query)
          const picked = pickBestMatch(track, candidates || [], options.minScore)
          if (!picked) return
          let lyrics = ''
          try {
            lyrics = await options.lyrics(picked)
          } catch {
            // Cover matching still succeeds when the source has no lyrics.
          }
          const applied = await options.apply(track, picked, {
            cover: picked.artworkUrl || '',
            lyrics
          })
          if (applied) matched++
        } catch {
          // Network or plugin failures leave the track unchanged.
        } finally {
          processed++
          options.onProgress?.({ processed, total, matched })
        }
      })
    )
  }

  return { processed, total, matched }
}
