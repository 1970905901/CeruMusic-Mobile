/**
 * 插件操作播放器/队列时的资源归属校验，对齐桌面端 `PluginHost.ownedRef`。
 *
 * 桌面版在 `services.player.*` / `services.queue.*` 上做两件事：要求
 * `player.read` / `player.control` 授权，并校验「插件只能操作自己声明的资源」。
 * 移动端此前只做了前者的一部分（而且 player/queue 完全没有校验权限），
 * 任何插件都能把别的音源的歌曲推进播放队列、甚至替换整个队列。
 *
 * 归属规则（与桌面一致）：
 * - `ref.kind` 必须匹配；
 * - `ref.pluginId` 若存在，必须等于该插件自己的 manifest id；
 * - `ref.providerId` 必须在该插件 manifest 声明的 provider 里。
 */

export interface ProviderManifestLike {
  id?: string
  contributes?: { providers?: Array<{ id?: string }> }
}

export interface ResourceRefLike {
  kind?: unknown
  pluginId?: unknown
  providerId?: unknown
  id?: unknown
}

export interface OwnershipContext {
  manifestId: string
  manifest: ProviderManifestLike | null | undefined
}

function declaredProviderIds(manifest: ProviderManifestLike | null | undefined): Set<string> {
  const providers = manifest?.contributes?.providers
  if (!Array.isArray(providers)) return new Set()
  return new Set(
    providers
      .map((provider) => String(provider?.id ?? ''))
      .filter((id) => Boolean(id))
  )
}

/**
 * 校验单个引用是否属于该插件。返回错误原因，合法时返回 null。
 *
 * 抽成返回字符串而不是抛错，便于在循环里收集所有问题、也便于单测。
 */
export function checkOwnedRef(
  ref: unknown,
  kind: 'track' | 'playlist',
  context: OwnershipContext
): string | null {
  if (!ref || typeof ref !== 'object') return '插件只能操作自己声明的资源'
  const value = ref as ResourceRefLike
  if (value.kind !== kind) return '插件只能操作自己声明的资源'
  if (typeof value.id !== 'string' || !value.id) return '插件只能操作自己声明的资源'
  if (typeof value.providerId !== 'string' || !value.providerId) {
    return '插件只能操作自己声明的资源'
  }
  // `pluginId` 只在私有资源上出现；公共 provider 资源允许省略（SDK 注释明确说明）。
  if (value.pluginId !== undefined && String(value.pluginId) !== context.manifestId) {
    return '插件只能操作自己声明的资源'
  }
  if (!declaredProviderIds(context.manifest).has(value.providerId)) {
    return '插件只能操作自己声明的资源'
  }
  return null
}

/** 校验一组引用；任一不合法即抛错（与桌面 `ownedRef` 的抛错语义一致）。 */
export function assertOwnedRefs(
  refs: readonly unknown[],
  kind: 'track' | 'playlist',
  context: OwnershipContext
): void {
  for (const ref of refs) {
    const error = checkOwnedRef(ref, kind, context)
    if (error) throw new Error(error)
  }
}
