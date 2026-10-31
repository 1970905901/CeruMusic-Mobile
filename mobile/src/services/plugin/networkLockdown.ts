/**
 * 插件 Worker 的网络原语封锁。
 *
 * 插件脚本在**宿主 RPC 所在的同一个 Worker**里求值。SDK 的 `ctx.http` 会先走
 * `network.request` 授权再发 RPC，但插件绕过它只需要一行 `fetch(...)`：
 * 「插件不直接接触网络」的架构与授权对原生原语全都不生效。
 *
 * 只在 `new Function` 的参数名上做遮挡不够——函数体仍是全局作用域，插件写
 * `self.fetch` / `globalThis.fetch` 就能取回真身。这里把这个 Worker 自己的
 * 全局也换掉：本 Worker 每个插件独占，内部（含宿主 shim）全靠 `postMessage`
 * 联络宿主，没有任何地方需要这些原语。
 *
 * `Worker` / `SharedWorker` / `importScripts` 一并锁住：它们能开出一个**全新
 * 的 realm**，插件只要把 `fetch` 放进 Blob URL 的脚本里，前面所有的锁就白做了。
 */

/** 会被替换成拒绝函数的全局名。 */
export const LOCKED_NETWORK_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
  'importScripts'
] as const

export type LockedNetworkGlobal = (typeof LOCKED_NETWORK_GLOBALS)[number]

/** 插件碰到网络原语时看到的提示。 */
export function networkDeniedMessage(name: string): string {
  return `插件不能直接使用 ${name}，请通过 ctx.http / ctx.sockets 发起网络请求`
}

export function networkDenied(name: string): () => never {
  return () => {
    throw new Error(networkDeniedMessage(name))
  }
}

/**
 * 把目标对象上的网络原语钉成拒绝函数，返回真正锁住的名字。
 *
 * 用 `Object.defineProperty` 而不是赋值：覆盖的是**自身属性**，`writable` 与
 * `configurable` 置 false 后插件再调一次 `defineProperty` 也换不回来。
 * 个别运行时该属性不可重定义时跳过（此时只剩 `new Function` 参数名那层遮挡）。
 */
export function lockNetworkGlobals(
  target: Record<string, unknown>,
  logger?: (name: string, error: unknown) => void
): LockedNetworkGlobal[] {
  const locked: LockedNetworkGlobal[] = []
  for (const name of LOCKED_NETWORK_GLOBALS) {
    try {
      Object.defineProperty(target, name, {
        value: networkDenied(name),
        writable: false,
        configurable: false,
        enumerable: false
      })
      locked.push(name)
    } catch (error) {
      logger?.(name, error)
    }
  }
  return locked
}
