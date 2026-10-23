/**
 * `downloads.changed` 的可见范围。
 *
 * 桌面端在下载任务上记 `pluginId`，并且只把事件推给**发起该任务的那个插件**
 * （`PluginHostBridge.publishDownload` → `publishHostEvent(event, payload, task.pluginId)`），
 * 非插件任务（应用更新等）直接跳过。
 *
 * 移动端此前不分来源地把每个任务广播给所有插件：用户自己在应用里下载的歌
 * 也会送到插件手上，插件会把它当成自己的任务去暂停、取消，或列进自己的下载列表。
 * 这里把判定抽成纯函数，store 只负责取字段。
 */

export interface ScopedDownloadTask {
  /** 发起该任务的插件；用户自己发起的下载没有这个字段。 */
  pluginKey?: string
}

/**
 * 该任务的事件应该推给哪个插件。
 *
 * 返回 `undefined` 表示「不对任何插件广播」。空串、纯空白与缺失一律视为
 * 用户自己发起的下载——宁可少推一条，也不能把别人的任务交给插件。
 */
export function downloadEventTarget(task: ScopedDownloadTask | null | undefined): string | undefined {
  const key = typeof task?.pluginKey === 'string' ? task.pluginKey.trim() : ''
  return key || undefined
}
