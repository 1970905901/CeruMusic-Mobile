import { parsePluginArtifact } from '@/services/plugin/artifact'
import { usePluginStore } from '@/stores/plugins'

export interface PluginUpdateInfo {
  pluginKey: string
  name: string
  currentVersion: string
  version: string
  fileName: string
  url: string
  text: string
}

function normalizeVersion(value: string): number[] {
  return value
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number(part) || 0)
}

export function comparePluginVersions(left: string, right: string): number {
  const a = normalizeVersion(left)
  const b = normalizeVersion(right)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const diff = (a[index] || 0) - (b[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export async function findPluginUpdates(): Promise<PluginUpdateInfo[]> {
  const pluginStore = usePluginStore()
  const candidates = pluginStore.plugins.filter((plugin) => !!plugin.sourceUrl)
  const updates: PluginUpdateInfo[] = []
  await Promise.all(
    candidates.map(async (plugin) => {
      try {
        const response = await fetch(plugin.sourceUrl!)
        if (!response.ok) return
        const text = await response.text()
        const parsed = parsePluginArtifact(text)
        if (parsed.manifest.id !== plugin.manifestId) return
        if (comparePluginVersions(parsed.manifest.version, plugin.manifest.version) <= 0) return
        updates.push({
          pluginKey: plugin.key,
          name: plugin.manifest.name,
          currentVersion: plugin.manifest.version,
          version: parsed.manifest.version,
          fileName: plugin.sourceUrl!.split('/').pop() || 'plugin.js',
          url: plugin.sourceUrl!,
          text
        })
      } catch {
        // An invalid or offline source is skipped; the existing plugin stays usable.
      }
    })
  )
  return updates.sort((a, b) => a.name.localeCompare(b.name))
}

export async function installPluginUpdate(update: PluginUpdateInfo): Promise<void> {
  const pluginStore = usePluginStore()
  const record = await pluginStore.importFromText(update.text, update.fileName, update.url)
  if (!record.enabled) await pluginStore.setEnabled(record.key, true)
}
