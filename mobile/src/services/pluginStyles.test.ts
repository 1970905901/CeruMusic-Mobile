import { afterEach, describe, expect, it } from 'vitest'
import { parsePluginArtifact } from './plugin/artifact'
import {
  applyPluginApplicationStyles,
  clearPluginApplicationStyles,
  collectApplicationStyles,
  collectSlotStyles,
  collectSurfaceStyles,
  scopeCss
} from './pluginStyles'
import type { PluginRecord } from '@/types/plugin'

const artifactSource = `exports.manifest = {
  manifestVersion: 2,
  id: 'style.test',
  name: '样式测试插件',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } },
  contributes: {
    styles: [
      { id: 'theme', resource: 'css.theme', scope: 'application', order: 2 },
      { id: 'surface-only', resource: 'css.surface', scope: 'surface' },
      { id: 'slot-home', resource: 'css.slot', scope: 'slot', slots: ['home.header'] },
      { id: 'slot-player', resource: 'css.other', scope: 'slot', slots: ['player.actions'] }
    ]
  },
  permissions: [
    { key: 'globalStyle', name: 'ui.styles.global', reason: '测试全局样式' }
  ]
};
exports.package = {
  formatVersion: 2,
  syntax: 'js',
  signature: null,
  modules: { 'logic.main': 'function (ctx) {}' },
  resources: {
    'css.theme': { type: 'text', mime: 'text/css', value: ':root { --plugin-accent: #123456; }' },
    'css.surface': { type: 'text', mime: 'text/css', value: '.inside { color: red; }' },
    'css.slot': { type: 'text', mime: 'text/css', value: '.item { color: red; } :root { --slot-accent: #654321; } @media (min-width: 700px) { .item { font-size: 14px; } } @import url("https://example.invalid/x.css");' },
    'css.other': { type: 'text', mime: 'text/css', value: '.other { color: blue; }' }
  }
};
exports.activate = function (ctx) {};`

const record: PluginRecord = {
  key: 'style.test',
  manifestId: 'style.test',
  manifest: parsePluginArtifact(artifactSource).manifest,
  code: '',
  artifactSource,
  fileName: 'style.test.js',
  enabled: true,
  order: 0,
  installedAt: 1,
  updatedAt: 1,
  signatureStatus: 'unsigned'
}

describe('plugin application styles', () => {
  afterEach(() => clearPluginApplicationStyles())

  it('requires an explicit global style grant', () => {
    expect(collectApplicationStyles([record], () => false)).toEqual([])
    expect(collectApplicationStyles([record], () => true)).toEqual([
      {
        id: 'theme',
        key: 'style.test:theme',
        pluginKey: 'style.test',
        css: ':root { --plugin-accent: #123456; }',
        order: 2
      }
    ])
  })

  it('ignores disabled plugins and surface-scoped styles', () => {
    expect(
      collectApplicationStyles([{ ...record, enabled: false }], () => true)
    ).toEqual([])
    const style = collectApplicationStyles([record], () => true)[0]
    expect(style.css).not.toContain('.inside')
  })

  it('collects and scopes slot styles without loading imports', () => {
    expect(collectSlotStyles([record], 'home.header').map((item) => item.id)).toEqual([
      'slot-home'
    ])
    const css = scopeCss(
      collectSlotStyles([record], 'home.header')[0].css,
      '[data-plugin-slot="home.header"]'
    )
    expect(css).toContain('[data-plugin-slot="home.header"] .item')
    expect(css).toContain('[data-plugin-slot="home.header"] { --slot-accent: #654321; }')
    expect(css).toContain('@media (min-width: 700px)')
    expect(css).toContain('font-size: 14px;')
    expect(css).not.toContain('@import')
    expect(css).not.toContain('.other')
  })

  it('collects surface styles separately from application styles', () => {
    expect(collectSurfaceStyles([record]).map((item) => item.id)).toEqual([
      'surface-only'
    ])
  })

  it('replaces installed style elements instead of duplicating them', () => {
    const entries = collectApplicationStyles([record], () => true)
    applyPluginApplicationStyles(entries)
    applyPluginApplicationStyles(entries)
    const elements = document.querySelectorAll('style[data-ceru-plugin-style]')
    expect(elements).toHaveLength(1)
    expect(elements[0].textContent).toContain('--plugin-accent')
    clearPluginApplicationStyles()
    expect(document.querySelectorAll('style[data-ceru-plugin-style]')).toHaveLength(0)
  })
})
