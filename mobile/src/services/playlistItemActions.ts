import type { MenuContribution } from '@shiqianjiang/ceru-plugin-sdk/services'
import type { PluginRecord } from '@/types/plugin'
import type { Track } from '@/types/music'

export interface PlaylistItemCommandEntry {
  id: string
  pluginKey: string
  pluginName: string
  title: string
  action: string
}

type PlaylistItemMenu = Omit<MenuContribution, 'slot'> & {
  slot: 'playlist.item.actions'
}

export interface PlaylistItemOptions {
  routePath?: string
  authenticated?: boolean
}

function matchesItem(
  menu: PlaylistItemMenu,
  options: PlaylistItemOptions
): boolean {
  if (
    menu.when?.loggedIn !== undefined &&
    menu.when.loggedIn !== options.authenticated
  ) {
    return false
  }
  return !menu.when?.kinds?.length || menu.when.kinds.includes('track')
}

export function collectPlaylistItemCommands(
  plugins: readonly PluginRecord[],
  options: PlaylistItemOptions = {}
): PlaylistItemCommandEntry[] {
  const result: PlaylistItemCommandEntry[] = []
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    const commands = new Map(
      (plugin.manifest.contributes?.commands ?? []).map((command) => [command.id, command])
    )
    const menus = (plugin.manifest.contributes?.menus ?? []) as unknown as PlaylistItemMenu[]
    for (const menu of menus) {
      if (menu.slot !== 'playlist.item.actions') continue
      if (!matchesItem(menu, options)) continue
      const command = commands.get(menu.commandId)
      if (!command?.action) continue
      result.push({
        id: menu.id,
        pluginKey: plugin.key,
        pluginName: plugin.manifest.name,
        title: menu.title || command.title,
        action: command.action
      })
    }
  }
  return result.sort(
    (left, right) =>
      left.pluginName.localeCompare(right.pluginName) ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id)
  )
}

/**
 * Host-local keys and filesystem paths stay outside the sandbox. Plugins get the
 * original provider entity they produced, plus stable public metadata.
 */
export function playlistItemContext(track: Track): Record<string, any> {
  const entity = JSON.parse(JSON.stringify(track.raw ?? {})) as Record<string, any>
  for (const key of [
    'localUri',
    'localPath',
    'localRelativePath',
    'downloadedPath',
    'downloadedRelativePath'
  ]) {
    delete entity[key]
  }
  return {
    track: entity
  }
}
