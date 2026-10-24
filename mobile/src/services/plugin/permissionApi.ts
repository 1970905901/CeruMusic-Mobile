import { permissionGroup } from '@shiqianjiang/ceru-plugin-sdk/permissions'
import type { PermissionDeclaration } from '@shiqianjiang/ceru-plugin-sdk/manifest'

/**
 * 插件权限 API 的宿主实现，对齐 SDK `HostServices.permissions` 的契约。
 *
 * 移动端此前在 worker 里各写了一份简化版，四处与契约不符：
 * - `getGranted` 只回 `{ key, status, grantedAt }`。`grantedAt` 并不在 SDK 的
 *   `PermissionGrant` 里，而插件真正会读的 `name` / `scope` / `group` 全缺，
 *   所以「按组过滤已授权项」这类代码在手机上永远拿不到值。
 * - `query` 对**未声明**的 key 回 `prompt`（桌面回 `undeclared`），插件会以为
 *   接下来申请一下就行，真正调用时才撞上「插件未声明该权限」。
 * - `requestGroup` 把 `keys` 当必填，而 SDK 类型里它是可选的，省略表示
 *   「申请这一组里所有已声明的权限」。插件按契约传 `{ group }` 会直接抛
 *   `TypeError: undefined is not iterable`。
 * - `requestGroup` 的返回值缺 `group`，而 `PermissionGroupResult` 里有它。
 *
 * 这里把四个方法收成一个可注入依赖的工厂：纯逻辑、不碰 UI，因而可以单测。
 */

export type HostPermissionStatus = 'undeclared' | 'prompt' | 'granted' | 'denied'

export interface HostPermissionGrant {
  key: string
  name: string
  group?: string
  scope: Record<string, unknown>
  status: HostPermissionStatus
}

export interface PermissionApiOptions {
  /** 插件清单里的权限声明；激活前可能为空。 */
  declarations: () => readonly PermissionDeclaration[] | null | undefined
  isGranted: (key: string) => boolean
  isDenied: (key: string) => boolean
  /** 向用户申请。只有已声明的 key 才会走到这里。 */
  request: (key: string, intent?: unknown) => Promise<HostPermissionStatus>
}

export function createPermissionApi(options: PermissionApiOptions) {
  /** 只保留可用的声明：缺 key 的条目既不能申请也无法回报。 */
  const list = (): PermissionDeclaration[] =>
    (options.declarations() ?? []).filter(
      (item): item is PermissionDeclaration => !!item && typeof item.key === 'string' && !!item.key
    )

  const statusOf = (key: string): HostPermissionStatus => {
    if (!list().some((item) => item.key === key)) return 'undeclared'
    if (options.isGranted(key)) return 'granted'
    if (options.isDenied(key)) return 'denied'
    return 'prompt'
  }

  const toGrant = (item: PermissionDeclaration): HostPermissionGrant => ({
    key: item.key,
    name: String(item.name ?? ''),
    group: permissionGroup(item.name) ?? undefined,
    scope: (item.scope ?? {}) as Record<string, unknown>,
    status: 'granted'
  })

  /** 与桌面 `permissions.getGranted` 同口径：只列已授权项，并带上声明里的名字与 scope。 */
  const granted = (): HostPermissionGrant[] =>
    list()
      .filter((item) => statusOf(item.key) === 'granted')
      .map(toGrant)

  return {
    getGranted: async (): Promise<HostPermissionGrant[]> => granted(),

    query: async (request: { key: string }): Promise<{ status: HostPermissionStatus }> => ({
      status: statusOf(String(request?.key ?? ''))
    }),

    request: async (request: {
      key: string
      intent?: unknown
    }): Promise<{ status: HostPermissionStatus }> => {
      const key = String(request?.key ?? '')
      // 未声明就如实回 undeclared：不去弹一个没有理由说明的授权框，
      // 也不把「根本没这项能力」伪装成「用户还没同意」。
      if (statusOf(key) === 'undeclared') return { status: 'undeclared' }
      return { status: await options.request(key, request?.intent) }
    },

    requestGroup: async (request: {
      group: string
      keys?: string[]
    }): Promise<{
      group: string
      status: HostPermissionStatus
      grants: HostPermissionGrant[]
    }> => {
      const group = String(request?.group ?? '')
      // `keys` 省略 = 整组都要；显式给空数组则按桌面语义「一个都不匹配」。
      const only = Array.isArray(request?.keys) ? request.keys.map(String) : null
      const entries = list().filter(
        (item) => permissionGroup(item.name) === group && (only === null || only.includes(item.key))
      )
      // 与桌面一致：逐条申请，已授权/已拒绝的条目由 request 自己短路。
      for (const item of entries) await options.request(item.key)
      return {
        group,
        status:
          entries.length && entries.every((item) => statusOf(item.key) === 'granted')
            ? 'granted'
            : 'denied',
        grants: granted()
      }
    }
  }
}
