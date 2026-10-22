import { HOST_SERVICE_EVENT_NAMES } from '@shiqianjiang/ceru-plugin-sdk'

export type HostEventName = (typeof HOST_SERVICE_EVENT_NAMES)[number]

export function isHostEventName(value: string): value is HostEventName {
  return (HOST_SERVICE_EVENT_NAMES as readonly string[]).includes(value)
}

/**
 * 对比两份授权表，找出「授权状态发生变化的权限键」。
 *
 * 只返回 key，不返回是否允许——与桌面版 `setGrantedPermissions` 一致：
 * 插件只需要知道「某几项变了、该重新询问」，拿到具体授权位反而可能被用来探测
 * 用户的其它决定。任一插件下某项从无到有、从有到无都算变化。
 */
export function changedPermissionKeys(
  previousGranted: Record<string, unknown> | null | undefined,
  previousDenied: Record<string, unknown> | null | undefined,
  nextGranted: Record<string, unknown> | null | undefined,
  nextDenied: Record<string, unknown> | null | undefined
): string[] {
  const keys = new Set<string>()
  // 状态（granted / denied）要编码进去：同一个键从「允许」变成「拒绝」也是变化，
  // 只记「这个键存在」会把整次翻转当成没动。
  const entries = (map: Record<string, unknown> | null | undefined, state: string) =>
    Object.entries(map ?? {}).flatMap(([pluginKey, value]) =>
      value && typeof value === 'object'
        ? Object.keys(value as Record<string, unknown>)
            .filter((key) => Boolean((value as Record<string, unknown>)[key]))
            .map((key) => `${pluginKey}\n${key}\n${state}`)
        : []
    )
  const before = new Set([
    ...entries(previousGranted, 'granted'),
    ...entries(previousDenied, 'denied')
  ])
  const after = new Set([...entries(nextGranted, 'granted'), ...entries(nextDenied, 'denied')])
  for (const entry of before) if (!after.has(entry)) keys.add(entry.split('\n')[1])
  for (const entry of after) if (!before.has(entry)) keys.add(entry.split('\n')[1])
  return [...keys].filter(Boolean)
}

export function settingsChangedKeys(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined
): string[] {
  if (!next) return []
  const before = previous ?? {}
  return Object.keys(next).filter((key) => !Object.is(before[key], next[key]))
}
