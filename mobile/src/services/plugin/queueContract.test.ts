import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { assertMediaEntities, assertRefList, assertRefShapes } from './runtime'
import type { Track } from '@/types/music'

/**
 * `queue.*` 的 SDK 契约是「收 `ContentEntity[]` / `ResourceRef[]`，
 * 回 `QueueState`（带 revision）」。移动端此前只对了一半：
 *
 * - `append / replace` 回 `null`，而插件按 `QueueState` 直接读 `.items`、
 *   `.revision`，拿到的全是 undefined；
 * - `reorder` 收 `ResourceRef[]` 却**完全不看** revision —— 插件排队期间
 *   用户拖动过队列，旧引用照样「排序成功」，用户刚做的调整被悄悄抹掉；
 * - `append / replace` 的条目只校验了体积与归属，缺 `ref` / 缺标题的条目会
 *   被写进队列，播到那一首才报「找不到音源」。
 *
 * 这些测试把契约的两端都钉住：入参校验，以及返回的队列快照。
 */

vi.mock('@/services/db', () => ({
  toPlain: (value: any) => JSON.parse(JSON.stringify(value)),
  getDb: vi.fn(async () => ({
    getAll: vi.fn(async () => []),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    putAll: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    transaction: vi.fn(() => ({ store: { put: vi.fn() }, done: Promise.resolve() }))
  }))
}))

function makeTrack(key: string): Track {
  return {
    key,
    ref: { providerId: 'local', kind: 'track', id: key },
    title: key,
    artists: ['Artist'],
    qualities: [],
    playable: true,
    raw: {},
    source: 'local',
    localUri: `file:///${key}.mp3`
  }
}

function makeEntity(key: string, overrides: Record<string, any> = {}): any {
  return {
    // 公共音源资源必须带 `scope: 'provider'`（SDK 的引用校验规则）。
    ref: { providerId: 'local', kind: 'track', id: key, scope: 'provider' },
    title: key,
    capabilities: [],
    metadata: { artists: ['Artist'] },
    ...overrides
  }
}

describe('queue entity contract', () => {
  it('rejects an entity without a reference instead of queueing a ghost row', () => {
    // 缺 ref 的条目会被 rawEntityToTrack 拼成空引用：队列表格里多一行，
    // 播到它才报「找不到音源」。
    expect(() => assertMediaEntities([{ title: 'Song', capabilities: [] }], '播放队列')).toThrow()
    expect(() => assertMediaEntities([makeEntity('a', { ref: null })], '播放队列')).toThrow(
      'Invalid resource reference'
    )
  })

  it('rejects an entity without a title', () => {
    expect(() => assertMediaEntities([makeEntity('a', { title: '   ' })], '播放队列')).toThrow(
      '缺少标题'
    )
  })

  it('rejects non-track entities', () => {
    expect(() =>
      assertMediaEntities(
        [
          {
            ...makeEntity('p'),
            ref: { providerId: 'local', kind: 'playlist', id: 'p', pluginId: 'plugin' }
          }
        ],
        '播放队列'
      )
    ).toThrow('只接收歌曲')
  })

  it('rejects a non-array payload', () => {
    expect(() => assertMediaEntities({ items: [makeEntity('a')] }, '播放队列')).toThrow(
      '需要传入歌曲数组'
    )
  })

  it('accepts well-formed entities', () => {
    const entities = [makeEntity('a'), makeEntity('b')]
    expect(assertMediaEntities(entities, '播放队列')).toEqual(entities)
  })
})

describe('queue reference lists', () => {
  it('accepts an empty remove list but refuses an empty reorder', () => {
    // 桌面 `services.queue.remove` 对空列表按「没有要删的东西」放行；
    // 而空排序没有意义，只能说明插件读到了空队列却还在排序。
    expect(assertRefShapes([], '队列移除')).toEqual([])
    expect(() => assertRefList([], '队列排序')).toThrow('需要传入歌曲引用数组')
  })

  it('still refuses malformed entries', () => {
    expect(() => assertRefShapes([null], '队列移除')).toThrow('引用格式无效')
  })
})

describe('queue state returned to plugins', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('bumps the revision on every mutation so plugins can detect changes', async () => {
    const { usePlayerStore } = await import('@/stores/player')
    const player = usePlayerStore()
    const before = player.hostQueue().revision
    player.appendToQueue(makeTrack('a'))
    const afterAppend = player.hostQueue().revision
    player.appendToQueue(makeTrack('b'))
    const afterSecond = player.hostQueue().revision
    expect(afterAppend).not.toBe(before)
    expect(afterSecond).not.toBe(afterAppend)
  })

  it('reports the real volume while muted, not zero', async () => {
    // 静音是独立字段。把 volume 报成 0 会让插件读到的「用户音量」是 0，
    // 取消静音后无法恢复原音量。
    const { usePlayerStore } = await import('@/stores/player')
    const player = usePlayerStore()
    player.setVolume(0.6)
    player.toggleMute()
    const state = player.hostState() as any
    expect(state.volume).toBeCloseTo(0.6)
    expect(state.muted).toBe(true)
  })

  it('refuses to play a track that is not in the queue', async () => {
    // 桌面 `services.player.play` 对队列外的歌直接抛错。此前移动端把它塞到
    // 队首就播，插件点一首不在队列里的歌会顶掉用户当前的播放上下文。
    const { usePlayerStore } = await import('@/stores/player')
    const player = usePlayerStore()
    player.appendToQueue(makeTrack('a'))
    const entity = {
      ref: { providerId: 'local', kind: 'track', id: 'zzz', scope: 'provider' },
      title: 'Guest',
      capabilities: [],
      metadata: { artists: ['Artist'] }
    }
    await expect(player.hostPlay(entity)).rejects.toThrow('歌曲不在播放队列中')
    expect(player.currentTrack?.key).toBe('a')
  })

  it('applies the muted flag the SDK sends through setMode', async () => {
    // SDK 的 `setMode` 带 `muted`；此前移动端直接忽略，插件「静音播放」
    // 之后界面仍显示有声，下一次播放还会出声。
    const { usePlayerStore } = await import('@/stores/player')
    const player = usePlayerStore()
    player.setMode({ muted: true, repeat: 'all' })
    expect(player.muted).toBe(true)
    expect(player.repeat).toBe('all')
    player.setMode({ muted: false })
    expect(player.muted).toBe(false)
    expect(player.getAudioElement().muted).toBe(false)
  })
})
