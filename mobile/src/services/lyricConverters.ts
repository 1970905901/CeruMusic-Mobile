import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { CrLyric, LyricExportFormat, ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'
import type { PluginRecord, PluginRuntimeInfo } from '@/types/plugin'
import type { LyricDocument, Track } from '@/types/music'

export const LYRIC_EXPORT_FORMATS: LyricExportFormat[] = ['lrc', 'enhanced-lrc', 'yrc', 'ttml']

export interface LyricConverterEntry {
  key: string
  pluginKey: string
  pluginName: string
  converterId: string
  title: string
  inputFormats: string[]
}

export interface LyricConverterOptions {
  runtimeInfo?: Record<string, PluginRuntimeInfo>
}

export function collectLyricConverters(
  plugins: readonly PluginRecord[],
  options: LyricConverterOptions = {}
): LyricConverterEntry[] {
  const result: LyricConverterEntry[] = []
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    const available = new Set(options.runtimeInfo?.[plugin.key]?.converters ?? [])
    const converters = (plugin.manifest as PluginManifest).contributes?.lyricConverters ?? []
    for (const converter of converters) {
      if (!available.size || !available.has(converter.id)) continue
      result.push({
        key: `${plugin.key}:${converter.id}`,
        pluginKey: plugin.key,
        pluginName: plugin.manifest.name,
        converterId: converter.id,
        title: converter.title || plugin.manifest.name,
        inputFormats: converter.formats ?? []
      })
    }
  }
  return result.sort(
    (left, right) =>
      left.pluginName.localeCompare(right.pluginName) ||
      left.title.localeCompare(right.title) ||
      left.converterId.localeCompare(right.converterId)
  )
}

/**
 * The player uses a compact host model for rendering. Converters receive the
 * SDK's canonical CrLyric shape, without exposing host-only Track keys or paths.
 */
export function toCrLyricDocument(
  document: LyricDocument,
  track: Track,
  offsetMs = 0
): CrLyric {
  const ref = JSON.parse(JSON.stringify(track.ref)) as ResourceRef
  return {
    format: 'crlyric',
    version: 1,
    track: ref,
    offsetMs: Number.isFinite(offsetMs) ? Math.trunc(offsetMs) : 0,
    lines: (document.lines ?? []).map((line) => ({
      startTimeMs: Math.max(0, Math.trunc(Number(line.startMs) || 0)),
      ...(Number.isFinite(line.endMs) ? { endTimeMs: Math.trunc(Number(line.endMs)) } : {}),
      text: String(line.text ?? ''),
      ...(line.translation ? { translation: line.translation } : {}),
      ...(line.romanization ? { romanization: line.romanization } : {})
    })),
    ...(document.plainText ? { plainText: document.plainText } : {})
  }
}
