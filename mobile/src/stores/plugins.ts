import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { ProviderEntry, PluginLogEntry, PluginRecord, PluginRuntimeInfo } from '@/types/plugin'
import type { SearchPage, Track } from '@/types/music'
import { clearPluginKv, getDb, kvGet, kvSet, toPlain } from '@/services/db'
import { parsePluginArtifact } from '@/services/plugin/artifact'
import { pluginRuntimeManager } from '@/services/plugin/runtime'
import {
  buildCommentSong,
  COMMENT_PAGE_SIZE,
  commentActionFor,
  commentKindLabel,
  normalizeCommentPage,
  type CommentKind,
  type CommentPage
} from '@/services/comments'
import { useSettingsStore } from '@/stores/settings'

function makeTrackKey(pluginKey: string, entity: any): string {
  const ref = entity?.ref ?? {}
  if (ref.scope === 'provider') return `${ref.providerId}:${ref.id}`
  return `${pluginKey}:${ref.providerId}:${ref.id}`
}

function normalizeTrack(pluginKey: string, entity: any): Track {
  const ref = entity?.ref ?? {}
  if (!ref || ref.kind !== 'track' || ref.id === undefined || !ref.providerId) {
    throw new Error('插件返回了无效歌曲引用')
  }
  const metadata = entity.metadata ?? {}
  const artists: string[] = Array.isArray(metadata.artists)
    ? metadata.artists.map(String).filter(Boolean)
    : String(entity.subtitle ?? '')
        .split(/[\/,，、]/)
        .map((item) => item.trim())
        .filter(Boolean)
  return {
    key: makeTrackKey(pluginKey, entity),
    pluginKey,
    ref,
    title: String(entity.title ?? '未知歌曲'),
    subtitle: entity.subtitle ? String(entity.subtitle) : artists.join(' / '),
    artists,
    album: metadata.album?.title ? String(metadata.album.title) : undefined,
    albumId: metadata.album?.id ? String(metadata.album.id) : undefined,
    durationMs: Number(entity.durationMs ?? metadata.durationMs ?? 0) || undefined,
    artworkUrl: metadata.artworkUrl ? String(metadata.artworkUrl) : undefined,
    qualities: Array.isArray(metadata.qualities) ? metadata.qualities.map(String) : [],
    qualitySizes:
      metadata.qualitySizes && typeof metadata.qualitySizes === 'object'
        ? metadata.qualitySizes
        : undefined,
    playable: entity.playable !== false,
    raw: JSON.parse(JSON.stringify(entity)),
    source: 'plugin'
  }
}

function asPage<T>(value: any): SearchPage<T> {
  return {
    items: Array.isArray(value?.items) ? value.items : [],
    nextCursor: typeof value?.nextCursor === 'string' ? value.nextCursor : undefined,
    totalEstimate: Number.isFinite(value?.totalEstimate) ? value.totalEstimate : undefined
  }
}

function configDefaults(manifest: PluginManifest): Record<string, any> {
  const config = manifest.config
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {}
  return JSON.parse(JSON.stringify(config))
}

