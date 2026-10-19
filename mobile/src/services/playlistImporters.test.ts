import { describe, expect, it } from 'vitest'
import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord } from '@/types/plugin'
import { collectPlaylistImporters, validatePlaylistImportValue } from '@/services/playlistImporters'

function record(id: string, importerId: string, runtimeImporters: string[]): PluginRecord {
  const manifest = {
    id,
    name: id.toUpperCase(),
    version: '1.0.0',
    modules: {},
    contributes: {
      playlistImporters: [
        {
          id: importerId,
          title: 'Demo',
          description: 'Demo importer',
          placeholder: 'demo',
          examples: [{ label: 'Demo', value: 'demo' }, { label: 'bad' }],
          instructions: ['Step 1', '']
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
    enabled: true,
    order: 0,
    installedAt: 0,
    updatedAt: 0,
    signatureStatus: 'unsigned'
  }
}

describe('playlist importers', () => {
  it('collects runtime-ready importers and normalizes declarations', () => {
    const plugin = record('first', 'demo', ['demo'])
    const importers = collectPlaylistImporters([plugin], {
      runtimeInfo: { first: { providers: [], actions: [], importers: ['demo'], converters: [] } }
    })
    expect(importers).toHaveLength(1)
    expect(importers[0]).toMatchObject({
      pluginKey: 'first',
      pluginId: 'first',
      importerId: 'demo',
      title: 'Demo',
      placeholder: 'demo',
      examples: [{ label: 'Demo', value: 'demo' }],
      instructions: ['Step 1']
    })
  })

  it('skips importers the plugin did not register or plugins that are disabled', () => {
    const unregistered = record('first', 'demo', [])
    const disabled = record('second', 'demo', ['demo'])
    disabled.enabled = false
    expect(collectPlaylistImporters([unregistered, disabled], {
      runtimeInfo: {
        first: { providers: [], actions: [], importers: [], converters: [] },
        second: { providers: [], actions: [], importers: ['demo'], converters: [] }
      }
    })).toHaveLength(0)
  })

  it('validates pasted values', () => {
    expect(validatePlaylistImportValue(' demo ')).toBe('demo')
    expect(() => validatePlaylistImportValue('  ')).toThrow('请输入歌单链接或 ID')
    expect(() => validatePlaylistImportValue('x'.repeat(8193))).toThrow('输入内容过长')
  })
})
