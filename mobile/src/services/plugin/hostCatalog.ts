import { HOST_ASSET_NAMES, HOST_ICON_NAMES } from '@shiqianjiang/ceru-plugin-sdk/catalog'
import iconData from './hostIcons.json'
import assetMap from './hostAssets.json'

/**
 * 宿主图标与资源目录，数据取自插件 core 发行包的 `assets/catalog.json`。
 *
 * 移动端此前 `ctx.icons` / `ctx.assets` 都是编造的：`icons.list()` 恒回空数组，
 * `icons.url(name)` 拼一个带文字占位的假 SVG；`assets.url()` 只能取插件自己的
 * 资源。插件拿 `platform.kg` 画网易云角标、拿 `placeholder.cover` 做缺省封面，
 * 在手机上全是空白或假图。
 *
 * 图标只有 19 KB，直接内联（data URL 本来就是它的交付形式）；资源里那张
 * 缺省封面近 1 MB，如果也内联，每个插件的 Worker bundle 都会多背一份——
 * 所以它们作为静态文件放在 `public/host-assets/`，按 URL 交付。
 */
type AssetEntry = { file: string; mime: string }

const icons = (iconData as { icons?: Record<string, string> }).icons ?? {}
const assets = assetMap as Record<string, AssetEntry>

/** 静态资源根路径；宿主在激活时用 `import.meta.env.BASE_URL` 决定。 */
let assetBase = '/host-assets/'

/** 设置静态资源基址（`assets.url()` 拼出来的地址前缀）。 */
export function setHostAssetBase(base: string): void {
  const normalized = String(base || '/')
  assetBase = normalized.endsWith('/host-assets/')
    ? normalized
    : normalized.replace(/\/$/, '') + '/host-assets/'
}

/** 插件可用的图标名（与 SDK 的 `HOST_ICON_NAMES` 同序）。 */
export function hostIconList(): string[] {
  return [...HOST_ICON_NAMES]
}

/** 插件可用的宿主资源名。 */
export function hostAssetList(): string[] {
  return [...HOST_ASSET_NAMES]
}

/**
 * 图标 → data URL。
 *
 * 与桌面 sandbox 同一条规则：名字不在目录里就抛错，绝不回空字符串——插件会
 * 把空字符串当成「拿到了一个空图」继续用，界面上什么也看不到。
 */
export function iconDataUrl(name: string): string {
  const svg = icons[String(name)]
  if (!svg) throw new Error(`图标不存在：${name}`)
  return `data:image/svg+xml;base64,${toBase64(svg)}`
}

/**
 * 资源 → 可加载的 URL（相对基址）。
 *
 * `assets.url()` 也接受 `AssetHandle`；宿主目录只认自己的名字，插件自己的资源
 * 由 worker 的 `resources` 处理，这里不冒充。
 */
export function hostAssetUrl(name: string | { kind?: string; id?: string }): string {
  const key = typeof name === 'string' ? name : ''
  const entry = key ? assets[key] : undefined
  if (!entry) throw new Error(`资源不存在：${key || '(句柄)'}`)
  return `${assetBase}${entry.file}`
}

function toBase64(text: string): string {
  // catalog 里的 SVG 是纯 ASCII，`btoa` 够用；万一将来塞进中文，先做一层转义。
  try {
    return btoa(text)
  } catch {
    return btoa(unescape(encodeURIComponent(text)))
  }
}

/** `ctx.icons` 的宿主实现。 */
export function createHostIcons() {
  return {
    list: () => hostIconList(),
    url: async (name: string) => iconDataUrl(name)
  }
}

/** `ctx.assets` 的宿主实现；`resources` 是插件自己的资源（由 worker 传入）。 */
export function createHostAssets(
  resources: () => Record<string, any>,
  pluginAsset: (name: string) => string
) {
  return {
    list: () => [...hostAssetList(), ...Object.keys(resources())],
    url: async (name: string | { kind?: string; id?: string }) => {
      // 插件自己的资源优先：它与 manifest 声明的 ID 绑定，宿主目录不会同名的前提下
      // 按名字直取，句柄则一定走插件资源。
      if (typeof name === 'string' && Object.hasOwn(resources(), name)) return pluginAsset(name)
      return hostAssetUrl(name)
    }
  }
}