export const usePluginStore = defineStore('plugins', () => {
  const settings = useSettingsStore()
  const plugins = ref<PluginRecord[]>([])
  const runtimeInfo = ref<Record<string, PluginRuntimeInfo>>({})
  const logs = ref<PluginLogEntry[]>([])
  const initialized = ref(false)
  const importing = ref(false)
  const error = ref<string | null>(null)

  pluginRuntimeManager.setLogSink((entry) => {
    logs.value = [entry, ...logs.value].slice(0, 300)
  })

  const enabledPlugins = computed(() => plugins.value.filter((item) => item.enabled))
  const providers = computed<ProviderEntry[]>(() => {
    const result: ProviderEntry[] = []
    for (const plugin of enabledPlugins.value) {
      for (const provider of plugin.manifest.contributes?.providers ?? []) {
        result.push({
          pluginKey: plugin.key,
          pluginId: plugin.manifest.id,
          pluginName: plugin.manifest.name,
          providerId: provider.id,
          providerName: provider.name,
          protocols: provider.protocols ?? [],
          qualities: provider.qualities ?? [],
          icon: provider.icon ? JSON.stringify(provider.icon) : undefined
        })
      }
    }
    return result
  })
  const sources = computed(() => {
    const map = new Map<string, ProviderEntry[]>()
    for (const provider of providers.value) {
      const list = map.get(provider.providerId) ?? []
      list.push(provider)
      map.set(provider.providerId, list)
    }
    return [...map.entries()].map(([id, implementations]) => ({
      id,
      name: implementations[0]?.providerName ?? id,
      implementations
    }))
  })
  const actions = computed(() =>
    enabledPlugins.value.flatMap((plugin) =>
      (plugin.manifest.contributes?.commands ?? []).map((command) => ({
        pluginKey: plugin.key,
        pluginName: plugin.manifest.name,
        id: command.id,
        title: command.title,
        description: command.description,
        action: command.action
      }))
    )
  )
  const settingsPages = computed(() =>
    enabledPlugins.value.flatMap((plugin) =>
      (plugin.manifest.contributes?.settingsPages ?? []).map((page) => ({
        pluginKey: plugin.key,
        pluginName: plugin.manifest.name,
        id: page.id,
        title: page.title,
        view: page.view
      }))
    )
  )

  function providerImplementations(source: string): ProviderEntry[] {
    return providers.value.filter((provider) => provider.providerId === source)
  }

  function selectedProvider(source: string): ProviderEntry | undefined {
    const implementations = providerImplementations(source)
    if (!implementations.length) return undefined
    const selectedKey = settings.providerOwner(source)
    return implementations.find((item) => item.pluginKey === selectedKey) ?? implementations[0]
  }

  function providerForProtocol(protocol: string, preferredSource?: string): ProviderEntry | undefined {
    if (preferredSource) {
      const selected = selectedProvider(preferredSource)
      if (selected) return selected
    }
    return providers.value.find((provider) => provider.protocols.includes(protocol)) ?? providers.value[0]
  }

  async function init(): Promise<void> {
    if (initialized.value) return
    const db = await getDb()
    const records = await db.getAll('plugins')
    plugins.value = records.sort((a, b) => a.order - b.order || a.manifest.name.localeCompare(b.manifest.name))
    initialized.value = true
    for (const plugin of plugins.value.filter((item) => item.enabled)) {
      try {
        await activate(plugin)
      } catch (cause) {
        plugin.lastError = cause instanceof Error ? cause.message : String(cause)
        plugin.enabled = false
        await db.put('plugins', toPlain(plugin))
      }
    }
  }

  async function loadConfig(pluginKey: string): Promise<Record<string, any>> {
    const plugin = plugins.value.find((item) => item.key === pluginKey)
    if (!plugin) return {}
    const stored = await kvGet<Record<string, any>>(`pluginConfig:${pluginKey}`, {})
    return { ...configDefaults(plugin.manifest), ...stored }
  }

  async function activate(plugin: PluginRecord): Promise<PluginRuntimeInfo> {
    const config = await loadConfig(plugin.key)
    const permissions = plugin.manifest.permissions?.map((item) => item.key) ?? []
    const info = await pluginRuntimeManager.activate(plugin, config, permissions, [])
    runtimeInfo.value = { ...runtimeInfo.value, [plugin.key]: info }
    plugin.lastError = undefined
    return info
  }

  async function setEnabled(pluginKey: string, enabled: boolean): Promise<void> {
    const db = await getDb()
    const plugin = plugins.value.find((item) => item.key === pluginKey)
    if (!plugin) throw new Error('插件不存在')
    plugin.enabled = enabled
    plugin.updatedAt = Date.now()
    await db.put('plugins', toPlain(plugin))
    if (enabled) {
      try {
        await activate(plugin)
      } catch (cause) {
        plugin.lastError = cause instanceof Error ? cause.message : String(cause)
        plugin.enabled = false
        await db.put('plugins', toPlain(plugin))
        throw cause
      }
    } else {
      pluginRuntimeManager.deactivate(pluginKey)
      const next = { ...runtimeInfo.value }
      delete next[pluginKey]
      runtimeInfo.value = next
    }
  }

  async function importFromText(
    text: string,
    fileName = 'plugin.js',
    sourceUrl?: string
  ): Promise<PluginRecord> {
    importing.value = true
    error.value = null
    try {
      const parsed = parsePluginArtifact(text)
      const db = await getDb()
      const manifestId = parsed.manifest.id
      let record = plugins.value.find((item) => item.manifestId === manifestId)
      const now = Date.now()
      if (!record) {
        record = {
          key: manifestId,
          manifestId,
          manifest: parsed.manifest,
          code: parsed.body,
          artifactSource: text,
          fileName,
          sourceUrl,
          enabled: false,
          order: plugins.value.length,
          installedAt: now,
          updatedAt: now,
          signatureStatus: parsed.signatureStatus
        }
        plugins.value = [...plugins.value, record]
      } else {
        record.manifest = parsed.manifest
        record.code = parsed.body
        record.artifactSource = text
        record.fileName = fileName
        record.sourceUrl = sourceUrl ?? record.sourceUrl
        record.updatedAt = now
        record.lastError = undefined
        record.signatureStatus = parsed.signatureStatus
      }
      await db.put('plugins', toPlain(record))
      if (record.enabled) {
        pluginRuntimeManager.deactivate(record.key)
        await activate(record)
      }
      return record
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      throw cause
    } finally {
      importing.value = false
    }
  }

  async function importFromFile(file: File): Promise<PluginRecord> {
    if (file.size > 10 * 1024 * 1024) throw new Error('插件文件不能超过 10 MiB')
    const text = await file.text()
    return importFromText(text, file.name)
  }

  async function importFromUrl(url: string): Promise<PluginRecord> {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new Error('插件只能从不含账号信息的 HTTPS 地址安装')
    }
    const response = await fetch(parsed.href)
    if (!response.ok) throw new Error(`下载插件失败：HTTP ${response.status}`)
    const text = await response.text()
    return importFromText(text, parsed.pathname.split('/').pop() || 'plugin.js', parsed.href)
  }

  async function updateFromUrl(pluginKey: string): Promise<PluginRecord> {
    const plugin = plugins.value.find((item) => item.key === pluginKey)
    if (!plugin?.sourceUrl) throw new Error('该插件没有来源 URL，请重新导入文件')
    const updated = await importFromUrl(plugin.sourceUrl)
    if (updated.manifestId !== plugin.manifestId) throw new Error('更新文件的插件 ID 不匹配')
    return updated
  }

  async function remove(pluginKey: string): Promise<void> {
    const db = await getDb()
    pluginRuntimeManager.deactivate(pluginKey)
    await db.delete('plugins', pluginKey)
    await clearPluginKv(pluginKey)
    plugins.value = plugins.value.filter((item) => item.key !== pluginKey)
    const next = { ...runtimeInfo.value }
    delete next[pluginKey]
    runtimeInfo.value = next
    logs.value = logs.value.filter((item) => item.pluginKey !== pluginKey)
  }

  async function saveConfig(pluginKey: string, config: Record<string, any>): Promise<void> {
    const plugin = plugins.value.find((item) => item.key === pluginKey)
    if (!plugin) throw new Error('插件不存在')
    await kvSet(`pluginConfig:${pluginKey}`, toPlain(config))
    if (plugin.enabled) {
      pluginRuntimeManager.deactivate(pluginKey)
      await activate(plugin)
    }
  }

  async function invokeAction(pluginKey: string, actionId: string, input: any = {}): Promise<any> {
    const runtime = pluginRuntimeManager.get(pluginKey)
    if (!runtime) throw new Error('插件未启用')
    return runtime.invokeAction(actionId, input)
  }

  async function comments(
    track: Track,
    kind: CommentKind,
    page = 1,
    limit = COMMENT_PAGE_SIZE
  ): Promise<CommentPage> {
    if (track.localUri || track.downloadedPath) throw new Error('本地歌曲没有在线评论')
    const source = track.ref?.providerId
    if (!source) throw new Error('这首歌缺少音源信息')
    const action = commentActionFor(kind)
    const safePage = Math.max(1, Math.trunc(Number(page) || 1))
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit) || COMMENT_PAGE_SIZE)))
    const ownerKey = settings.capabilityOwner(source, `action:${action}`)
    const selected = selectedProvider(source)
    const candidates = providerImplementations(source)
    const ordered = [
      ...(ownerKey ? candidates.filter((item) => item.pluginKey === ownerKey) : []),
      ...(selected ? candidates.filter((item) => item.pluginKey === selected.pluginKey) : []),
      ...candidates
    ].filter(
      (item, index, list) => list.findIndex((entry) => entry.pluginKey === item.pluginKey) === index
    )
    let activated = false
    let chosen: ProviderEntry | undefined
    for (const candidate of ordered) {
      const runtime = pluginRuntimeManager.get(candidate.pluginKey)
      if (!runtime) continue
      activated = true
      if (runtime.getInfo().actions.includes(action)) {
        chosen = candidate
        break
      }
    }
    if (!chosen) {
      if (!candidates.length) throw new Error('找不到这首歌的音源插件')
      if (!activated) throw new Error('这首歌的音源插件未启用')
      throw new Error(`当前音源插件不支持${commentKindLabel(kind)}`)
    }
    const runtime = pluginRuntimeManager.get(chosen.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    const result = await runtime.invokeAction(action, {
      source,
      song: buildCommentSong(track, source),
      page: safePage,
      limit: safeLimit
    })
    return normalizeCommentPage(result, { source, page: safePage, limit: safeLimit })
  }

  async function searchTracks(
    source: string,
    query: string,
    cursor?: string,
    limit = 30
  ): Promise<SearchPage<Track>> {
    const provider = selectedProvider(source)
    if (!provider) throw new Error('请先安装并启用音源插件')
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    const result = await runtime.invokeProvider(provider.providerId, 'tracks.search', [
      {
        query,
        kinds: ['track'],
        filters: {},
        ...(cursor ? { cursor } : {}),
        limit
      }
    ])
    const page = asPage<any>(result)
    return {
      ...page,
      items: page.items
        .filter((item) => item?.ref?.kind === 'track')
        .map((item) => normalizeTrack(provider.pluginKey, item))
    }
  }

  async function searchPlaylists(
    source: string,
    query: string,
    cursor?: string,
    limit = 20
  ): Promise<SearchPage<any>> {
    const provider = selectedProvider(source)
    if (!provider) throw new Error('请先安装并启用音源插件')
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    const result = await runtime.invokeProvider(provider.providerId, 'playlists.search', [
      {
        query,
        kinds: ['playlist'],
        filters: {},
        ...(cursor ? { cursor } : {}),
        limit
      }
    ])
    return asPage<any>(result)
  }

  async function playlistCategories(source: string): Promise<SearchPage<any>> {
    const provider = selectedProvider(source)
    if (!provider) throw new Error('请先安装并启用音源插件')
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    return asPage<any>(await runtime.invokeProvider(provider.providerId, 'playlists.categories', []))
  }

  async function charts(source: string): Promise<SearchPage<any>> {
    const provider = selectedProvider(source)
    if (!provider) throw new Error('请先安装并启用音源插件')
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    return asPage<any>(await runtime.invokeProvider(provider.providerId, 'charts.list', []))
  }

  async function playlistList(source: string, reference: any, cursor?: string): Promise<SearchPage<any>> {
    const provider = selectedProvider(source)
    if (!provider) throw new Error('请先安装并启用音源插件')
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    return asPage<any>(
      await runtime.invokeProvider(provider.providerId, 'playlists.list', [reference, cursor])
    )
  }

  async function playlistTracks(source: string, reference: any, cursor?: string): Promise<SearchPage<any>> {
    const provider = selectedProvider(source)
    if (!provider) throw new Error('请先安装并启用音源插件')
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    return asPage<any>(
      await runtime.invokeProvider(provider.providerId, 'playlists.get', [reference, cursor])
    )
  }

  async function chartTracks(source: string, reference: any, cursor?: string): Promise<SearchPage<any>> {
    const provider = selectedProvider(source)
    if (!provider) throw new Error('请先安装并启用音源插件')
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    return asPage<any>(
      await runtime.invokeProvider(provider.providerId, 'charts.getTracks', [reference, cursor])
    )
  }

  async function resolve(
    track: Track,
    quality?: string
  ): Promise<{ url: string; expiresAt?: number; requestHeaders?: Record<string, string> }> {
    if (track.localUri || track.downloadedPath) {
      return { url: track.localUri || track.downloadedPath || '' }
    }
    const provider = track.pluginKey
      ? providers.value.find(
          (item) => item.pluginKey === track.pluginKey && item.providerId === track.ref.providerId
        )
      : selectedProvider(track.ref.providerId)
    if (!provider) throw new Error('找不到该歌曲的音源插件')
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    const result = await runtime.invokeProvider(provider.providerId, 'tracks.resolve', [
      track.ref,
      quality || track.qualities[track.qualities.length - 1]
    ])
    if (!result?.ok) throw new Error(result?.error?.message || '无法解析播放地址')
    return { url: result.url, expiresAt: result.expiresAt, requestHeaders: result.requestHeaders }
  }

  async function lyrics(track: Track): Promise<any> {
    const provider = track.pluginKey
      ? providers.value.find(
          (item) => item.pluginKey === track.pluginKey && item.providerId === track.ref.providerId
        )
      : selectedProvider(track.ref.providerId)
    if (!provider) throw new Error('找不到该歌曲的音源插件')
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) throw new Error('音源插件未启用')
    return runtime.invokeProvider(provider.providerId, 'tracks.lyrics', [track.ref])
  }

  async function suggest(source: string, query: string): Promise<any> {
    const provider = selectedProvider(source)
    if (!provider) return null
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) return null
    return runtime.invokeProvider(provider.providerId, 'tracks.suggest', [query])
  }

  async function hotSearch(source: string): Promise<any> {
    const provider = selectedProvider(source)
    if (!provider) return null
    const runtime = pluginRuntimeManager.get(provider.pluginKey)
    if (!runtime) return null
    return runtime.invokeProvider(provider.providerId, 'tracks.hotSearch', [])
  }

  function publishPlayerState(value: any) {
    pluginRuntimeManager.publish('player.changed', value)
  }

  function publishQueue(value: any) {
    pluginRuntimeManager.publish('queue.changed', value)
  }

  function publishLibrary(target: any, reason: string) {
    pluginRuntimeManager.publish('library.changed', { target, reason })
  }

  function publishDownloads(value: any) {
    pluginRuntimeManager.publish('downloads.changed', value)
  }

  function publishPermissions(keys: string[]) {
    pluginRuntimeManager.publish('permissions.changed', { keys })
  }

  function publishTheme(theme: 'light' | 'dark') {
    pluginRuntimeManager.publish('theme.changed', { theme })
  }

  return {
    plugins,
    runtimeInfo,
    logs,
    initialized,
    importing,
    error,
    enabledPlugins,
    providers,
    sources,
    actions,
    settingsPages,
    providerImplementations,
    selectedProvider,
    providerForProtocol,
    init,
    normalizeEntity: (pluginKey: string, entity: any) => normalizeTrack(pluginKey, entity),
    loadConfig,
    setEnabled,
    importFromText,
    importFromFile,
    importFromUrl,
    updateFromUrl,
    remove,
    saveConfig,
    invokeAction,
    comments,
    searchTracks,
    searchPlaylists,
    playlistCategories,
    playlistList,
    charts,
    playlistTracks,
    chartTracks,
    resolve,
    lyrics,
    suggest,
    hotSearch,
    publishPlayerState,
    publishQueue,
    publishLibrary,
    publishDownloads,
    publishPermissions,
    publishTheme
  }
})
