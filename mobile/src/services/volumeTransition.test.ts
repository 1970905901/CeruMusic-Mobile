import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelVolumeTransition, transitionVolume } from './volumeTransition'

function fakeAudio(volume = 1): { volume: number } {
  return { volume }
}

describe('volume transition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cancelVolumeTransition()
  })

  it('fades in toward the target volume and resolves', async () => {
    const audio = fakeAudio(0)
    const done = transitionVolume(audio as unknown as HTMLAudioElement, 0.8, true, true)
    vi.advanceTimersByTime(50 * 40)
    await done
    expect(audio.volume).toBeCloseTo(0.8, 5)
  })

  it('fades out to zero, restores the configured volume and resolves', async () => {
    const audio = fakeAudio(0.6)
    const done = transitionVolume(audio as unknown as HTMLAudioElement, 0.6, false, true)
    vi.advanceTimersByTime(50 * 30)
    await done
    expect(audio.volume).toBeCloseTo(0.6, 5)
  })

  it('cancels a pending fade without leaving a timer behind', async () => {
    const audio = fakeAudio(0)
    const done = transitionVolume(audio as unknown as HTMLAudioElement, 1, true)
    vi.advanceTimersByTime(100)
    const midway = audio.volume
    cancelVolumeTransition()
    await done
    vi.advanceTimersByTime(2000)
    expect(audio.volume).toBe(midway)
  })

  it('clamps the fade target into the 0..1 range', async () => {
    const audio = fakeAudio(0)
    const done = transitionVolume(audio as unknown as HTMLAudioElement, 4, true)
    vi.advanceTimersByTime(50 * 40)
    await done
    expect(audio.volume).toBe(1)
  })
})
