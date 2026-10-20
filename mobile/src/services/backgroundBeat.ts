/**
 * Mobile counterpart of AMLL's `setLowFreqVolume`, which desktop feeds with the
 * same low-frequency value the visualizer already extracts. The behavioural
 * mapping matches the mesh renderer: the layer keeps a resting scale and
 * brightness, and low frequency pushes both up (desktop drives scale, rotation
 * and brightness together).
 */
export interface BackgroundBeatStyle {
  [variable: string]: string
}

/** Resting scale of the background layer while no beat is present. */
export const BEAT_SCALE_BASE = 1
/** Extra scale reached at full low-frequency energy. */
export const BEAT_SCALE_RANGE = 0.08
/** Resting brightness while no beat is present. */
export const BEAT_BRIGHTNESS_BASE = 0.92
/** Extra brightness reached at full low-frequency energy. */
export const BEAT_BRIGHTNESS_RANGE = 0.36

/** Attack is fast so kicks read immediately; release is slower to avoid flicker. */
const ATTACK_MS = 60
const RELEASE_MS = 260

export function clampBeat(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function beatScale(value: number): number {
  return BEAT_SCALE_BASE + clampBeat(value) * BEAT_SCALE_RANGE
}

export function beatBrightness(value: number): number {
  return BEAT_BRIGHTNESS_BASE + clampBeat(value) * BEAT_BRIGHTNESS_RANGE
}

/**
 * CSS variables consumed by the player background layers. Disabled renders an
 * empty object so unrelated styles stay untouched.
 */
export function backgroundBeatStyle(value: number, enabled: boolean): BackgroundBeatStyle {
  const level = clampBeat(value)
  if (!enabled) return {}
  return {
    '--bg-beat-scale': beatScale(level).toFixed(4),
    '--bg-beat-brightness': beatBrightness(level).toFixed(4)
  }
}

export interface BackgroundBeatSmoother {
  push(value: number, nowMs: number): number
  reset(): void
}

/**
 * Time-based exponential smoothing. Using elapsed time instead of a fixed
 * per-frame factor keeps the response stable when the analyser frame rate
 * changes (e.g. backgrounded tabs throttle `requestAnimationFrame`).
 */
export function createBackgroundBeatSmoother(initial = 0): BackgroundBeatSmoother {
  let current = clampBeat(initial)
  let lastAt = Number.NaN
  return {
    push(value: number, nowMs: number): number {
      const target = clampBeat(value)
      if (!Number.isFinite(lastAt) || nowMs <= lastAt) {
        current = target
        lastAt = Number.isFinite(nowMs) ? nowMs : lastAt
        return current
      }
      const elapsed = nowMs - lastAt
      lastAt = nowMs
      const timeConstant = target > current ? ATTACK_MS : RELEASE_MS
      const alpha = 1 - Math.exp(-elapsed / timeConstant)
      current += (target - current) * alpha
      return current
    },
    reset(): void {
      current = 0
      lastAt = Number.NaN
    }
  }
}
