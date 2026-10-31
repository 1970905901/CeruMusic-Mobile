import type { PluginRecord, PluginRuntimeInfo } from '@/types/plugin'

/**
 * `playlist.import` 菜单项（桌面 `pluginState.playlistImportMenus` 的移动端等价）。
 *
 * 桌面版在「选择导入方式」面板里额外列出插件用自己的导入器提供的入口：
 * 菜单项本身只是个壳，点下去执行的是它背后的 command action，由插件自己
 * 弹面板或调用宿主导入器。移动端此前**完全没有消费**这个 slot——插件声明了
 * 入口，用户在手机上永远看不到。
 */
export interface PlaylistImportMenuEntry {
  /** `${pluginKey}:${menuId}`，与其它菜单 slot 的 key 形态一致 */
  key: string
  pluginKey: string
  pluginName: string
  id: string
  title: string
  description?: string
  action: string
  loggedIn?: boolean
  /** 菜单指向一个插件自己注册的导入器时可用；否则插件会自己开面板 */
  importerId?: string
}

export interface CollectOptions {
  authenticated?: boolean
  runtimeInfo?: Record<string, PluginRuntimeInfo>
}

export function collectPlaylistImportMenus(
  plugins: readonly PluginRecord[],
  options: CollectOptions = {}
): PlaylistImportMenuEntry[] {
  const result: PlaylistImportMenuEntry[] = []
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    const contributes = plugin.manifest.contributes ?? {}
    const commands = new Map((contributes.commands ?? []).map((command) => [command.id, command]))
    const registered = new Set(options.runtimeInfo?.[plugin.key]?.actions ?? [])
    const importers = (contributes.playlistImporters ?? []).map((importer) => importer.id)
    for (const menu of contributes.menus ?? []) {
      if (menu.slot !== 'playlist.import') continue
      const command = commands.get(menu.commandId)
      if (!command?.action) continue
      // 运行时没上报 actions 时（插件刚启用、尚未激活完成）不判定为不可用，
      // 否则入口会闪一下又消失。
      const hasRuntime = options.runtimeInfo?.[plugin.key]
      if (hasRuntime && !registered.has(command.action)) continue
      if (menu.when?.loggedIn && !options.authenticated) continue
      result.push({
        key: `${plugin.key}:${menu.id}`,
        pluginKey: plugin.key,
        pluginName: plugin.manifest.name,
        id: menu.id,
        title: menu.title || command.title || plugin.manifest.name,
        description: menu.description || command.description,
        action: command.action,
        loggedIn: menu.when?.loggedIn,
        // 与菜单同名的导入器：插件把入口指向它自己的 importer 时，
        // 打开面板可以直接选中那个导入器。
        importerId: importers.find((id) => id === menu.id) ?? importers[0]
      })
    }
  }
  return result.sort(
    (left, right) =>
      left.pluginName.localeCompare(right.pluginName) || left.title.localeCompare(right.title)
  )
}
