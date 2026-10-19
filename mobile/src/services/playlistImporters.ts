import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginRecord, PluginRuntimeInfo } from '@/types/plugin'

export interface PlaylistImporterEntry {
  key: string
  pluginKey: string
  pluginId: string
  pluginName: string
  importerId: string
  title: string
  description?: string
  placeholder?: string
  examples: Array<{ label: string; value: string }>
  instructions: string[]
}

export interface PlaylistImportOptions {
  runtimeInfo?: Record<string, PluginRuntimeInfo>
}

export function collectPlaylistImporters(
  plugins: readonly PluginRecord[],
  options: PlaylistImportOptions = {}
): PlaylistImporterEntry[] {
  const result: PlaylistImporterEntry[] = []
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    const available = new Set(options.runtimeInfo?.[plugin.key]?.importers ?? [])
    const importers = (plugin.manifest as PluginManifest).contributes?.playlistImporters ?? []
    for (const importer of importers) {
      if (!available.size || !available.has(importer.id)) continue
      result.push({
        key: `${plugin.key}:${importer.id}`,
        pluginKey: plugin.key,
        pluginId: plugin.manifest.id,
        pluginName: plugin.manifest.name,
        importerId: importer.id,
        title: importer.title || plugin.manifest.name,
        description: importer.description,
        placeholder: importer.placeholder,
        examples: (importer.examples ?? []).filter(
          (item) => item?.label && typeof item.value === 'string'
        ),
        instructions: (importer.instructions ?? []).map(String).filter(Boolean)
      })
    }
  }
  return result.sort(
    (left, right) =>
      left.pluginName.localeCompare(right.pluginName) ||
      left.title.localeCompare(right.title) ||
      left.importerId.localeCompare(right.importerId)
  )
}

export function validatePlaylistImportValue(value: string): string {
  const text = String(value ?? '').trim()
  if (!text) throw new Error('请输入歌单链接或 ID')
  if (text.length > 8192) throw new Error('输入内容过长')
  return text
}
