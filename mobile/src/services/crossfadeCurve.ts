/**
 * Desktop `utils/audio/crossfade.ts` decision logic, kept free of player state so
 * the timing rules can be tested on their own. The orchestration that actually
 * overlaps two audio slots lives in the player store.
 */

/** Enters the observation window this many seconds before the track ends. */
export const OBSERVATION_WINDOW_SEC = 15
/** A quiet moment may start the transition from here on. */
export const QUIET_REMAINING_SEC = 13
/** Hard deadline: every long enough track gets a full transition. */
export const FORCED_REMAINING_SEC = 12
/** Last resort if the quiet and forced checks were missed. */
export const EMERGENCY_REMAINING_SEC = 8
/** Averaged RMS below this counts as a quiet section. */
export const QUIET_RMS = 0.04
/** Tracks shorter than this are never crossfaded. */
export const MIN_SONG_DURATION_SEC = 25
export const MIN_FADE_TIME_SEC = 6
export const MAX_FADE_TIME_SEC = 12
/** Keeps the fade clear of the very end so the new track starts before silence. */
export const FADE_SAFETY_MARGIN_SEC = 0.3

export interface CrossfadeMarkRange {
  start: number
  end: number
}

export function fadeDuration(remainingSec: number): number {
  if (!Number.isFinite(remainingSec)) return MIN_FADE_TIME_SEC
  return Math.min(
    MAX_FADE_TIME_SEC,
    Math.max(MIN_FADE_TIME_SEC, remainingSec - FADE_SAFETY_MARGIN_SEC)
  )
}

/**
 * Progress-bar preview range: from the earliest possible quiet trigger to the
 * guaranteed forced trigger. Returns null when the current track cannot crossfade.
 */
export function markRange(durationSec: number): CrossfadeMarkRange | null {
  if (!Number.isFinite(durationSec) || durationSec < MIN_SONG_DURATION_SEC) return null
  const start = Math.max(0, durationSec - OBSERVATION_WINDOW_SEC)
  const end = Math.max(start, durationSec - FORCED_REMAINING_SEC)
  return { start, end }
}

export interface CrossfadeObservation {
  durationSec: number
  remainingSec: number
  avgRms: number
}

/** Any of the three desktop rules starts the transition. */
export function shouldTrigger(observation: CrossfadeObservation): boolean {
  const { remainingSec, avgRms } = observation
  if (!Number.isFinite(remainingSec) || remainingSec <= 0) return false
  if (remainingSec <= EMERGENCY_REMAINING_SEC) return true
  if (remainingSec <= FORCED_REMAINING_SEC) return true
  return avgRms < QUIET_RMS && remainingSec <= QUIET_REMAINING_SEC
}

/** Tracks shorter than the desktop minimum never crossfade at all. */
export function canCrossfade(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec >= MIN_SONG_DURATION_SEC
}

const CURVE_SAMPLES = 256

export interface CrossfadeCurves {
  /** 1 -> 0 for the outgoing track. */
  fadeOut: Float32Array
  /** 0 -> 1 for the incoming track. */
  fadeIn: Float32Array
}

/**
 * Equal-power curves warped by smoothstep so both ends change slowly and the
 * middle moves fastest; `cos² + sin² = 1` keeps the summed loudness constant.
 */
function buildCurves(): CrossfadeCurves {
  const fadeOut = new Float32Array(CURVE_SAMPLES)
  const fadeIn = new Float32Array(CURVE_SAMPLES)
  for (let index = 0; index < CURVE_SAMPLES; index += 1) {
    const t = index / (CURVE_SAMPLES - 1)
    const smooth = t * t * (3 - 2 * t)
    fadeOut[index] = Math.cos((smooth * Math.PI) / 2)
    fadeIn[index] = Math.sin((smooth * Math.PI) / 2)
  }
  return { fadeOut, fadeIn }
}

export const crossfadeCurves: CrossfadeCurves = buildCurves()

/** Averaged RMS of an analyser time-domain frame, matching the desktop watcher. */
export function timeDomainRms(values: ArrayLike<number>): number {
  if (!values.length) return 0
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    const normalized = values[index] / 128 - 1
    sum += normalized * normalized
  }
  return Math.sqrt(sum / values.length)
}

/** Rolling window average; desktop keeps the last 10 samples. */
export const RMS_WINDOW_SIZE = 10

export function pushRmsSample(window: number[], value: number): number {
  window.push(value)
  if (window.length > RMS_WINDOW_SIZE) window.shift()
  let total = 0
  for (const sample of window) total += sample
  return total / Math.max(1, window.length)
}
