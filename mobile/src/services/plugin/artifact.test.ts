import { describe, expect, it } from 'vitest'
import { parsePluginArtifact } from './artifact'

const artifact = `exports.manifest = {
  manifestVersion: 2,
  id: 'example.test',
  name: '测试音源',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } },
  contributes: { providers: [{ id: 'test', name: '测试', protocols: ['music.search@1'] }] },
  permissions: []
};
exports.package = { formatVersion: 2, syntax: 'js', signature: null };
exports.activate = function (ctx) {
  ctx.providers.register('test', { tracks: { search: async () => ({ items: [] }) } })
};
`

describe('parsePluginArtifact', () => {
  it('parses the static assignment header without executing the body', () => {
    const parsed = parsePluginArtifact(artifact)
    expect(parsed.manifest.id).toBe('example.test')
    expect(parsed.manifest.contributes?.providers?.[0].id).toBe('test')
    expect(parsed.body).toContain('ctx.providers.register')
    expect(parsed.signatureStatus).toBe('unsigned')
  })

  it('retains packaged modules and resources for plugin surfaces', () => {
    const surfaceArtifact = `exports.manifest = {
  manifestVersion: 2,
  id: 'surface.test',
  name: '页面测试',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' }, surfaces: [{ id: 'page', kind: 'web', entry: 'surface.page' }] },
  permissions: []
};
exports.package = {
  formatVersion: 2,
  syntax: 'js',
  signature: null,
  modules: { 'logic.main': 'function (ctx) {}', 'surface.page': 'function (ctx) {}' },
  resources: { settings: { type: 'json', value: { ok: true } } }
};
exports.activate = function (ctx) {};
`
    const parsed = parsePluginArtifact(surfaceArtifact)
    expect(parsed.modules['surface.page']).toContain('function')
    expect(parsed.resources.settings.value.ok).toBe(true)
  })

  it('rejects v1 and malformed headers', () => {
    expect(() => parsePluginArtifact('exports.manifest = { id: "x" };')).toThrow()
    expect(() => parsePluginArtifact('console.log(1)')).toThrow()
  })
})
