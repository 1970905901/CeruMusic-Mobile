import { describe, expect, it } from 'vitest'
import { resolveHostDownloadQuality } from './hostDownloadQuality'

/**
 * 插件 `downloads.create` 的音质解析，对齐桌面
 * `services/pluginHostServices.ts`：
 *
 * ```ts
 * const quality = request.quality
 *   || song.types?.[0]?.type
 *   || song.types?.[0]
 *   || song.pluginResource?.data?.quality
 *   || '128k'
 * ```
 *
 * 桌面在插件**没指定音质**时优先用这首歌自己声明的档位，最后才落到 `128k`；
 * 移动端直接把设置里的全局音质（可能是 flac）套给每一首——一首只提供 320k 的歌
 * 会被要求下载 flac，插件要么报错要么给出意外档位。这与「批量下载自动降级」
 * 是同一个问题，只是入口换成了插件。
 */

const ORDER = ['128k', '320k', 'flac']

describe('resolveHostDownloadQuality', () => {
  it('uses the quality the plugin asked for', () => {
    expect(
      resolveHostDownloadQuality({ requested: '320k', trackQualities: ['128k', '320k'], order: ORDER })
    ).toBe('320k')
  })

  it('falls back to the track’s own top quality when the plugin named none', () => {
    // 只提供 320k 的歌不该被要求 flac。
    expect(
      resolveHostDownloadQuality({ requested: undefined, trackQualities: ['128k', '320k'], order: ORDER })
    ).toBe('320k')
  })

  it('never upgrades above what the track declares', () => {
    expect(
      resolveHostDownloadQuality({ requested: 'flac', trackQualities: ['320k'], order: ORDER })
    ).toBe('320k')
  })

  it('keeps the plugin’s choice when the track declares nothing', () => {
    // 歌曲没声明档位时不猜：交回给插件给的值。
    expect(
      resolveHostDownloadQuality({ requested: '320k', trackQualities: [], order: ORDER })
    ).toBe('320k')
  })

  it('falls back to the desktop default when nothing is known at all', () => {
    // 桌面最后的兜底就是 `128k`；给 undefined 会让下载走设置里的全局音质，
    // 那正是这条修复要避开的行为。
    expect(
      resolveHostDownloadQuality({ requested: undefined, trackQualities: [], order: [] })
    ).toBe('128k')
  })

  it('treats a blank requested quality as absent', () => {
    expect(
      resolveHostDownloadQuality({ requested: '   ', trackQualities: ['128k'], order: ORDER })
    ).toBe('128k')
  })
})
