import type { SurfaceDeclaration, UIExtensionContribution, UISlotName } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord } from '@/types/plugin'
import { getPluginSurface } from '@/services/pluginSurface'

export interface PluginSlotExtension {
  id: string
  plugin: PluginRecord
  surface: SurfaceDeclaration
  mode: UIExtensionContribution['mode']
  order: number
}

export interface PluginSlotOptions {
  routePath?: string
  authenticated?: boolean
}

export function routeMatches(currentPath: string | undefined, pattern?: string): boolean {
  if (!pattern) return true
  if (!currentPath) return false
  if (pattern.endsWith('*')) return currentPath.startsWith(pattern.slice(0, -1))
  const base = pattern.replace(/\/+$/, '')
  return currentPath === base || currentPath.startsWith(base + '/')
}

export function collectPluginSlotExtensions(
  plugins: readonly PluginRecord[],
  slot: UISlotName,
  options: PluginSlotOptions = {}
): PluginSlotExtension[] {
  const result: PluginSlotExtension[] = []
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    for (const extension of plugin.manifest.contributes?.uiExtensions ?? []) {
      if (extension.slot !== slot) continue
      if (
        extension.when?.loggedIn !== undefined &&
        extension.when.loggedIn !== options.authenticated
      ) {
        continue
      }
      if (!routeMatches(options.routePath, extension.when?.route)) continue
      const surface = getPluginSurface(plugin.manifest, extension.view)
      if (!surface) continue
      result.push({
        id: extension.id,
        plugin,
        surface,
        mode: extension.mode,
        order: Number(extension.order || 0)
      })
    }
  }
  return result.sort(
    (left, right) =>
      left.order - right.order ||
      left.plugin.manifest.name.localeCompare(right.plugin.manifest.name)
  )
}
