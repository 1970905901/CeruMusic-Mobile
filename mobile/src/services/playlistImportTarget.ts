/**
 * 插件 `library.playlists.import` 的目标选择，对齐桌面
 * `components/PluginHostBridge.vue`：
 *
 * ```ts
 * const target = payload.target ?? (await choosePlaylist(payload.suggestedName))
 * if (!target) return { cancelled: true, added: 0, skipped: 0 }
 * ```
 *
 * 桌面在插件**没有指定目标**时会弹「选择歌单」（第一项「新建本地歌单」），
 * 用户取消就返回 `cancelled: true`，什么都不导入。移动端此前不问用户，
 * 直接建一张叫「导入歌单」的歌单把歌塞进去——插件顺手导入一次，
 * 用户歌单列表里就多出一张自己没要过的歌单，与用户本来想放进去的那张
 * 也毫无关系。
 *
 * 判定收在这里（UI 由调用方注入），store 只执行结果。
 */

export interface ImportTargetRef {
  id: string
  location: 'local' | 'cloud'
}

export interface ImportTargetRequest {
  target?: unknown
  suggestedName?: unknown
}

/** 用户在「选择歌单」面板上的选择。 */
export type ImportTargetChoice<T extends ImportTargetRef> =
  | { kind: 'picked'; target: T }
  /** 用户点了「新建本地歌单」。 */
  | { kind: 'new' }
  /** 用户取消 / 关闭了面板。 */
  | { kind: 'cancelled' }

export interface ImportTargetDeps<T extends ImportTargetRef> {
  /**
   * 插件没指定目标时，用户在「选择歌单」面板上的选择（由调用方先弹面板）。
   * `null` 表示面板没有给出结果（被系统关掉、异常），按取消处理。
   */
  choice: ImportTargetChoice<T> | null
  /** 用户选了「新建」时创建它；无法创建（例如云端请求且不允许新建）返回 `null`。 */
  createNew: () => T | null
}

export type ImportTargetPlan<T extends ImportTargetRef> =
  | { target: T }
  | { cancelled: true }

/**
 * 插件给的目标是否可用：必须是 `{ id, location }`。
 *
 * 缺 `location` 的目标不能拿来撞本地歌单——`{ id: 3 }` 这种形状多半是插件
 * 传错，按本地歌单处理会静默往一张同名 ID 的歌单里塞歌。
 */
function usableTarget<T extends ImportTargetRef>(value: unknown): T | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const location = record.location
  if (!id) return null
  if (location !== 'local' && location !== 'cloud') return null
  return { id, location } as T
}

/**
 * 插件自己给出的可用目标；没有就返回 `null`。
 *
 * 调用方先用它判断「要不要弹选择面板」——插件已经指定目标时不该再问一次。
 */
export function namedImportTarget<T extends ImportTargetRef>(
  request: ImportTargetRequest | null | undefined
): T | null {
  return usableTarget<T>(request?.target)
}

export function planImportTarget<T extends ImportTargetRef>(
  request: ImportTargetRequest | null | undefined,
  deps: ImportTargetDeps<T>
): ImportTargetPlan<T> {
  const named = usableTarget<T>(request?.target)
  if (named) return { target: named }
  const choice = deps.choice
  // 面板没给出结果（被系统关掉、异常）按取消处理：多建一张歌单比少建一张难收拾。
  if (!choice || choice.kind === 'cancelled') return { cancelled: true }
  if (choice.kind === 'picked') return { target: choice.target }
  const created = deps.createNew()
  return created ? { target: created } : { cancelled: true }
}
