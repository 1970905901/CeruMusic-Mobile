import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type CrossfadeElement,
  type CrossfadeHost,
  cancelCrossfade,
  crossfadeState,
  initCrossfade,
  isCrossfadeBusy,
  notifyCrossfadeTimeUpdate
} from './crossfade'
import {
  fadeDuration,
  FORCED_REMAINING_SEC,
  MIN_SONG_DURATION_SEC,
  OBSERVATION_WINDOW_SEC,
  QUIET_REMAINING_SEC
} from './crossfadeCurve'
import type { Track } from '@/types/music'

class FakeElement implements CrossfadeElement {
  src = ''
  volume = 1
  currentTime = 0
  playbackRate = 1
  duration = 200
  playing = false
  loadCalls = 0
  private ended: Array<() => void> = []
  playError: Error | null = null

  play(): Promise<void> {
    if (this.playError) return Promise.reject(this.playError)
    this.playing = true
    return Promise.resolve()
  }

  pause(): void {
    this.playing = false
  }

  load(): void {
    this.loadCalls += 1
  }

  removeAttribute(): void {
    this.src = ''
  }

  addEventListener(_type: 'ended', listener: () => void): void {
    this.ended.push(listener)
  }

  emitEnded(): void {
    this.ended.forEach((listener) => listener())
  }
}

function makeSong(name: string): Track {
  return {
    key: name,
    ref: { providerId: 'p', id: name },
    title: name,
    artists: ['a'],
    qualities: ['320k']
  } as Track
}

interface Harness {
  host: CrossfadeHost
  element: FakeElement
  tails: FakeElement[]
  state: {
    advanceCalls: number
    advancedKey: string | null
    peekCalls: number
    releases: number
    restores: number
    advanceSucceeds: boolean
    avgRms: number
    enabled: boolean
    next: Track | null
    retain: { source: string; positionSec: number } | null
    tailPlayError: Error | null
  }
}

let handedOverPosition = 0
let handedOverKey: string | null = null

function makeHarness(overrides: Partial<Harness['state']> = {}): Harness {
  const element = new FakeElement()
  const tails: FakeElement[] = []
  const state: Harness['state'] = {
    advanceCalls: 0,
    advancedKey: null,
    peekCalls: 0,
    releases: 0,
    restores: 0,
    advanceSucceeds: true,
    avgRms: 0.01,
    enabled: true,
    next: makeSong('next'),
    retain: { source: 'blob:old', positionSec: 186 },
    tailPlayError: null,
    ...overrides
  }
  const host: CrossfadeHost = {
    getElement: () => element,
    getVolume: () => 0.8,
    getPlaybackRate: () => 1,
    isEnabled: () => state.enabled,
    peekNext: () => {
      state.peekCalls += 1
      return state.next
    },
    readAverageRms: () => state.avgRms,
    retainOutgoing: () => state.retain,
    releaseOutgoing: () => {
      state.releases += 1
      state.retain = null
    },
    restoreOutgoing: () => {
      state.restores += 1
    },
    createTailElement: () => {
      const tail = new FakeElement()
      tail.playError = state.tailPlayError
      tails.push(tail)
      return tail
    },
    advanceToNext: async (track: Track) => {
      state.advanceCalls += 1
      state.advancedKey = track.key
      if (!state.advanceSucceeds) return false
      handedOverPosition = element.currentTime
      element.src = 'blob:new'
      element.currentTime = 0
      element.duration = 210
      return true
    }
  }
  return { host, element, tails, state }
}

/** 进入观察窗口：默认落在安静触发点（剩余 13s）。 */
function enterWindow(element: FakeElement, remaining = QUIET_REMAINING_SEC): void {
  element.currentTime = element.duration - remaining
}

