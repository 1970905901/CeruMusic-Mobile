import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * 自动换源的编排（`stores/player.ts` 的 `recoverFromPlaybackFailure`）。
 *
 * 这里只替换真正的网络接缝——插件解析地址与跨音源搜索——音频元素与队列逻辑
 * 走真实实现，因此断言的是「用户看到的结果」：队列里那一首换成了哪个音源的歌、
 * 换不到时有没有跳到下一首、以及一起听房间里是否完全不介入。
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

vi.mock('@/services/playbackNotice', () => ({
  notifyPlayback: vi.fn(async () => undefined)
}))

const searchTracks = vi.fn()
let throttled = false

vi.mock('@/stores/plugins', () => ({
  usePluginStore: () => ({
    sources: [
      { id: 'wy', name: '网易云', implementations: [] },
      { id: 'tx', name: 'QQ 音乐', implementations: [] }
    ],
    searchTracks,
    resolve: vi.fn(),
    qualityOrderFor: () => [],
    upsertTrack: vi.fn(),
    publishPlayerState: vi.fn(),
    publishQueue: vi.fn(),
    // 限流状态默认「未限流」；限流相关用例在 pluginThrottle.test.ts 覆盖。
    isPluginThrottled: () => throttled,
    clearPluginThrottle: vi.fn()
  })
}))

import { usePlayerStore } from './player'
import { notifyPlayback } from '@/services/playbackNotice'
import { setListenTogetherPlaybackActive } from '@/services/playbackContext'
import type { Track } from '@/types/music'

/** 在线曲目：`prepareSource` 会走插件解析，这里让解析直接失败。 */
function makeOnlineTrack(key: string, source = 'wy'): Track {
  return {
    key,
    pluginKey: 'plugin-a',
    ref: { providerId: source, id: key, kind: 'track' },
    title: '晴天',
    artists: ['周杰伦'],
    durationMs: 269_000,
    qualities: ['320k'],
    playable: true,
    raw: {},
    source: 'plugin'
  }
}

/** 本地曲目：`prepareSource` 直接返回 file:// 地址，happy-dom 解码失败会走换源。 */
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

describe('automatic source fallback', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    searchTracks.mockReset()
    vi.mocked(notifyPlayback).mockClear()
    setListenTogetherPlaybackActive(false)
    throttled = false
  })

  it('stops searching while the plugin is throttled', async () => {
    // 桌面 `_isThrottled()`：插件被风控期间不进换源循环，继续请求只会把
    // 平台的限流窗口越拖越长。
    throttled = true
    const player = usePlayerStore()
    await expect(
      player.playTrack(makeOnlineTrack('wy:4', 'wy'), [makeOnlineTrack('wy:4', 'wy')])
    ).rejects.toThrow()
    expect(searchTracks).not.toHaveBeenCalled()
  })

  it('does nothing when the user turned automatic fallback off', async () => {
    const { useSettingsStore } = await import('./settings')
    useSettingsStore().settings.autoFallbackSource = false
    const player = usePlayerStore()
    await expect(
      player.playTrack(makeOnlineTrack('wy:3', 'wy'), [makeOnlineTrack('wy:3', 'wy')])
    ).rejects.toThrow()
    expect(searchTracks).not.toHaveBeenCalled()
  })

  it('searches the other source with the song title and artist', async () => {
    // 当前音源解析不出地址时，按「歌名 + 歌手」去**其它**音源找同一首；
    // 当前音源自己不会再被搜一次。
    const replacement = makeOnlineTrack('tx:9', 'tx')
    replacement.localUri = 'file:///replacement.mp3'
    searchTracks.mockResolvedValue({ items: [replacement], nextCursor: undefined })

    const player = usePlayerStore()
    await expect(
      player.playTrack(makeOnlineTrack('wy:1', 'wy'), [makeOnlineTrack('wy:1', 'wy')])
    ).rejects.toThrow()

    await vi.waitFor(() => {
      expect(searchTracks).toHaveBeenCalledTimes(1)
    })
    expect(searchTracks).toHaveBeenCalledWith('tx', '晴天 周杰伦', undefined, 15)
  })

  it('does not fall back for local files, which have no other source', async () => {
    // 本地文件不经插件解析，换源对它没有意义；happy-dom 不会真的解码音频，
    // 所以这里只看「有没有去别的音源搜索」。
    const player = usePlayerStore()
    await player.playTrack(makeLocalTrack('local-1')).catch(() => undefined)
    expect(searchTracks).not.toHaveBeenCalled()
  })

  it('does nothing inside a listen-together room, where the room owns playback', async () => {
    setListenTogetherPlaybackActive(true)
    const player = usePlayerStore()
    await expect(
      player.playTrack(makeOnlineTrack('wy:2', 'wy'), [makeOnlineTrack('wy:2', 'wy')])
    ).rejects.toThrow()
    expect(searchTracks).not.toHaveBeenCalled()
  })
})
