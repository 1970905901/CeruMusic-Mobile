/** Desktop parity: the player chrome fades after 3s without interaction. */
export const AUTO_HIDE_DELAY_MS = 3000

export interface IdleControlsOptions {
  enabled: boolean
  suspended: boolean
  onIdle: () => void
  onActive: () => void
  delayMs?: number
}

/**
 * Tracks a single auto-hide timer. `suspended` mirrors desktop's
 * `disableAutoHide` (open sheets/menus) and always restores the controls.
 */
export function createIdleControls(options: IdleControlsOptions) {
  const delayMs = options.delayMs ?? AUTO_HIDE_DELAY_MS
  let timer: ReturnType<typeof setTimeout> | null = null
  let idle = false

  function clear(): void {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function wake(): void {
    if (idle) {
      idle = false
      options.onActive()
    }
  }

  function deactivate(): void {
    clear()
    wake()
  }

  function schedule(): void {
    clear()
    if (!options.enabled || options.suspended || idle) return
    timer = setTimeout(() => {
      timer = null
      if (!options.enabled || options.suspended) return
      idle = true
      options.onIdle()
    }, delayMs)
  }

  /** Any touch/scroll resets the countdown, like desktop's mousemove handler. */
  function poke(): void {
    if (idle) {
      idle = false
      options.onActive()
    }
    schedule()
  }

  return {
    poke,
    deactivate,
    get isIdle(): boolean {
      return idle
    }
  }
}
