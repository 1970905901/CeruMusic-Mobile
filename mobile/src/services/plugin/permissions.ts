/**
 * 插件权限的声明校验与文案，对齐桌面端 `PluginHost.authorize`：
 *
 * ```ts
 * if (!this.declarations().some((p) => p.key === key && p.name === name))
 *   throw new Error('插件未声明权限: ' + name)
 * ```
 *
 * 移动端此前只检查「这个 key 有没有被授权」，从不检查插件**是否声明过**它。
 * 于是插件可以随手传一个自造 key：用户会被弹出一个没有理由说明的授权框，
 * 同意后该能力就此打通——绕过 manifest 声明，也让用户在不知情下授权。
 */

export type PermissionName = string

/** 权限名 → 中文文案。与桌面 `PluginHost.permissionLabel` 保持一致。 */
export const PERMISSION_LABELS: Record<string, string> = {
  'account.profile': '账号资料',
  'downloads.create': '创建下载',
  'downloads.manage': '下载管理',
  'localMusic.read': '本地音乐读取',
  'localMusic.write': '本地音乐修改',
  'settings.read': '设置读取',
  'settings.write': '设置修改',
  'window.control': '窗口控制',
  'hotkeys.register': '全局快捷键',
  'rooms.read': '一起听状态读取',
  'rooms.control': '一起听控制',
  'ai.use': 'AI 服务',
  'devices.control': '音频设备控制',
  'network.request': '网络访问',
  'network.socket': '网络连接',
  'network.private': '局域网访问',
  'library.read': '歌单读取',
  'library.write': '歌单修改',
  'library.delete': '歌单删除',
  'player.read': '播放状态读取',
  'player.control': '播放控制',
  'files.read': '文件读取',
  'files.write': '文件写入',
  'clipboard.read': '剪贴板读取',
  'clipboard.write': '剪贴板写入',
  'external.open': '打开外部链接',
  'background.run': '后台任务',
  'sharing.publish': '发布分享',
  'sharing.revoke': '撤销分享',
  'guests.manage': '子插件管理',
  'guests.run': '子插件运行',
  'notifications.system': '发送系统通知'
}

export function permissionLabel(name: string): string {
  return PERMISSION_LABELS[name] || '相关功能'
}

export interface DeclaredPermission {
  key?: unknown
  name?: unknown
}

/**
 * 校验「这个 key 对应插件声明过的这个权限名」。
 *
 * 返回 `null` 表示合法；否则返回给人看的错误原因。声明缺失、key 对不上、
 * 或 name 不是同一个权限，都算未声明——名字对不上尤其要拒绝：
 * 插件声明的可能是无害的读权限，却拿另一个 key 去要控制权限。
 */
export function checkPermissionDeclaration(
  declarations: readonly DeclaredPermission[] | null | undefined,
  key: string,
  name: string
): string | null {
  if (!key) return '插件未声明许可：缺少权限标识'
  const list = Array.isArray(declarations) ? declarations : []
  const match = list.find((item) => item && String(item.key ?? '') === key)
  if (!match) return `插件未声明权限：${permissionLabel(name)}`
  if (String(match.name ?? '') !== name) return `插件未声明权限：${permissionLabel(name)}`
  return null
}

/**
 * 插件升级后重新核对旧授权。
 *
 * 桌面版把授权存成 `key:name:scope` 指纹，所以插件改掉某个 key 对应的权限名，
 * 旧授权自动失效、必须重新询问。移动端按 `[pluginKey][permissionKey]` 存布尔值，
 * 升级后的新版本只要复用同一个 key，用户当初为「读设置」点下的允许就会被
 * 悄悄当成「控制播放」——这正是权限指纹要防的事。
 *
 * 这里在插件导入/更新时调用：声明名与授权时记录的名字不一致，或该 key 已不再声明，
 * 一律撤销授权（拒绝记录同样清掉，让用户重新做决定）。
 */
export interface PermissionTables {
  granted: Record<string, boolean | string>
  denied: Record<string, boolean | string>
}

export function reconcilePermissionNames(
  tables: PermissionTables,
  declarations: readonly DeclaredPermission[] | null | undefined
): PermissionTables {
  const byKey = new Map<string, string>()
  for (const item of Array.isArray(declarations) ? declarations : []) {
    const key = String(item?.key ?? '')
    if (key) byKey.set(key, String(item?.name ?? ''))
  }
  const filter = (table: Record<string, boolean | string>): Record<string, boolean | string> => {
    const next: Record<string, boolean | string> = {}
    let changed = false
    for (const [key, value] of Object.entries(table)) {
      const declaredName = byKey.get(key)
      // 旧版本只存了 `true`：只要该 key 仍被声明就保留，并把名字补上，
      // 下次升级时就能按名字比对了。
      if (declaredName === undefined) {
        changed = true
        continue
      }
      if (typeof value === 'string' && value !== declaredName) {
        changed = true
        continue
      }
      next[key] = typeof value === 'string' ? value : declaredName
      if (typeof value !== 'string') changed = true
    }
    // 没变化时返回原对象，避免无谓地触发设置写入与同步。
    return changed ? next : table
  }
  return { granted: filter(tables.granted), denied: filter(tables.denied) }
}