describe('crossfade orchestration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    handedOverPosition = 0
    handedOverKey = null
  })

  afterEach(() => {
    cancelCrossfade()
    vi.useRealTimers()
  })

  it('ignores tracks outside the observation window', async () => {
    const { host, element, tails, state } = makeHarness()
    initCrossfade(host)
    enterWindow(element, OBSERVATION_WINDOW_SEC + 5)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(5000)
    expect(state.advanceCalls).toBe(0)
    expect(tails).toHaveLength(0)
  })

  it('ignores tracks that are too short to crossfade', async () => {
    const { host, element, state } = makeHarness()
    initCrossfade(host)
    element.duration = 20
    enterWindow(element, 10)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(5000)
    expect(state.advanceCalls).toBe(0)
  })

  it('does not schedule while the setting is disabled', async () => {
    const { host, element, state } = makeHarness({ enabled: false })
    initCrossfade(host)
    enterWindow(element)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(5000)
    expect(state.advanceCalls).toBe(0)
  })

  it('does not schedule when nothing follows the current track', async () => {
    const { host, element, state } = makeHarness({ next: null })
    initCrossfade(host)
    enterWindow(element)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(5000)
    expect(state.advanceCalls).toBe(0)
  })

  it('pre-loads the outgoing track as soon as the observation window opens', async () => {
    const { host, element, tails } = makeHarness()
    initCrossfade(host)
    enterWindow(element)
    notifyCrossfadeTimeUpdate()
    expect(tails).toHaveLength(1)
    expect(tails[0].src).toBe('blob:old')
    expect(tails[0].volume).toBe(0)
  })

  it('starts the fade on a quiet moment and swaps the main element to the next song', async () => {
    const { host, element, tails, state } = makeHarness({ avgRms: 0.01 })
    initCrossfade(host)
    enterWindow(element)
    notifyCrossfadeTimeUpdate()

    await vi.advanceTimersByTimeAsync(150)
    expect(state.advanceCalls).toBe(1)
    expect(element.src).toBe('blob:new')
    expect(tails).toHaveLength(1)
    // The tail continues from the position the old song had when it was handed over.
    expect(tails[0].currentTime).toBe(handedOverPosition)
    expect(tails[0].playing).toBe(true)
    expect(isCrossfadeBusy()).toBe(true)
    // The song picked when the window opened is the one that gets loaded,
    // and it is picked exactly once (so shuffle cannot drift mid-window).
    expect(state.peekCalls).toBe(1)
    expect(state.advancedKey).toBe('next')
  })

  it('waits for the forced deadline when the tail of the track is loud', async () => {
    const { host, element, state } = makeHarness({ avgRms: 0.5 })
    initCrossfade(host)
    enterWindow(element, OBSERVATION_WINDOW_SEC)
    notifyCrossfadeTimeUpdate()

    // Still inside the quiet window but loud: no fade yet.
    await vi.advanceTimersByTimeAsync(200)
    expect(state.advanceCalls).toBe(0)

    element.currentTime = element.duration - FORCED_REMAINING_SEC
    await vi.advanceTimersByTimeAsync(200)
    expect(state.advanceCalls).toBe(1)
  })

  it('falls back to the time rules when the audio cannot be analysed', async () => {
    const { host, element, state } = makeHarness({ avgRms: Number.POSITIVE_INFINITY })
    initCrossfade(host)
    enterWindow(element, OBSERVATION_WINDOW_SEC)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(200)
    expect(state.advanceCalls).toBe(0)

    element.currentTime = element.duration - FORCED_REMAINING_SEC
    await vi.advanceTimersByTimeAsync(200)
    expect(state.advanceCalls).toBe(1)
  })

  it('restores the main volume and releases the retained source once the fade completes', async () => {
    const { host, element, tails, state } = makeHarness()
    initCrossfade(host)
    enterWindow(element, 12)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(150)
    expect(state.advanceCalls).toBe(1)

    // Fade duration for 12s remaining is clamped to the 12s desktop maximum.
    await vi.advanceTimersByTimeAsync(12_000)
    expect(isCrossfadeBusy()).toBe(false)
    expect(state.releases).toBe(1)
    expect(element.volume).toBeCloseTo(0.8, 5)
    expect(tails[0].volume).toBeCloseTo(0, 5)
    expect(tails[0].playing).toBe(false)
  })

  it('finishes early when the outgoing track runs out first', async () => {
    const { host, element, tails, state } = makeHarness()
    initCrossfade(host)
    enterWindow(element, 12)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(150)
    expect(tails).toHaveLength(1)

    tails[0].emitEnded()
    expect(isCrossfadeBusy()).toBe(false)
    expect(state.releases).toBe(1)
  })

  it('rolls back to the plain track change when the next song cannot be loaded', async () => {
    const { host, element, state } = makeHarness({ advanceSucceeds: false })
    initCrossfade(host)
    enterWindow(element, QUIET_REMAINING_SEC)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(150)

    expect(state.advanceCalls).toBe(1)
    expect(isCrossfadeBusy()).toBe(false)
    // 交接未完成：音源交还播放器，不能回收。
    expect(state.restores).toBe(1)
    expect(state.releases).toBe(0)
    expect(element.volume).toBeCloseTo(0.8, 5)
  })

  it('rolls back without touching the queue when the outgoing tail cannot play', async () => {
    const { host, element, state } = makeHarness({ tailPlayError: new Error('blocked') })
    initCrossfade(host)
    enterWindow(element, QUIET_REMAINING_SEC)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(150)

    expect(state.advanceCalls).toBe(0)
    expect(state.restores).toBe(1)
    expect(state.releases).toBe(0)
    expect(element.volume).toBeCloseTo(0.8, 5)
  })

  it('cancels a scheduled fade when the user seeks back out of the window', async () => {
    const { host, element, state } = makeHarness()
    initCrossfade(host)
    enterWindow(element, 10)
    notifyCrossfadeTimeUpdate()

    element.currentTime = 20
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(5000)
    expect(state.advanceCalls).toBe(0)
  })

  it('cancels an in-flight fade without leaving a running envelope', async () => {
    const { host, element, tails, state } = makeHarness()
    initCrossfade(host)
    enterWindow(element, 12)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(150)
    expect(isCrossfadeBusy()).toBe(true)

    cancelCrossfade()
    expect(isCrossfadeBusy()).toBe(false)
    // 交接已完成，旧歌只在尾巴上，可以回收。
    expect(state.releases).toBe(1)
    expect(state.restores).toBe(0)
    expect(element.volume).toBeCloseTo(0.8, 5)
    expect(tails[0].playing).toBe(false)

    const volumeAfterCancel = element.volume
    await vi.advanceTimersByTimeAsync(20_000)
    expect(element.volume).toBe(volumeAfterCancel)
  })

  it('exposes the progress-bar preview range and clears it when crossing over', async () => {
    const { host, element } = makeHarness()
    initCrossfade(host)
    notifyCrossfadeTimeUpdate()
    expect(crossfadeState.markStart).toBe(element.duration - OBSERVATION_WINDOW_SEC)
    expect(crossfadeState.markEnd).toBe(element.duration - FORCED_REMAINING_SEC)

    enterWindow(element, QUIET_REMAINING_SEC)
    notifyCrossfadeTimeUpdate()
    expect(crossfadeState.scheduled).toBe(true)
    await vi.advanceTimersByTimeAsync(150)

    // 交接后主元素已是新歌，预告区间按新歌时长重算，开头出现淡入区间。
    expect(crossfadeState.active).toBe(true)
    expect(crossfadeState.scheduled).toBe(false)
    expect(crossfadeState.markStart).toBe(210 - OBSERVATION_WINDOW_SEC)
    expect(crossfadeState.fadeInMarkEnd).toBeGreaterThan(0)
  })

  it('keeps the preview range empty for tracks too short to crossfade', () => {
    const { host, element } = makeHarness()
    initCrossfade(host)
    element.duration = MIN_SONG_DURATION_SEC - 1
    notifyCrossfadeTimeUpdate()
    expect(crossfadeState.markStart).toBe(0)
    expect(crossfadeState.markEnd).toBe(0)
  })

  it('hides the preview range while the setting is off', () => {
    const { host } = makeHarness({ enabled: false })
    initCrossfade(host)
    notifyCrossfadeTimeUpdate()
    expect(crossfadeState.markStart).toBe(0)
    expect(crossfadeState.markEnd).toBe(0)
  })

  it('auto-clears the fade-in mark after the hold window', async () => {
    const { host, element } = makeHarness()
    initCrossfade(host)
    enterWindow(element, 12)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(150)

    // 标记覆盖真实的淡化时长（剩余 12s 减去安全边距），并在其后 8 秒清除。
    const fadeTime = crossfadeState.fadeInMarkEnd
    expect(fadeTime).toBeCloseTo(fadeDuration(12), 5)
    await vi.advanceTimersByTimeAsync((fadeTime + 8) * 1000)
    expect(crossfadeState.fadeInMarkEnd).toBe(0)
  })

  it('drops every progress-bar mark when the fade is cancelled', async () => {
    const { host, element } = makeHarness()
    initCrossfade(host)
    enterWindow(element, 12)
    notifyCrossfadeTimeUpdate()
    await vi.advanceTimersByTimeAsync(150)
    expect(crossfadeState.fadeInMarkEnd).toBeGreaterThan(0)

    cancelCrossfade()
    expect(crossfadeState.active).toBe(false)
    expect(crossfadeState.fadeInMarkEnd).toBe(0)
    expect(crossfadeState.markStart).toBe(0)
    expect(crossfadeState.markEnd).toBe(0)
  })
})
