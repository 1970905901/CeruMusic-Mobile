import CryptoJS from 'crypto-js'
import { parsePluginArtifact, type ParsedPluginArtifact } from '@/services/plugin/artifact'
import { buildCommentSong } from '@/services/comments'
import type { PluginRecord } from '@/types/plugin'
import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { Track } from '@/types/music'

export interface ShareResolverGuest {
  script: string
  info: {
    adapterId: string
    name: string
    version: string
    author?: string
    providers: Array<{ id: string; name: string; qualities: string[] }>
  }
}

export interface SongShareResolver {
  code: string
  md5: string
  type: 'cr'
  pluginId: string
  pluginName: string
  qualities: string[]
  musicInfo: Record<string, any>
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function shareSources(
  manifest: PluginManifest,
  guest?: ShareResolverGuest
): Record<string, { name: string; qualitys: string[] }> {
  const providers = guest
    ? guest.info.providers
    : (manifest.contributes?.providers ?? []).map((provider) => ({
        id: provider.id,
        name: provider.name,
        qualities: provider.qualities ?? []
      }))
  return Object.fromEntries(
    providers.map((provider) => [
      provider.id,
      { name: provider.name, qualitys: Array.isArray(provider.qualities) ? provider.qualities : [] }
    ])
  )
}

/**
 * Produces the server-side resolver module declared by the plugin. This never
 * executes plugin code locally; only the declared share module is copied.
 */
export function exportShareResolverCode(
  artifact: ParsedPluginArtifact,
  config: Record<string, unknown>,
  guest?: ShareResolverGuest
): string {
  const manifest = artifact.manifest
  const declaration = manifest.modules?.share
  if (!declaration) throw new Error('此插件未提供服务器分享解析模块，请更新插件后重试')
  const factory = artifact.modules[declaration.entry]
  if (!factory || factory.includes('__ceruRequire')) {
    throw new Error('分享解析模块依赖桌面环境，无法在服务器运行')
  }
  const values = Object.fromEntries(
    (declaration.configKeys ?? []).map((key) => [key, config[key]])
  )
  const sources = shareSources(manifest, guest)
  const info = {
    name: guest?.info.name || manifest.name,
    version: guest?.info.version || manifest.version,
    author: guest?.info.author || manifest.author || ''
  }
  const names = declaration.guestGlobals ?? []
  if (
    names.some(
      (name) =>
        !/^[a-zA-Z_$][\w$]*$/.test(name) || ['globalThis', 'arguments', 'eval'].includes(name)
    )
  ) {
    throw new Error('子插件分享全局变量声明无效')
  }
  if (declaration.guestAdapterId && (!guest || guest.info.adapterId !== declaration.guestAdapterId)) {
    throw new Error('请先选择此兼容环境中的子音源')
  }
  const guestInfo = guest
    ? {
        name: guest.info.name,
        version: guest.info.version,
        author: guest.info.author,
        rawScript: guest.script
      }
    : undefined
  const runner = guest
    ? `function(bindings) {
    const scope = Object.assign(Object.create(globalThis), bindings);
    return (function(globalThis${names.map((name) => ',' + name).join('')}) {
${guest.script}
    }).call(scope,scope${names.map((name) => ',bindings[' + JSON.stringify(name) + ']').join('')});
  }`
    : 'undefined'
  return `/* CeruMusic server share resolver. Only musicUrl is exported as an executable capability. */
const pluginInfo = ${JSON.stringify(info)};
const sources = ${JSON.stringify(sources)};
const config = ${JSON.stringify(values)};
const createResolver = ${factory};
let resolver;
async function musicUrl(source, musicInfo, quality) {
  if (!Object.prototype.hasOwnProperty.call(sources,source)) throw new Error('此分享音源不支持所选平台');
  if (!sources[source].qualitys.includes(quality)) throw new Error('此分享音源不支持所选音质');
  if (!resolver) resolver = Promise.resolve(createResolver({
    plugin: pluginInfo, sources, config,
    request: (url,options) => cerumusic.request(url,options),
    utils: cerumusic.utils, guest: ${JSON.stringify(guestInfo) || 'undefined'}, runGuest: ${runner}
  })).catch(error => { resolver = undefined; throw error });
  const result = await (await resolver).musicUrl(source,musicInfo,quality);
  if (typeof result !== 'string' || !['http:','https:'].includes(new URL(result).protocol)) throw new Error('音源没有返回有效播放地址');
  return result;
}
module.exports = { pluginInfo, sources, musicUrl };
`
}

export function createSongShareResolver(
  record: PluginRecord,
  track: Track,
  config: Record<string, any>,
  guest?: ShareResolverGuest
): SongShareResolver {
  if (!record.artifactSource) throw new Error('插件来源文件缺失，请重新导入插件')
  const artifact = parsePluginArtifact(record.artifactSource)
  const source = track.ref?.providerId
  if (!source) throw new Error('这首歌缺少音源信息')
  const code = exportShareResolverCode(artifact, config, guest)
  if (byteLength(code) > 200 * 1024) {
    throw new Error('分享解析模块超过服务器 200 KiB 限制，请使用精简分享模块')
  }
  const declaration = artifact.manifest.modules?.share
  const qualities = guest
    ? guest.info.providers.find((provider) => provider.id === source)?.qualities ?? []
    : artifact.manifest.contributes?.providers?.find((provider) => provider.id === source)
        ?.qualities ?? []
  if (!declaration) throw new Error('此插件未提供服务器分享解析模块')
  if (!qualities.length) throw new Error('当前音源没有可分享的音质，请先选择可用子音源')
  return {
    code,
    md5: CryptoJS.MD5(code).toString(),
    type: 'cr',
    pluginId: artifact.manifest.id,
    pluginName: artifact.manifest.name,
    qualities: [...qualities],
    musicInfo: buildCommentSong(track, source)
  }
}
