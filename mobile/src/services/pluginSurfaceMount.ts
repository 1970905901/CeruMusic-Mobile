import type { UISlotName, UIExtensionContribution } from '@shiqianjiang/ceru-plugin-sdk/manifest'

export interface PluginSurfaceMount {
  kind: 'page' | 'slot'
  slot?: UISlotName
  mode?: UIExtensionContribution['mode']
  context?: Record<string, any>
}

const MAX_MOUNT_BYTES = 128 * 1024

export const defaultSurfaceMount: PluginSurfaceMount = { kind: 'page' }

/**
 * Surface mount data reaches the plugin sandbox. Keep it JSON-safe and small so
 * one oversized host object cannot make an iframe unresponsive.
 */
export function prepareSurfaceMount(
  mount: PluginSurfaceMount | undefined
): PluginSurfaceMount {
  if (!mount) return defaultSurfaceMount
  const value = JSON.parse(JSON.stringify(mount)) as PluginSurfaceMount
  const bytes = new TextEncoder().encode(JSON.stringify(value)).length
  if (bytes > MAX_MOUNT_BYTES) {
    throw new Error('插件界面上下文过大')
  }
  return value
}
