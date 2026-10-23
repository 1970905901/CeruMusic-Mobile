/**
 * 听歌识曲动作的挑选。
 *
 * 桌面端走 `getV2Action(source, 'recognize')`：只有 **action 名恰好是 `recognize`**
 * 的命令才参与，并且先看能力路由（`capabilityOwner`）、再看当前音源实现、最后才是
 * 其余插件。
 *
 * 移动端此前是把所有命令的 id / 标题 / action 拼起来跑 `/recognize|识别|听歌识曲/`
 * 正则——标题里带「识别」二字的任何菜单命令都会被当成识曲动作，然后用识曲的
 * `{ source, fp, duration }` 参数去调用它，插件要么报参数错误，要么做出用户没料到的事；
 * 同时也没有遵守能力路由里「听歌识曲由哪个插件提供」的选择。
 *
 * 这里只保留精确匹配，并把排序交给与评论、搜索建议同一套候选规则。
 */

export interface RecognizeActionEntry {
  pluginKey: string
  /** 命令声明的 action 名（`contributes.commands[].action`） */
  action: string
  id?: string
  title?: string
}

/** 桌面端用于路由的 action 名。 */
export const RECOGNIZE_ACTION = 'recognize'

/**
 * 从命令清单里挑出识曲动作。
 *
 * 精确匹配 `action`；同时兼容插件把 action 写成 `recognize` 之外的
 * `music.recognize` 这类带前缀形式（只认最后一段等于 `recognize`），
 * 但**不会**因为标题里有「识别」就选中它。
 */
export function isRecognizeAction(entry: { action?: string } | null | undefined): boolean {
  const action = String(entry?.action ?? '').trim()
  if (!action) return false
  return action === RECOGNIZE_ACTION || action.endsWith('.' + RECOGNIZE_ACTION)
}

/**
 * 按路由优先级挑一个识曲动作。
 *
 * @param entries 已启用插件声明的全部命令
 * @param options.ownerKey 能力路由里显式选择的插件
 * @param options.selectedKey 当前音源实际生效的插件
 */
export function pickRecognizeAction<T extends RecognizeActionEntry>(
  entries: readonly T[],
  options: { ownerKey?: string; selectedKey?: string } = {}
): T | undefined {
  const owner = String(options.ownerKey ?? '').trim()
  const selected = String(options.selectedKey ?? '').trim()
  const rank = (entry: T): number =>
    owner && entry.pluginKey === owner ? 0 : selected && entry.pluginKey === selected ? 1 : 2
  const candidates = entries.filter(isRecognizeAction)
  if (!candidates.length) return undefined
  // 稳定排序：同优先级保持插件声明顺序。
  return [...candidates].sort((left, right) => rank(left) - rank(right))[0]
}
