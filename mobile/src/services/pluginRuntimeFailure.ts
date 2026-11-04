/**
 * 插件运行时「自己停下来」时的用户可见文案，对齐桌面 `PluginHost.event('closed')`：
 *
 * ```ts
 * if (type === 'closed' && !this.disposed) {
 *   this.onDisabled?.(this.pluginId!, '插件运行环境已停止')
 *   void this.destroy()
 * }
 * ```
 *
 * 主进程把它接到 `setPluginEnabled(pluginId, false)`，渲染进程在
 * `globaPlayList` 里用下面这段文案提示。
 *
 * 哪一次停止需要停用插件，判在运行时侧（`services/plugin/runtime.ts` 的
 * `worker.onerror`）：主动 dispose 的不算崩溃，激活期间的失败走 `onFailed`
 * 由激活流程报错，只有激活之后的停止才交给 `onStopped`。
 */

/** 运行时没有给出原因时的兜底（worker 被系统直接杀掉时 `event.message` 为空）。 */
export const RUNTIME_STOPPED_REASON = '插件运行环境已停止'

/** 停用提示，与桌面 `globaPlayList` 的 MessagePlugin.error 逐字一致。 */
export function describeRuntimeFailure(reason: unknown): string {
  const detail = String(reason ?? '').trim() || RUNTIME_STOPPED_REASON
  return `插件已被禁用：${detail}。请检查插件是否包含死循环或异常逻辑，必要时重新加载或卸载该插件。`
}
