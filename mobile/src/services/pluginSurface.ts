import type { PluginManifest, SurfaceDeclaration } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord } from '@/types/plugin'
import { parsePluginArtifact } from '@/services/plugin/artifact'
import { pluginRuntimeManager } from '@/services/plugin/runtime'

let runtimeAssets:
  | Promise<{ runtime: string; catalog: Record<string, any> }>
  | undefined

function assetUrl(path: string): string {
  return (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/') + 'ceru-plugin/' + path
}

async function loadRuntimeAssets() {
  if (!runtimeAssets) {
    runtimeAssets = (async () => {
      const [runtimeResponse, catalogResponse] = await Promise.all([
        fetch(assetUrl('sandbox.js')),
        fetch(assetUrl('catalog.json'))
      ])
      if (!runtimeResponse.ok || !catalogResponse.ok) {
        throw new Error('插件界面运行时资源加载失败')
      }
      const [runtime, catalog] = await Promise.all([
        runtimeResponse.text(),
        catalogResponse.json()
      ])
      return { runtime, catalog }
    })().catch((error) => {
      runtimeAssets = undefined
      throw error
    })
  }
  return runtimeAssets
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function dataScript(source: string): string {
  return '<script src="data:text/javascript;base64,' + utf8Base64(source) + '"></script>'
}

export interface PluginWebSurfaceDocument {
  title: string
  html: string
  init: Record<string, any>
  state: Record<string, any>
  web: boolean
}

export async function createPluginWebSurface(
  record: PluginRecord,
  surfaceId: string,
  sessionId: string
): Promise<PluginWebSurfaceDocument> {
  const artifact = parsePluginArtifact(record.artifactSource || record.code)
  const surface = artifact.manifest.modules?.surfaces?.find((item) => item.id === surfaceId)
  if (!surface) throw new Error('插件未声明此页面')
  if (surface.kind === 'native') throw new Error('这是插件原生页面')
  if (surface.kind === 'schema') throw new Error('这是插件表单页面')

  const code = artifact.modules[surface.entry]
  if (!code) throw new Error('插件页面模块缺失')
  const { runtime, catalog } = await loadRuntimeAssets()
  const title =
    surface.title ||
    artifact.manifest.contributes?.commands?.find((item) => item.view === surfaceId)?.title ||
    artifact.manifest.name

  const html =
    '<!doctype html><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data:; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri \'none\'">' +
    '<style>html,body{margin:0;min-height:100%;background:transparent;color-scheme:light dark}#plugin-root{min-height:100%}</style>' +
    '<div id="plugin-root"></div>' +
    dataScript(runtime) +
    dataScript('globalThis.__ceruStart(' + code + ');')

  return {
    title,
    html,
    web: true,
    state: pluginRuntimeManager.getSurfaceState(record.key, surfaceId),
    init: {
      generation: sessionId,
      mode: 'production',
      kind: 'web',
      manifest: { ...artifact.manifest, config: {} },
      resources: artifact.resources,
      catalog,
      mount: { kind: 'page' }
    }
  }
}

export function getPluginSurface(
  manifest: PluginManifest,
  surfaceId: string
): SurfaceDeclaration | undefined {
  return manifest.modules?.surfaces?.find((item) => item.id === surfaceId)
}

export function readPluginSchemaResource(record: PluginRecord, surfaceId: string): any {
  const artifact = parsePluginArtifact(record.artifactSource || record.code)
  const surface = artifact.manifest.modules?.surfaces?.find((item) => item.id === surfaceId)
  if (!surface || surface.kind !== 'schema') throw new Error('插件未声明此表单页面')
  const resource = artifact.resources[surface.entry]
  if (!resource || resource.type !== 'json') throw new Error('插件表单资源缺失')
  return resource.value
}

export function pluginSurfaceActions(manifest: PluginManifest): Set<string> {
  return new Set((manifest.contributes?.commands ?? []).map((command) => command.action))
}
