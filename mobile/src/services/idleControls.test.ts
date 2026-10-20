import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_HIDE_DELAY_MS, createIdleControls } from './idleControls'

describe('idle controls', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(overrides: Partial<Parameters<typeof createIdleControls>[0]> = {}) {
    const onIdle = vi.fn()
    const onActive = vi.fn()
    const controller = createIdleControls({ enabled: true, suspended: false, onIdle, onActive, ...overrides })
    return { controller, onIdle, onActive }
  }

  it('hides the chrome after the desktop 3 second delay', () => {
    const { controller, onIdle } = setup()
    controller.poke()
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(controller.isIdle).toBe(true)
  })

  it('reveals the chrome again on the next interaction', () => {
    const { controller, onIdle, onActive } = setup()
    controller.poke()
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS)
    expect(onIdle).toHaveBeenCalledTimes(1)
    controller.poke()
    expect(onActive).toHaveBeenCalledTimes(1)
    expect(controller.isIdle).toBe(false)
  })

  it('never hides while suspended and restores visible chrome', () => {
    const onIdle = vi.fn()
    const onActive = vi.fn()
    let suspended = false
    const controller = createIdleControls({
      enabled: true,
      get suspended() {
        return suspended
      },
      onIdle,
      onActive
    })
    controller.poke()
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS)
    expect(onIdle).toHaveBeenCalledTimes(1)
    suspended = true
    controller.poke()
    expect(onActive).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS * 2)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('does nothing when disabled', () => {
    const { controller, onIdle } = setup({ enabled: false })
    controller.poke()
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS * 2)
    expect(onIdle).not.toHaveBeenCalled()
    expect(controller.isIdle).toBe(false)
  })

  it('clears pending work when deactivated', () => {
    const { controller, onIdle } = setup()
    controller.poke()
    controller.deactivate()
    vi.advanceTimersByTime(AUTO_HIDE_DELAY_MS * 2)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
