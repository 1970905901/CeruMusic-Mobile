import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'

export interface PluginRecord {
  /** Stable installation key. Normally the manifest id, but duplicate local
   * builds are kept apart so the user can inspect and remove one safely. */
  key: string
  manifestId: string
  manifest: PluginManifest
  code: string
  /** Complete signed/unsigned artifact, retained for Web/Native/Schema surfaces. */
  artifactSource?: string
  fileName: string
  sourceUrl?: string
  enabled: boolean
  order: number
  installedAt: number
  updatedAt: number
  lastError?: string
  signatureStatus: 'unsigned' | 'signature-present'
}

export interface PluginRuntimeInfo {
  providers: string[]
  actions: string[]
  importers: string[]
  converters: string[]
}

export interface PluginPermissionState {
  granted: boolean
  denied: boolean
  askedAt?: number
}

export interface ProviderEntry {
  pluginKey: string
  pluginId: string
  pluginName: string
  providerId: string
  providerName: string
  protocols: string[]
  qualities: string[]
  icon?: string
}

export interface PluginLogEntry {
  pluginKey: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  at: number
}
export interface GuestProviderInfo {
  id: string
  name: string
  qualities: string[]
  protocols: string[]
}

export interface GuestRecord {
  id: string
  pluginKey: string
  adapterId: string
  name: string
  version: string
  author?: string
  description?: string
  homepage?: string
  digest: string
  selected: boolean
  grants: string[]
  providers: GuestProviderInfo[]
  state: 'ready' | 'stopped' | 'error'
  error?: string
}

export interface GuestAdapterView {
  id: string
  title: string
  extensions: string[]
  format: string
  badge?: { label: string; backgroundColor: string; textColor: string }
}
