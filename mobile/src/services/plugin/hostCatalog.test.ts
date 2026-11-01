import { describe, expect, it } from 'vitest'
import { HOST_ASSET_NAMES, HOST_ICON_NAMES } from '@shiqianjiang/ceru-plugin-sdk/catalog'
import {
  createHostIcons,
  hostAssetList,
  hostAssetUrl,
  hostIconList,
  setHostAssetBase
} from './hostCatalog'

/**
 * `ctx.icons` / `ctx.assets` 要给插件**宿主的真实图标与资源**。
 *
 * 移动端此前两者都是编造的：`icons.list()` 恒回空数组，`icons.url(name)` 拼出一
 * 个带文字占位的假 SVG；`assets.url()` 只能取插件自己的资源。桌面 sandbox 从
 * catalog 里取真图（25 个平台/通用图标 + app.logo、placeholder.cover、
 * placeholder.avatar）。插件拿 `platform.kg` 画网易云角标、拿 `placeholder.cover`
 * 做缺省封面，在手机上全是空白或假图。
 */
describe('host icon catalog', () => {
  it('lists every name the SDK declares', () => {
    expect(hostIconList()).toEqual([...HOST_ICON_NAMES])
  })

  it('serves each icon as a real inline SVG', async () => {
    const url = await createHostIcons().url('music-note')
    // data URL + 真实 SVG；此前这里是 `encodeURIComponent('<svg …>${name}</svg>')` 的假图。
    // 桌面沙箱用的也是 base64（`data:image/svg+xml;base64,`）。
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/)
    const svg = atob(url.split(',').slice(1).join(','))
    expect(svg).toMatch(/<svg[^>]*>/)
    expect(svg).not.toContain('music-note')
  })

  it('has every declared icon in the catalog', () => {
    for (const name of HOST_ICON_NAMES) expect(hostIconList()).toContain(name)
  })

  it('refuses an icon the host never shipped', async () => {
    // 桌面沙箱抛 `Unknown Host icon: x`；静默回空字符串会让插件以为拿到了图。
    await expect(createHostIcons().url('no-such-icon' as any)).rejects.toThrow('图标不存在')
  })
})

describe('host asset catalog', () => {
  it('lists the SDK asset names', () => {
    expect(hostAssetList()).toEqual([...HOST_ASSET_NAMES])
  })

  it('points each asset at its static file', () => {
    // 缺省封面近 1 MB：内联会让每个插件的 Worker bundle 多背一份，
    // 所以它作为静态文件交付，而不是 data URL。
    expect(hostAssetUrl('placeholder.cover')).toBe('/host-assets/placeholder-cover.png')
    expect(hostAssetUrl('app.logo')).toBe('/host-assets/app-logo.svg')
    expect(hostAssetUrl('placeholder.avatar')).toBe('/host-assets/placeholder-avatar.webp')
  })

  it('follows the base the host sets', () => {
    setHostAssetBase('/')
    expect(hostAssetUrl('app.logo')).toBe('/host-assets/app-logo.svg')
    setHostAssetBase('/app/')
    expect(hostAssetUrl('app.logo')).toBe('/app/host-assets/app-logo.svg')
    setHostAssetBase('/host-assets/')
    expect(hostAssetUrl('app.logo')).toBe('/host-assets/app-logo.svg')
  })

  it('refuses an unknown asset name', () => {
    expect(() => hostAssetUrl('nope')).toThrow('资源不存在')
  })

  it('refuses an asset handle the host does not own', () => {
    // `assets.url()` 也接受 AssetHandle；插件自己的资源仍在
    // worker 的 resources 里，宿主 catalog 不该冒充它。
    expect(() => hostAssetUrl({ kind: 'asset', id: 'plugin-own' })).toThrow('资源不存在')
  })

  it('serves every declared asset as a file that really exists', () => {
    // 名字拼错或导出脚本漏写一张图，这里就会红。
    const { existsSync } = require('node:fs') as typeof import('node:fs')
    for (const name of HOST_ASSET_NAMES) {
      const url = hostAssetUrl(name)
      const path = 'public' + url.replace('/host-assets/', '/host-assets/')
      expect(existsSync(path), `${name} → ${url}`).toBe(true)
    }
  })
})
