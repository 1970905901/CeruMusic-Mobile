import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { planQueueReplace } from './hostQueueReplace'

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

import { usePlayerStore } from '@/stores/player'
import type { Track } from '@/types/music'

/**
 * 插件 `queue.replace` 之后「正在播放的是哪一首」。
 *
 * 桌面 `services.queue.*` 只替换列表（`store.list = incoming`），不碰播放；
 * 移动端的 `currentIndex` 是唯一事实来源，`currentTrack`、播放页、迷你播放器
 * 与 `player.getState` 全从它推导。此前无条件写 0：插件换掉队列后界面报的歌
 * 与实际出声的歌不是同一首——点暂停停的是旧歌、点下一首跳过一首、
 * 播放历史记错。队列被清空时下标还停在 0，指向一首不存在的歌。
 */

/**
 * 本地曲目：`prepareSource` 直接给 file:// 地址，不必模拟插件解析。
 *
 * key 取 `rawEntityToTrack` 对 `{ providerId: 'local', id }` 算出来的同一个值，
 * 这样「换队列后当前歌还在不在里面」是在同一条 key 规则上比较。
 */
function localTrack(id: string): Track {
  return {
    key: `local:local:${id}`,
    ref: { providerId: 'local', kind: 'track', id } as Track['ref'],
    title: id,
    artists: ['Artist'],
    qualities: [],
    playable: true,
    raw: {},
    source: 'local',
    localUri: `file:///${id}.mp3`
  }
}

function entity(id: string) {
  return {
    ref: { providerId: 'local', kind: 'track', id },
    title: id,
    playable: true,
    capabilities: [],
    metadata: { artists: ['Artist'], album: { id: '', title: '' }, artworkUrl: '', qualities: [] }
  }
}

describe('planQueueReplace', () => {
  it('keeps pointing at the song that is still playing', () => {
    // 换队列时当前歌还在里面：下标跟着走，音频不动。
    expect(planQueueReplace(['b', 'a', 'c'], 'a', true)).toEqual({ index: 1, stopAudio: false })
  })

  it('stops the old audio when the current song was replaced', () => {
    // 旧歌不在新队列里，而它还在出声：必须停，否则界面报 B、耳朵里是 A。
    expect(planQueueReplace(['b', 'c'], 'a', true)).toEqual({ index: 0, stopAudio: true })
  })

  it('does not bark at audio that was never loaded', () => {
    // 冷启动从存档恢复队列：有下标但没有音频，没有东西要停。
    expect(planQueueReplace(['b', 'c'], 'a', false)).toEqual({ index: 0, stopAudio: false })
  })

  it('reports an empty queue as -1 instead of pointing at nothing', () => {
    expect(planQueueReplace([], 'a', true)).toEqual({ index: -1, stopAudio: true })
  })

  it('takes the first slot when nothing was loaded before', () => {
    expect(planQueueReplace(['b', 'c'], null, false)).toEqual({ index: 0, stopAudio: false })
  })
})

describe('replaceHostQueue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('keeps the playing song current when the plugin keeps it in the queue', async () => {
    const player = usePlayerStore()
    await player.playTrack(localTrack('a'))
    expect(player.currentTrack?.key).toBe('local:local:a')

    await player.replaceHostQueue([entity('b'), entity('a')])

    expect(player.queue.map((item) => item.key)).toEqual(['local:local:b', 'local:local:a'])
    expect(player.currentTrack?.key).toBe('local:local:a')
    expect(player.status).toBe('playing')
  })

  it('stops the old audio and points at the new queue when the song was replaced', async () => {
    const player = usePlayerStore()
    await player.playTrack(localTrack('a'))

    await player.replaceHostQueue([entity('b'), entity('c')])

    // 界面与 `player.getState` 现在报的是 b，旧音频不能还在响。
    expect(player.currentTrack?.key).toBe('local:local:b')
    expect(player.positionMs).toBe(0)
    expect(player.status).toBe('idle')
  })

  it('leaves currentIndex at -1 when the queue is emptied', async () => {
    const player = usePlayerStore()
    await player.playTrack(localTrack('a'))

    await player.replaceHostQueue([])

    expect(player.queue).toHaveLength(0)
    expect(player.currentIndex).toBe(-1)
    expect(player.currentTrack).toBeNull()
  })
})
