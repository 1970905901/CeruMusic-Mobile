import { createLegacyHttpBridge } from '@shiqianjiang/ceru-plugin-sdk/legacy-http'
import * as cryptoCompat from '@shiqianjiang/ceru-plugin-sdk/compat/crypto'
import * as compressionCompat from '@shiqianjiang/ceru-plugin-sdk/compat/zlib'
import * as encodingCompat from '@shiqianjiang/ceru-plugin-sdk/compat/encoding'

/**
 * 插件内建兼容模块（SDK 的 `BuiltinModules`）。
 *
 * 插件按 `ctx.modules.require('@ceru/crypto')` 取用；SDK 声明的是
 * `export =`（CommonJS 形状），因此这里统一取 `default`——ESM 命名空间里
 * 每个成员都挂在 `default` 上，直接返回命名空间会让 `require(...).decode`
 * 变成 undefined。
 */
export const COMPAT_MODULE_NAMES = [
  '@ceru/crypto',
  '@ceru/compression',
  '@ceru/encoding'
] as const

export type CompatModuleName = (typeof COMPAT_MODULE_NAMES)[number]

/** 把 ESM 命名空间还原成 `export =` 的 CommonJS 形状。 */
function commonJsShape(module: Record<string, any>): Record<string, any> {
  return module?.default && typeof module.default === 'object' ? module.default : module
}

/**
 * 返回兼容模块；不属于兼容层的模块返回 `null`，由 worker 自己接线。
 *
 * 这里直接用 SDK 自带的实现，而不是在移动端再手写一份：手写版本此前已经和契约
 * 分叉（`@ceru/crypto` 只给了裸 CryptoJS，没有 `createHash` / `randomBytes`），
 * 官方教程插件（Navidrome）第一行就会 TypeError。
 */
export function compatModule(name: string): Record<string, any> | null {
  switch (name) {
    case '@ceru/crypto':
      return commonJsShape(cryptoCompat)
    case '@ceru/compression':
      return commonJsShape(compressionCompat)
    case '@ceru/encoding':
      return commonJsShape(encodingCompat)
    default:
      return null
  }
}

/**
 * 宿主 `http.request` 的返回形状。
 *
 * SDK 声明的是 `{ status, headers, body }`，SDK 自带的 `createHttpClient`
 * 与 `createLegacyHttpBridge` 读的都是 `body`。移动端宿主产物用的是 `data`，
 * 直接回给插件会让便捷客户端拿到 `undefined`——搜索/歌词/解析静默变成空结果。
 * 这里只改字段名：`data` 是宿主内部的名字，`body` 是对插件承诺的名字。
 */
export function httpResponseShape(response: Record<string, any>): Record<string, any> {
  const { data, ...rest } = response ?? {}
  // 已经叫 `body` 的直接放行；只有宿主内部叫 `data` 时才改名。
  return 'body' in rest ? rest : { ...rest, body: data }
}

/**
 * `@ceru/legacy-http`：旧 `httpFetch(...).promise` 风格适配。
 *
 * SDK 的 `createLegacyHttpBridge` 收一个 `PluginContext`，用它的
 * `http.request` 与 `permissions` 两处服务。worker 里正好就是这个 `context`
 * 对象，所以工厂只需要把它交过去；`host` 参数留作测试注入点。
 */
export function legacyHttpModule(host: any): Record<string, any> {
  return {
    createLegacyHttpBridge: (injected?: any) => createLegacyHttpBridge(injected ?? host)
  }
}
