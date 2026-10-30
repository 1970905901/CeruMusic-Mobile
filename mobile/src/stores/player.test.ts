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

describe('player queue append', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('appends to the end instead of jumping the queue', () => {
    // 桌面 `addToPlaylistEnd` 加在队尾；移动端此前只有「下一首播放」。
    const player = usePlayerStore()
    player.insertNext(makeLocalTrack('first'))
    expect(player.appendToQueue(makeLocalTrack('second'))).toBe(true)
    expect(player.queue.map((track) => track.key)).toEqual(['first', 'second'])
  })

  it('refuses a duplicate instead of queueing it twice', () => {
    const player = usePlayerStore()
    player.insertNext(makeLocalTrack('first'))
    expect(player.appendToQueue(makeLocalTrack('first'))).toBe(false)
    expect(player.queue.filter((track) => track.key === 'first')).toHaveLength(1)
  })

  it('removes queued songs by reference, the shape the SDK sends', () => {
    // SDK 的 `queue.remove` 收 `ResourceRef[]`。此前实现读的是 key 列表，
    // 插件按契约传引用时一个都匹配不上——歌没删掉，却返回成功。
    const player = usePlayerStore()
    player.appendToQueue(makeLocalTrack('a'))
    player.appendToQueue(makeLocalTrack('b'))
    player.removeHostTracksRefs([{ providerId: 'local', kind: 'track', id: 'a' }])
    expect(player.queue.map((track) => track.key)).toEqual(['b'])
  })

  it('refuses to remove an unknown reference instead of silently skipping it', () => {
    const player = usePlayerStore()
    player.appendToQueue(makeLocalTrack('a'))
    expect(() =>
      player.removeHostTracksRefs([{ providerId: 'local', kind: 'track', id: 'missing' }])
    ).toThrow('歌曲不在播放队列中')
    expect(player.queue.map((track) => track.key)).toEqual(['a'])
  })

  it('reorders by reference order and rejects an incomplete list', () => {
    const player = usePlayerStore()
    player.appendToQueue(makeLocalTrack('a'))
    player.appendToQueue(makeLocalTrack('b'))
    player.reorderHostTracksRefs([
      { providerId: 'local', kind: 'track', id: 'b' },
      { providerId: 'local', kind: 'track', id: 'a' }
    ])
    expect(player.queue.map((track) => track.key)).toEqual(['b', 'a'])
    // 少给一条时必须报错：静默「保持原样」会让插件以为排序生效了。
    expect(() =>
      player.reorderHostTracksRefs([{ providerId: 'local', kind: 'track', id: 'b' }])
    ).toThrow('排序必须包含当前队列的全部歌曲')
  })

  it('points at the only track when the queue was empty', () => {
    // 空队列时下标必须落到 0，否则「播放」按钮点了没有当前曲。
    const player = usePlayerStore()
    expect(player.queue).toHaveLength(0)
    expect(player.appendToQueue(makeLocalTrack('only'))).toBe(true)
    expect(player.currentIndex).toBe(0)
    expect(player.currentTrack?.key).toBe('only')
  })
})

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
