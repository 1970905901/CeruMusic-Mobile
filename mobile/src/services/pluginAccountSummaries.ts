/**
 * 插件账号摘要的合并规则，对齐桌面 `services/pluginAccounts.ts`：
 *
 * ```ts
 * pluginAccountSummaries.value = Object.fromEntries(
 *   Object.entries(...).filter(([key]) => keys.has(key))
 * )
 * ...
 * } catch {
 *   const next = { ...pluginAccountSummaries.value }
 *   delete next[item.key]          // 失败 → 当作未登录
 *   pluginAccountSummaries.value = next
 * }
 * ```
 *
 * 移动端 `AccountPage` 的 `refreshPluginAccounts` 只做合并、从不清除：
 * 插件被停用或新版本删掉了账号菜单项之后，那份摘要还挂在账号页上（显示一个已经
 * 没有入口的昵称与会员标签）；取摘要失败时也保留上一次的「已登录」——用户明明在
 * 插件里退出了，手机上仍显示已登录。
 *
 * 桌面还用一个按条目递增的 revision 丢弃过期响应。移动端没有：切回前台、登录状态
 * 变化、手动刷新都会触发一次，晚到的旧响应会把新结果盖回去。
 */

const MAX_REVISION = Number.MAX_SAFE_INTEGER

/**
 * 按条目递增的请求序号。`begin` 发一次请求前调用，返回的 revision 随响应带回；
 * `isCurrent` 判断这个响应是否仍属于最新一次请求。
 */
export function createAccountRevisionTracker() {
  const revisions = new Map<string, number>()

  function begin(key: string): number {
    const next = Math.min((revisions.get(key) ?? 0) + 1, MAX_REVISION)
    revisions.set(key, next)
    return next
  }

  function isCurrent(key: string, revision: number): boolean {
    return revisions.get(key) === revision
  }

  /** 条目消失后清掉它的序号，避免下次出现在一个很大的旧值上。 */
  function forget(keys: readonly string[]): void {
    const alive = new Set(keys)
    for (const key of [...revisions.keys()]) {
      if (!alive.has(key)) revisions.delete(key)
    }
  }

  return { begin, isCurrent, forget }
}

export type AccountRevisionTracker = ReturnType<typeof createAccountRevisionTracker>

/**
 * 只保留仍然存在的账号菜单项对应的摘要。
 *
 * 没有条目被丢弃时返回**同一个对象**：账号页按引用比较，每次刷新都造新对象会让
 * 整页重渲染。
 */
export function pruneAccountSummaries<T>(
  current: Record<string, T>,
  keys: readonly string[]
): Record<string, T> {
  const alive = new Set(keys)
  const entries = Object.entries(current)
  if (entries.every(([key]) => alive.has(key))) return current
  return Object.fromEntries(entries.filter(([key]) => alive.has(key)))
}

export interface AccountSummaryResult<T> {
  key: string
  /** 插件返回的摘要；失败时为 `null`，表示「当作未登录」。 */
  summary: T | null
  revision: number
}

/**
 * 把一次请求的结果并入摘要表。过期响应、已消失条目的响应都原样返回 `current`，
 * 调用方据此判断要不要写回响应式状态。
 */
export function applyAccountSummary<T>(
  current: Record<string, T>,
  result: AccountSummaryResult<T>,
  tracker: AccountRevisionTracker
): Record<string, T> {
  if (!tracker.isCurrent(result.key, result.revision)) return current
  if (result.summary === null) {
    if (!(result.key in current)) return current
    const next = { ...current }
    delete next[result.key]
    return next
  }
  return { ...current, [result.key]: result.summary }
}
