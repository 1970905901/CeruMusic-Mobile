/** Desktop parity: ~20 steps @ 50ms for plain transitions, 30 for longer ones. */
const STEP_MS = 50

let activeTimer: ReturnType<typeof setInterval> | null = null
let activeResolve: (() => void) | null = null

function settle(): void {
  if (activeTimer) clearInterval(activeTimer)
  activeTimer = null
  const resolve = activeResolve
  activeResolve = null
  resolve?.()
}

export function cancelVolumeTransition(): void {
  settle()
}

/**
 * Fades an element between its current volume and `volume`.
 * A pending fade is cancelled first so overlapping toggles never stack timers.
 */
export function transitionVolume(
  audio: HTMLAudioElement,
  volume: number,
  target: boolean = true,
  lengthen: boolean = false
): Promise<void> {
  cancelVolumeTransition()
  const safeVolume = Math.max(0, Math.min(1, volume))
  const steps = lengthen ? (target ? 40 : 30) : 20
  return new Promise((resolve) => {
    activeResolve = resolve
    activeTimer = setInterval(() => {
      if (target) {
        audio.volume = Math.min(audio.volume + safeVolume / steps, safeVolume)
        if (audio.volume >= safeVolume) settle()
        return
      }
      audio.volume = Math.max(audio.volume - safeVolume / steps, 0)
      if (audio.volume <= 0) {
        audio.volume = safeVolume
        settle()
      }
    }, STEP_MS)
  })
}
