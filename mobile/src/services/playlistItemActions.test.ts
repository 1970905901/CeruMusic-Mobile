import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord } from '@/types/plugin'
import type { Track } from '@/types/music'
import {
  collectPlaylistItemCommands,
  playlistItemContext
} from '@/services/playlistItemActions'

function record(id: string, enabled: boolean, menus: any[] = [], commands: any[] = []): PluginRecord {
  const manifest = {
    id,
    name: id.toUpperCase(),
    version: '1.0.0',
    modules: {},
    contributes: { menus, commands }
  } as unknown as PluginManifest
  return {
    key: id,
    manifestId: id,
    manifest,
    code: '',
    fileName: `${id}.js`,
    enabled,
    order: 0,
    installedAt: 0,
    updatedAt: 0,
    signatureStatus: 'unsigned'
  }
}

describe('playlist item commands', () => {
  it('resolves declared track commands only', () => {
    const first = record(
      'first',
      true,
      [
        {
          id: 'tag',
          slot: 'playlist.item.actions',
          title: '标记歌曲',
          commandId: 'tag-command',
          when: { kinds: ['track'] }
        },
        { id: 'missing', slot: 'playlist.item.actions', title: '缺失', commandId: 'missing' },
        { id: 'other', slot: 'track.actions', title: '其他', commandId: 'tag-command' }
      ],
      [{ id: 'tag-command', title: '标记歌曲', action: 'tagAction' }]
    )
    const second = record(
      'second',
      true,
      [{ id: 'rate', slot: 'playlist.item.actions', title: '评分', commandId: 'rate-command' }],
      [{ id: 'rate-command', title: '评分', action: 'rateAction' }]
    )
    const commands = collectPlaylistItemCommands([record('disabled', false), first, second], {
      authenticated: true
    })
    expect(commands).toEqual([
      {
        id: 'tag',
        pluginKey: 'first',
        pluginName: 'FIRST',
        title: '标记歌曲',
        action: 'tagAction'
      },
      {
        id: 'rate',
        pluginKey: 'second',
        pluginName: 'SECOND',
        title: '评分',
        action: 'rateAction'
      }
    ])
  })

  it('honours login predicates', () => {
    const plugin = record(
      'first',
      true,
      [
        {
          id: 'tag',
          slot: 'playlist.item.actions',
          title: '标记歌曲',
          commandId: 'tag-command',
          when: { loggedIn: true }
        }
      ],
      [{ id: 'tag-command', title: '标记歌曲', action: 'tagAction' }]
    )
    expect(collectPlaylistItemCommands([plugin], { authenticated: false })).toHaveLength(0)
    expect(collectPlaylistItemCommands([plugin], { authenticated: true })).toHaveLength(1)
  })
})

describe('playlist item context', () => {
  it('passes the provider entity without host filesystem paths or keys', () => {
    const track = {
      key: 'host-key',
      pluginKey: 'first',
      ref: { kind: 'track', providerId: 'test', id: '1' },
      title: 'Song',
      artists: ['Artist'],
      qualities: [],
      playable: true,
      raw: {
        ref: { kind: 'track', providerId: 'test', id: '1' },
        title: 'Song',
        localPath: '/private/song.mp3'
      }
    } as unknown as Track
    expect(playlistItemContext(track)).toEqual({
      track: {
        ref: { kind: 'track', providerId: 'test', id: '1' },
        title: 'Song'
      }
    })
  })
})
