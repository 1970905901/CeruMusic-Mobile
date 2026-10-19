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

  it('rejects v1 and malformed headers', () => {
    expect(() => parsePluginArtifact('exports.manifest = { id: "x" };')).toThrow()
    expect(() => parsePluginArtifact('console.log(1)')).toThrow()
  })
})
