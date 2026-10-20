import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * happy-dom 没有 IndexedDB，而 loadTrack 会异步写播放历史。
 * 沿用 localScanFilter.test.ts 的做法，用内存实现替换数据库层。
 */
vi.mock('@/services/db', () => ({
  toPlain: (value: any) => JSON.parse(JSON.stringify(value)),
  getDb: vi.fn(async () => ({
    getAll: vi.fn(async () => []),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => undefined),
    transaction: vi.fn(() => ({ store: { put: vi.fn() }, done: Promise.resolve() }))
  }))
}))

import { usePlayerStore } from './player'
import type { Track } from '@/types/music'

/**
 * 本地文件没有音质解析链路，正好用来验证「重载保留进度」这条纯状态逻辑，
 * 不必模拟插件解析。
 */
function makeLocalTrack(key: string): Track {
  return {
    key,
    ref: { providerId: 'local', id: key, kind: 'track' },
    title: key,
    artists: ['Artist'],
    qualities: [],
    playable: true,
    raw: {},
    source: 'local',
    localUri: `file:///${key}.mp3`
  }
}

describe('player quality reload', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('reloads the current track keeping position and playing state', async () => {
    const player = usePlayerStore()
    await player.playTrack(makeLocalTrack('song'))
    player.seek(5000)
    expect(player.positionMs).toBe(5000)
    expect(player.status).toBe('playing')

    const reloaded = await player.reloadCurrentTrack()

    expect(reloaded).toBe(true)
    expect(player.currentTrack?.key).toBe('song')
    expect(player.positionMs).toBe(5000)
    expect(player.status).toBe('playing')
  })

  it('keeps a paused track paused without restarting playback', async () => {
    const player = usePlayerStore()
    await player.playTrack(makeLocalTrack('song'))
    player.seek(3000)
    player.pause()
    await new Promise((resolve) => setTimeout(resolve, 20))

    const reloaded = await player.reloadCurrentTrack()

    expect(reloaded).toBe(true)
    expect(player.positionMs).toBe(3000)
    expect(player.status).toBe('paused')
  })

  it('does nothing when no track is loaded', async () => {
    const player = usePlayerStore()
    await expect(player.reloadCurrentTrack()).resolves.toBe(false)
  })
})
