import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord } from '@/types/plugin'
import type { Track } from '@/types/music'
import {
  collectLyricConverters,
  toCrLyricDocument
} from '@/services/lyricConverters'

function record(id: string, enabled: boolean, converters: string[]): PluginRecord {
  const manifest = {
    id,
    name: id.toUpperCase(),
    version: '1.0.0',
    modules: {},
    contributes: {
      lyricConverters: [
        {
          id: 'plain',
          title: 'Plain lyrics',
          formats: ['plain', 'lrc']
        }
      ]
    }
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

describe('lyric converters', () => {
  it('collects runtime-ready converters', () => {
    const first = record('first', true, ['plain'])
    const second = record('second', true, [])
    const entries = collectLyricConverters([record('disabled', false, ['plain']), first, second], {
      runtimeInfo: {
        first: { providers: [], actions: [], importers: [], converters: ['plain'] },
        second: { providers: [], actions: [], importers: [], converters: [] }
      }
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      pluginKey: 'first',
      pluginName: 'FIRST',
      converterId: 'plain',
      title: 'Plain lyrics',
      inputFormats: ['plain', 'lrc']
    })
  })

  it('converts the host lyric model to CrLyric without host paths', () => {
    const track = {
      key: 'host-key',
      localPath: '/private/song.mp3',
      ref: { kind: 'track', providerId: 'test', id: '1' }
    } as unknown as Track
    const result = toCrLyricDocument(
      {
        format: 'lrc',
        lines: [
          { startMs: 1000.4, endMs: 2000.6, text: 'Hello', translation: '你好' },
          { startMs: -5, text: 'World' }
        ],
        plainText: 'Hello\nWorld'
      },
      track,
      120.7
    )
    expect(result).toEqual({
      format: 'crlyric',
      version: 1,
      track: { kind: 'track', providerId: 'test', id: '1' },
      offsetMs: 120,
      lines: [
        { startTimeMs: 1000, endTimeMs: 2000, text: 'Hello', translation: '你好' },
        { startTimeMs: 0, text: 'World' }
      ],
      plainText: 'Hello\nWorld'
    })
  })
})
