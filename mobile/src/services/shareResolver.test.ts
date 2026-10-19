import { describe, expect, it } from 'vitest'
import { createSongShareResolver, exportShareResolverCode } from './shareResolver'
import { parsePluginArtifact } from './plugin/artifact'
import type { PluginRecord } from '@/types/plugin'
import type { Track } from '@/types/music'

const artifactSource = `exports.manifest = {
  manifestVersion: 2,
  id: 'share.test',
  name: '分享测试插件',
  version: '1.2.3',
  author: '测试作者',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: {
    logic: { entry: 'logic.main' },
    share: { entry: 'share.main', configKeys: ['apiKey'] }
  },
  contributes: {
    providers: [{ id: 'test', name: '测试源', protocols: ['music.search@1'], qualities: ['128k', '320k'] }]
  },
  permissions: []
};
exports.package = {
  formatVersion: 2,
  syntax: 'js',
  signature: null,
  modules: {
    'logic.main': 'function (ctx) {}',
    'share.main': 'function (ctx) { return { musicUrl: async function () { return "https://example.com/audio.mp3"; } }; }'
  }
};
exports.activate = function (ctx) {};`

const record: PluginRecord = {
  key: 'share.test',
  manifestId: 'share.test',
  manifest: parsePluginArtifact(artifactSource).manifest,
  code: '',
  artifactSource,
  fileName: 'share.test.js',
  enabled: true,
  order: 0,
  installedAt: 1,
  updatedAt: 1,
  signatureStatus: 'unsigned'
}

const track: Track = {
  key: 'share.test:test:42',
  pluginKey: 'share.test',
  ref: { pluginId: 'share.test', providerId: 'test', kind: 'track', id: '42' },
  title: '分享歌曲',
  artists: ['歌手'],
  album: '专辑',
  durationMs: 180000,
  artworkUrl: 'https://example.com/cover.jpg',
  qualities: ['128k', '320k'],
  playable: true,
  raw: { ref: { data: { song: { name: '旧名', singer: '旧歌手' } } } },
  source: 'plugin'
}

describe('share resolver export', () => {
  it('exports only the declared server module with config and source metadata', () => {
    const artifact = parsePluginArtifact(artifactSource)
    const code = exportShareResolverCode(artifact, { apiKey: 'test-config-value' })
    expect(code).toContain('CeruMusic server share resolver')
    expect(code).toContain('"apiKey":"test-config-value"')
    expect(code).toContain('"test":{"name":"测试源","qualitys":["128k","320k"]}')
    expect(code).toContain('module.exports = { pluginInfo, sources, musicUrl };')
    expect(code).not.toContain('__ceruRequire')
  })

  it('builds a stable MD5 and legacy song payload for the share API', () => {
    const resolver = createSongShareResolver(record, track, { apiKey: 'value' })
    expect(resolver.md5).toMatch(/^[a-f0-9]{32}$/)
    expect(resolver.type).toBe('cr')
    expect(resolver.pluginName).toBe('分享测试插件')
    expect(resolver.qualities).toEqual(['128k', '320k'])
    expect(resolver.musicInfo).toMatchObject({
      songmid: '42',
      source: 'test',
      name: '分享歌曲',
      singer: '歌手',
      albumName: '专辑'
    })
    expect(createSongShareResolver(record, track, { apiKey: 'value' }).md5).toBe(resolver.md5)
  })

  it('rejects plugins without a share module or with a desktop-only module', () => {
    const noShare = artifactSource
      .replace(/\n\s*share:\s*\{[^\n]*\},?/, '')
      .replace(/\n\s*'share\.main':\s*'[^']*',?/, '')
    expect(() => exportShareResolverCode(parsePluginArtifact(noShare), {})).toThrow(
      '此插件未提供服务器分享解析模块'
    )

    const desktopOnly = artifactSource.replace(
      'function (ctx) { return { musicUrl:',
      'function (ctx) { return __ceruRequire("x"); } function unused() { return { musicUrl:'
    )
    expect(() => exportShareResolverCode(parsePluginArtifact(desktopOnly), {})).toThrow(
      '分享解析模块依赖桌面环境'
    )
  })
})
