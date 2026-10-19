import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { actionSheetController, alertController, toastController } from '@ionic/vue'
import PluginWorker from '@/workers/plugin.worker?worker'
import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import type { PluginLogEntry, PluginRecord, PluginRuntimeInfo } from '@/types/plugin'
import { kvDelete, kvGet, kvSet, toPlain } from '@/services/db'
import { useSettingsStore } from '@/stores/settings'
import { validateScheduledTask, type PluginScheduledTask } from '@/services/pluginTasks'
import { generatePluginAI } from '@/services/pluginAI'
import { findTrackByRef, pluginRoomState } from '@/services/pluginRooms'
import { pluginAudioDevices, selectPluginAudioDevice } from '@/services/pluginDevices'
import {
  parseSocketPayload,
  socketEventName,
  validateSocketOptions,
  type PluginSocketRuntime
} from '@/services/pluginSockets'
import {
  createShareDescriptor,
  readShareDescriptor,
  shareDescriptorFromUrl
} from '@/services/pluginSharing'
import {
  pluginSettingsGet,
  pluginSettingsUpdate
} from '@/services/pluginSettings'

export interface PluginRuntimeOptions {
  record: PluginRecord
  config: Record<string, any>
  permissions: string[]
  deniedPermissions: string[]
  onLog?: (entry: PluginLogEntry) => void
  onNotice?: (notice: { type: string; data: any }) => void
  onState?: (state: any) => void
  onClosed?: (reason?: string) => void
  onFailed?: (error: string) => void
}

interface PendingInvoke {
  resolve: (value: any) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const platform = Capacitor.getPlatform()
const isNative = platform === 'ios' || platform === 'android'

async function pluginIdentity(pluginId: string, userId: string): Promise<string> {
  const text = pluginId + ':' + userId
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    let a = 2166136261
    let b = 5381
    for (let i = 0; i < text.length; i++) {
      a ^= text.charCodeAt(i)
      a = Math.imul(a, 16777619)
      b = Math.imul(b, 33) ^ text.charCodeAt(i)
    }
    return (a >>> 0).toString(16).padStart(8, '0').repeat(4) +
      (b >>> 0).toString(16).padStart(8, '0').repeat(4)
  }
}

function pluginStorageKey(pluginKey: string, key: string) {
  return `plugin:${pluginKey}:${key}`
}

function jsonHeaders(headers?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)])
  )
}

function buildUrl(input: any): string {
  const url = new URL(input.url)
  const query = input.query
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item))
      } else {
        url.searchParams.append(key, String(value))
      }
    }
  }
  if (url.username || url.password) throw new Error('HTTP URL 不能包含账号密码')
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP/HTTPS 请求')
  return url.toString()
}

async function performHttp(input: any): Promise<any> {
  const url = buildUrl(input)
  const headers: Record<string, string> = { ...jsonHeaders(input.headers) }
  let data: any = input.body
  if (input.json !== undefined) {
    data = JSON.stringify(input.json)
    if (!headers['content-type']) headers['content-type'] = 'application/json'
  } else if (input.form !== undefined) {
    const form = new URLSearchParams()
    for (const [key, value] of Object.entries(input.form)) {
      if (value === null || value === undefined) continue
      form.append(key, String(value))
    }
    data = form.toString()
    if (!headers['content-type']) headers['content-type'] = 'application/x-www-form-urlencoded'
  }

  const timeoutMs = Math.max(1000, Math.min(Number(input.timeoutMs) || 30000, 120000))

  if (!isNative) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        method: input.method || 'GET',
        headers,
        body: data,
        signal: controller.signal
      })
      const text = await response.text()
      let parsed: any = text
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json') && text) {
        try {
          parsed = JSON.parse(text)
        } catch {
          // Keep the raw body if the server declared invalid JSON.
        }
      }
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data: parsed
      }
    } finally {
      clearTimeout(timer)
    }
  }

  const response = await CapacitorHttp.request({
    url,
    method: input.method || 'GET',
    headers,
    data,
    connectTimeout: timeoutMs,
    readTimeout: timeoutMs,
    responseType: 'text'
  })
  let parsed: any = response.data
  const responseHeaders = jsonHeaders(response.headers as Record<string, string>)
  if (
    typeof parsed === 'string' &&
    (responseHeaders['content-type'] || '').includes('application/json') &&
    parsed
  ) {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      // Keep raw text.
    }
  }
  return { status: response.status, headers: responseHeaders, data: parsed }
}

async function requestPermission(pluginKey: string, key: string): Promise<'granted' | 'denied' | 'prompt'> {
  const settings = useSettingsStore()
  if (settings.isPermissionGranted(pluginKey, key)) return 'granted'
  if (settings.isPermissionDenied(pluginKey, key)) return 'denied'
  const alert = await alertController.create({
    header: '插件权限',
    message: `插件 ${pluginKey} 请求权限：${key}`,
    buttons: [
      { text: '拒绝', role: 'cancel' },
      { text: '允许', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role === 'confirm') {
    settings.grantPermission(pluginKey, key)
    return 'granted'
  }
  settings.denyPermission(pluginKey, key)
  return 'denied'
}

async function showToast(message: string, color?: string) {
  const toast = await toastController.create({
    message,
    duration: 2200,
    position: 'bottom',
    color
  })
  await toast.present()
}

export class PluginRuntime {
  readonly record: PluginRecord
  readonly manifest: PluginManifest
  readonly worker: Worker
  private options: PluginRuntimeOptions
  private pending = new Map<number, PendingInvoke>()
  private invokeSequence = 0
  private readyPromise: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void
  private activated = false
  private disposed = false
  private info: PluginRuntimeInfo = { providers: [], actions: [], importers: [], converters: [] }
  private scheduledTasks = new Map<string, PluginScheduledTask & { timer: ReturnType<typeof setTimeout> }>()
  private sockets = new Map<string, PluginSocketRuntime>()
  private activationError: string | null = null

  constructor(options: PluginRuntimeOptions) {
    this.record = options.record
    this.manifest = options.record.manifest
    this.options = options
    this.worker = new PluginWorker({ name: `ceru-plugin-${options.record.key}` })
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.worker.onmessage = (event) => this.handleMessage(event.data)
    this.worker.onerror = (event) => {
      const message = event.message || '插件 Worker 崩溃'
      this.activationError = message
      this.options.onFailed?.(message)
      this.rejectReady(new Error(message))
    }
  }

  async start(): Promise<PluginRuntimeInfo> {
    await this.readyPromise
    this.worker.postMessage({
      type: 'activate',
      generation: `${this.record.key}:${Date.now()}`,
      pluginKey: this.record.key,
      manifest: toPlain(this.manifest),
      metadata: {
        formatVersion: 2,
        syntax: 'js',
        signature: this.record.signatureStatus === 'signature-present' ? {} : null
      },
      code: this.record.code,
      config: toPlain(this.options.config),
      permissions: [...this.options.permissions],
      deniedPermissions: this.options.deniedPermissions
    })
    return new Promise<PluginRuntimeInfo>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('插件激活超时')), 30_000)
      const check = () => {
        if (this.activated) {
          clearTimeout(timer)
          resolve(this.info)
        } else if (this.activationError) {
          clearTimeout(timer)
          reject(new Error(this.activationError))
        } else if (this.disposed) {
          clearTimeout(timer)
          reject(new Error('插件运行时已停止'))
        } else {
          setTimeout(check, 50)
        }
      }
      check()
    })
  }

  getInfo(): PluginRuntimeInfo {
    return { ...this.info }
  }

  async invokeProvider(providerId: string, method: string, args: any[] = []): Promise<any> {
    return this.invoke({ kind: 'provider', target: providerId, method, args })
  }

  async invokeAction(actionId: string, input: any = {}): Promise<any> {
    return this.invoke({ kind: 'action', target: actionId, args: [input] })
  }

  async invokeImporter(importerId: string, request: any): Promise<any> {
    return this.invoke({ kind: 'importer', target: importerId, args: [request] })
  }

  async invokeConverter(converterId: string, method: string, request: any): Promise<any> {
    return this.invoke({ kind: 'converter', target: converterId, args: [method, request] })
  }

  publish(event: string, value: any): void {
    if (this.disposed) return
    this.worker.postMessage({ type: 'event', event, value: toPlain(value) })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.worker.postMessage({ type: 'dispose' })
    setTimeout(() => this.worker.terminate(), 100)
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('插件运行时已停止'))
    }
    this.pending.clear()
    this.clearScheduledTasks()
    this.clearSockets()
  }

  private invoke(payload: { kind: string; target: string; method?: string; args: any[] }): Promise<any> {
    if (this.disposed || !this.activated) {
      return Promise.reject(new Error('插件未启用或已停止'))
    }
    const id = ++this.invokeSequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('插件操作超时'))
      }, 120_000)
      this.pending.set(id, { resolve, reject, timer })
      this.worker.postMessage({
        type: 'invoke',
        id,
        kind: payload.kind,
        target: payload.target,
        method: payload.method,
        args: toPlain(payload.args)
      })
    })
  }

  private handleMessage(message: any) {
    if (!message || typeof message !== 'object') return
    switch (message.type) {
      case 'ready':
        this.resolveReady()
        break
      case 'activated':
        this.activated = true
        this.info = {
          providers: Array.isArray(message.providers) ? message.providers : [],
          actions: Array.isArray(message.actions) ? message.actions : [],
          importers: Array.isArray(message.importers) ? message.importers : [],
          converters: Array.isArray(message.converters) ? message.converters : []
        }
        break
      case 'failed':
        this.activationError = String(message.error || '插件激活失败')
        this.options.onFailed?.(this.activationError)
        this.rejectReady(new Error(this.activationError))
        break
      case 'rpc':
        void this.handleRpc(message.id, message.method, message.params)
        break
      case 'invoke-result': {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error) pending.reject(new Error(String(message.error)))
        else pending.resolve(message.value)
        break
      }
      case 'log':
        this.options.onLog?.({
          pluginKey: this.record.key,
          level: message.level,
          message: String(message.message ?? ''),
          at: Date.now()
        })
        break
      case 'notice':
        this.options.onNotice?.(message.notice)
        break
      case 'state':
        this.options.onState?.({ surfaceId: message.surfaceId, state: message.state })
        break
      case 'disposed':
        this.options.onClosed?.()
        break
    }
  }

  private async handleRpc(id: number, method: string, params: any): Promise<void> {
    try {
      const value = await this.dispatchRpc(method, params)
      this.worker.postMessage({ type: 'rpc-result', id, value: toPlain(value) })
    } catch (error) {
      this.worker.postMessage({
        type: 'rpc-result',
        id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async dispatchRpc(method: string, params: any): Promise<any> {
    switch (method) {
      case 'http.request':
        return performHttp(params)
      case 'storage.get':
        return kvGet(pluginStorageKey(this.record.key, params.key), null)
      case 'storage.set':
        await kvSet(pluginStorageKey(this.record.key, params.key), params.value)
        return null
      case 'storage.delete':
        await kvDelete(pluginStorageKey(this.record.key, params.key))
        return null
      case 'permissions.request':
        return requestPermission(this.record.key, params.key)
      case 'ui.confirm': {
        const alert = await alertController.create({
          header: params?.title || '请确认',
          message: params?.message || '',
          buttons: [
            { text: '取消', role: 'cancel' },
            { text: params?.confirmText || '确定', role: 'confirm' }
          ]
        })
        await alert.present()
        const { role } = await alert.onDidDismiss()
        return role === 'confirm'
      }
      case 'ui.prompt': {
        const alert = await alertController.create({
          header: params?.title || '请输入',
          inputs: [
            {
              name: 'value',
              type: params?.secret ? 'password' : 'text',
              value: params?.value ?? '',
              placeholder: params?.label || ''
            }
          ],
          buttons: [
            { text: '取消', role: 'cancel' },
            { text: '确定', role: 'confirm' }
          ]
        })
        await alert.present()
        const { role, data } = await alert.onDidDismiss()
        return role === 'confirm' ? data?.values?.value ?? null : null
      }
      case 'ui.pickPlaylist': {
        const { useLibraryStore } = await import('@/stores/library')
        const library = useLibraryStore()
        let picked: { id: string; name: string } | null = null
        const sheet = await actionSheetController.create({
          header: '选择歌单',
          buttons: [
            ...library.playlists.map((playlist) => ({
              text: playlist.name,
              handler: () => {
                picked = { id: playlist.id, name: playlist.name }
              }
            })),
            { text: '取消', role: 'cancel' as const }
          ]
        })
        await sheet.present()
        await sheet.onDidDismiss()
        return picked
      }
      case 'ui.toast':
        await showToast(params?.message || String(params ?? ''))
        return null
      case 'ui.notify': {
        const title = String(params?.title || '澜音')
        const body = String(params?.body || params?.message || params?.title || '插件通知')
        if (document.visibilityState === 'visible') {
          await showToast(body)
          return null
        }
        const { showSystemNotification } = await import('@/services/notifications')
        const shown = await showSystemNotification(title, body)
        if (!shown) await showToast(body)
        return null
      }
      case 'ui.navigation.open': {
        const { default: router } = await import('@/router')
        const page = params?.page
        if (page === 'search') {
          await router.push({ path: '/tabs/search', query: { q: params?.query ?? '' } })
        } else if (page === 'playlist' || page === 'library') {
          await router.push('/tabs/library')
        } else if (page === 'settings') {
          await router.push('/tabs/settings')
        } else if (page === 'player') {
          await router.push('/player')
        } else {
          await router.push('/tabs/discover')
        }
        return null
      }
      case 'ui.progress.create': {
        const { createPluginProgress } = await import('@/services/pluginProgress')
        return createPluginProgress(params)
      }
      case 'ui.progress.update': {
        const { updatePluginProgress } = await import('@/services/pluginProgress')
        if (params?.id) updatePluginProgress(String(params.id), params.value ?? params)
        return null
      }
      case 'ui.progress.close': {
        const { closePluginProgress } = await import('@/services/pluginProgress')
        if (params?.id) closePluginProgress(String(params.id))
        return null
      }
      case 'ui.openView': {
        const surfaceId = String(params?.surfaceId || '')
        const surface = this.record.manifest.modules?.surfaces?.find(
          (item) => item.id === surfaceId
        )
        if (!surface) throw new Error('插件未声明此页面')
        const { default: router } = await import('@/router')
        await router.push(
          '/plugin-surface/' +
            encodeURIComponent(this.record.key) +
            '/' +
            encodeURIComponent(surfaceId)
        )
        return null
      }
      case 'ui.closeView': {
        const { default: router } = await import('@/router')
        router.back()
        return null
      }
      case 'ui.playlistImport.open': {
        const { useLibraryStore } = await import('@/stores/library')
        const library = useLibraryStore()
        await library.importPlaylistFromPlugin(this.record.key, params?.pluginId, params?.importerId, params?.value)
        return null
      }
      case 'ui.pluginUpdate.request':
        await showToast('插件更新请求已记录，请重新导入新版插件文件')
        return null
      case 'guests.list': {
        const { guestStoreFor } = await import('@/services/plugin/guests')
        return guestStoreFor(this.record).list()
      }
      case 'guests.import': {
        const { guestStoreFor } = await import('@/services/plugin/guests')
        const store = guestStoreFor(this.record)
        const adapterId = String(params?.adapterId || '')
        const file = await store.pickFile(adapterId)
        if (!file) return null
        return store.importFile(adapterId, file)
      }
      case 'guests.select': {
        const { guestStoreFor } = await import('@/services/plugin/guests')
        const store = guestStoreFor(this.record)
        await store.select(params?.guestId ? String(params.guestId) : null)
        return null
      }
      case 'guests.remove': {
        const { guestStoreFor } = await import('@/services/plugin/guests')
        const store = guestStoreFor(this.record)
        await store.remove(String(params?.guestId || ''))
        return null
      }
      case 'guests.invoke': {
        const { guestStoreFor } = await import('@/services/plugin/guests')
        const store = guestStoreFor(this.record)
        return store.invoke(
          String(params?.guestId || ''),
          String(params?.method || ''),
          params?.input
        )
      }
      case 'capabilities.list':
        return this.capabilityList()
      case 'capabilities.get': {
        const list = this.capabilityList()
        return (
          list.find((item) => item.service === params?.service) ?? {
            service: params?.service,
            version: '1.0.0',
            available: false,
            reason: 'unsupported',
            permissionGroups: []
          }
        )
      }
      case 'app.getInfo':
        return {
          name: '澜音',
          version: __APP_VERSION__,
          platform: platform === 'ios' ? 'darwin' : 'linux',
          platformName: platform,
          locale: navigator.language || 'zh-CN',
          theme: useSettingsStore().isDark ? 'dark' : 'light',
          hostApi: '2.0.0'
        }
      case 'app.openSettings': {
        const { default: router } = await import('@/router')
        await router.push('/tabs/settings')
        return null
      }
      case 'app.openExternal': {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: String(params?.url ?? '') })
        return null
      }
      case 'account.getSession':
      case 'account.getProfile': {
        await this.requirePermission(params?.call?.permissionKey, 'account')
        const { useAuthStore } = await import('@/stores/auth')
        const auth = useAuthStore()
        const identity = auth.authenticated
          ? await pluginIdentity(this.record.manifestId, String((auth.user as any)?.sub || ''))
          : null
        const profile = identity
          ? {
              id: identity,
              displayName: auth.displayName,
              identityScope: 'plugin'
            }
          : null
        return method === 'account.getProfile'
          ? profile
          : { loggedIn: auth.authenticated, profile }
      }
      case 'account.openLogin': {
        await this.requirePermission(params?.operation?.permissionKey, 'account')
        const { useAuthStore } = await import('@/stores/auth')
        const auth = useAuthStore()
        if (!auth.authenticated) await auth.login()
        if (!auth.authenticated) throw new Error('登录未完成')
        const { default: router } = await import('@/router')
        if (params?.operation?.next === 'profile') await router.push('/account')
        return null
      }
      case 'library.playlists.list': {
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().asHostPlaylists()
      }
      case 'library.playlists.getTracks': {
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().asHostTracks(params?.reference, params?.cursor)
      }
      case 'library.playlists.import': {
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().importHostPlaylist(params?.request)
      }
      case 'library.playlists.removeTracks': {
        const { useLibraryStore } = await import('@/stores/library')
        await useLibraryStore().removeHostTracks(params?.reference, params?.tracks)
        return null
      }
      case 'library.playlists.clearPlaylist': {
        const { useLibraryStore } = await import('@/stores/library')
        await useLibraryStore().clearHostPlaylist(params?.reference)
        return null
      }
      case 'player.getState': {
        const { usePlayerStore } = await import('@/stores/player')
        return usePlayerStore().hostState()
      }
      case 'player.play': {
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().hostPlay(params?.track)
        return null
      }
      case 'player.pause': {
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().pause()
        return null
      }
      case 'player.next': {
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().next()
        return null
      }
      case 'player.previous': {
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().previous()
        return null
      }
      case 'player.seek': {
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().seek(Number(params?.positionMs) || 0)
        return null
      }
      case 'player.setVolume': {
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().setVolume(Number(params?.volume) || 0)
        return null
      }
      case 'player.setMode': {
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().setMode(params?.mode)
        return null
      }
      case 'queue.get': {
        const { usePlayerStore } = await import('@/stores/player')
        return usePlayerStore().hostQueue()
      }
      case 'queue.append': {
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().appendHostTracks(params?.tracks ?? [])
        return null
      }
      case 'queue.replace': {
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().replaceHostQueue(params?.tracks ?? [])
        return null
      }
      case 'queue.remove': {
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().removeHostTracks(params?.keys ?? [])
        return null
      }
      case 'queue.reorder': {
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().reorderHostTracks(params?.keys ?? [])
        return null
      }
      case 'favorites.contains': {
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().isFavorite(params?.track?.ref ?? params?.track)
      }
      case 'favorites.add': {
        const { useLibraryStore } = await import('@/stores/library')
        await useLibraryStore().addHostFavorite(params?.track)
        return null
      }
      case 'favorites.remove': {
        const { useLibraryStore } = await import('@/stores/library')
        await useLibraryStore().removeHostFavorite(params?.track)
        return null
      }
      case 'history.list': {
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().historyPage(params?.cursor)
      }
      case 'downloads.list': {
        const { useDownloadStore } = await import('@/stores/downloads')
        return useDownloadStore().asHostTasks()
      }
      case 'downloads.create': {
        const { useDownloadStore } = await import('@/stores/downloads')
        return useDownloadStore().createHostDownloads(params?.request)
      }
      case 'downloads.pause': {
        const { useDownloadStore } = await import('@/stores/downloads')
        useDownloadStore().pause(params?.ids ?? [])
        return null
      }
      case 'downloads.resume': {
        const { useDownloadStore } = await import('@/stores/downloads')
        useDownloadStore().resume(params?.ids ?? [])
        return null
      }
      case 'downloads.cancel': {
        const { useDownloadStore } = await import('@/stores/downloads')
        useDownloadStore().cancel(params?.ids ?? [])
        return null
      }
      case 'downloads.retry': {
        const { useDownloadStore } = await import('@/stores/downloads')
        useDownloadStore().retry(params?.ids ?? [])
        return null
      }
      case 'downloads.reveal': {
        const { useDownloadStore } = await import('@/stores/downloads')
        await useDownloadStore().share(params?.id)
        return null
      }
      case 'files.pick':
        return this.pickFiles(params?.request)
      case 'files.pickDirectory':
        return null
      case 'files.readText': {
        const file = this.pickedFiles.get(params?.file?.id)
        if (!file) throw new Error('文件句柄已过期')
        return file.text()
      }
      case 'files.readBase64': {
        const file = this.pickedFiles.get(params?.file?.id)
        if (!file) throw new Error('文件句柄已过期')
        return this.blobToBase64(file)
      }
      case 'files.saveText': {
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
        const name = String(params?.request?.suggestedName || 'ceru-export.txt')
        const relativePath = `exports/${name}`
        await Filesystem.writeFile({
          path: relativePath,
          data: String(params?.request?.text ?? ''),
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true
        })
        return { kind: 'file', id: relativePath, name, mime: 'text/plain' }
      }
      case 'files.writeText': {
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
        await Filesystem.writeFile({
          path: String(params?.file?.id || 'exports/ceru-export.txt'),
          data: String(params?.text ?? ''),
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true
        })
        return null
      }
      case 'clipboard.readText': {
        const { Clipboard } = await import('@capacitor/clipboard')
        return (await Clipboard.read()).value ?? ''
      }
      case 'clipboard.writeText': {
        const { Clipboard } = await import('@capacitor/clipboard')
        await Clipboard.write({ string: String(params?.text ?? '') })
        return null
      }
      case 'localMusic.list': {
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().localMusicPage(params?.cursor)
      }
      case 'localMusic.scan': {
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().scanLocalMusic()
      }
      case 'localMusic.getTags': {
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().localTags(params?.track)
      }
      case 'localMusic.writeTags': {
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().writeLocalTags(params?.track, params?.tags)
      }
      case 'settings.get': {
        const settings = useSettingsStore()
        return pluginSettingsGet(params?.keys ?? [], settings.settings as Record<string, unknown>)
      }
      case 'settings.update': {
        const settings = useSettingsStore()
        pluginSettingsUpdate(params?.values, settings.settings as Record<string, any>)
        return null
      }
      case 'tasks.schedule': {
        await this.requirePermission(params?.call?.permissionKey, 'background')
        const task = validateScheduledTask(params?.request ?? {}, this.info.actions)
        this.scheduleTask(task)
        return { id: task.id }
      }
      case 'tasks.cancel': {
        const id = String(params?.id ?? '')
        const timer = this.scheduledTasks.get(id)
        if (timer) clearTimeout(timer.timer)
        this.scheduledTasks.delete(id)
        return null
      }
      case 'sharing.create': {
        await this.requirePermission(params?.call?.permissionKey, '分享')
        return createShareDescriptor(params?.request ?? {})
      }
      case 'sharing.resolve':
        return shareDescriptorFromUrl(String(params?.url ?? ''))
      case 'sharing.revoke':
        await this.requirePermission(params?.call?.permissionKey, '撤销分享')
        return null
      case 'rooms.getState': {
        await this.requirePermission(params?.call?.permissionKey, '一起听状态读取')
        const { useListenTogetherStore } = await import('@/stores/listenTogether')
        const room = useListenTogetherStore()
        return pluginRoomState({
          room: room.room,
          members: room.members,
          role: room.myRole
        })
      }
      case 'rooms.join': {
        await this.requirePermission(params?.call?.permissionKey, '一起听控制')
        const { useListenTogetherStore } = await import('@/stores/listenTogether')
        const room = useListenTogetherStore()
        await room.resolveAndJoin(String(params?.inviteCode ?? ''))
        return pluginRoomState({
          room: room.room,
          members: room.members,
          role: room.myRole
        })
      }
      case 'rooms.leave': {
        await this.requirePermission(params?.call?.permissionKey, '一起听控制')
        const { useListenTogetherStore } = await import('@/stores/listenTogether')
        await useListenTogetherStore().leave()
        return null
      }
      case 'rooms.requestTrack': {
        await this.requirePermission(params?.call?.permissionKey, '一起听控制')
        const { useListenTogetherStore } = await import('@/stores/listenTogether')
        const room = useListenTogetherStore()
        const { usePlayerStore } = await import('@/stores/player')
        const player = usePlayerStore()
        const candidates = player.currentTrack ? [player.currentTrack, ...player.queue] : player.queue
        const track = findTrackByRef(params?.track, candidates)
        if (!track || !room.requestTrack(track)) throw new Error('点播歌曲不在当前队列中')
        return null
      }
      case 'devices.list': {
        await this.requirePermission(params?.call?.permissionKey, '音频设备控制')
        return pluginAudioDevices()
      }
      case 'devices.select': {
        await this.requirePermission(params?.call?.permissionKey, '音频设备控制')
        selectPluginAudioDevice(params?.id)
        return null
      }
      case 'ai.generate': {
        await this.requirePermission(params?.call?.permissionKey, 'AI 服务')
        const settings = useSettingsStore()
        return generatePluginAI(params?.request ?? {}, {
          provider: settings.settings.aiProvider,
          apiKey: settings.settings.aiApiKey,
          baseURL: settings.settings.aiBaseURL,
          model: settings.settings.aiModel
        })
      }
      case 'sockets.connect': {
        const options = validateSocketOptions(params?.options ?? {})
        await this.requirePermission(options.permissionKey, 'network.socket')
        const socket = await this.connectSocket(options)
        return { id: socket.id }
      }
      case 'sockets.send': {
        const socket = this.sockets.get(String(params?.id ?? ''))
        if (!socket) throw new Error('Socket 不存在或已断开')
        await socket.send(params?.data)
        return null
      }
      case 'sockets.emit': {
        const socket = this.sockets.get(String(params?.id ?? ''))
        if (!socket) throw new Error('Socket 不存在或已断开')
        await socket.emit(String(params?.event ?? ''), params?.data)
        return null
      }
      case 'sockets.disconnect': {
        const socket = this.sockets.get(String(params?.id ?? ''))
        if (socket) {
          this.sockets.delete(socket.id)
          await socket.disconnect()
        }
        return null
      }
      case 'window.control':
        return null
      default:
        throw new Error(`未实现的 Host RPC：${method}`)
    }
  }

  private async requirePermission(key: string | undefined, group: string): Promise<void> {
    if (!key) return
    const status = await requestPermission(this.record.key, key)
    if (status !== 'granted') {
      throw new Error('此功能尚未获得授权，请在插件权限中允许“' + group + '”后重试')
    }
  }

  private capabilityList() {
    const call = (service: string, methods: string[], permissionGroups: string[]) => ({
      service,
      version: '1.0.0',
      available: true,
      methods,
      permissionGroups
    })
    return [
      call('account', ['getSession', 'getProfile', 'openLogin'], ['account']),
      call('app', ['getInfo', 'openSettings', 'openExternal'], ['external']),
      call('library', ['playlists.list', 'playlists.getTracks', 'playlists.import', 'playlists.removeTracks', 'playlists.clearPlaylist'], ['libraryRead', 'libraryManage']),
      call('player', ['getState', 'play', 'pause', 'next', 'previous', 'seek', 'setVolume', 'setMode'], ['playbackRead', 'playbackControl']),
      call('queue', ['get', 'append', 'replace', 'remove', 'reorder'], ['playbackRead', 'playbackControl']),
      call('favorites', ['contains', 'add', 'remove'], ['libraryRead', 'libraryManage']),
      call('history', ['list'], ['playbackRead']),
      call('downloads', ['list', 'create', 'pause', 'resume', 'cancel', 'retry', 'reveal'], ['downloads']),
      call('files', ['pick', 'pickDirectory', 'readText', 'readBase64', 'saveText', 'writeText'], ['files']),
      call('clipboard', ['readText', 'writeText'], ['clipboardRead', 'clipboardWrite']),
      call('localMusic', ['list', 'scan', 'getTags', 'writeTags'], ['localMusic']),
      call('settings', ['get', 'update'], ['settingsRead', 'settingsWrite']),
      call('guests', ['list', 'import', 'select', 'remove', 'invoke'], []),
      call('window', ['control'], ['window']),
      call('tasks', ['schedule', 'cancel'], ['background']),
      call('ai', ['generate'], ['ai']),
      call('sharing', ['create', 'revoke', 'resolve'], ['sharing']),
      call('rooms', ['getState', 'join', 'leave', 'requestTrack'], ['roomsRead', 'roomsControl']),
      call('sockets', ['connect', 'send', 'emit', 'disconnect'], ['network']),
      call('devices', ['list', 'select'], ['devices'])
    ]
  }

  private scheduleTask(task: PluginScheduledTask) {
    const previous = this.scheduledTasks.get(task.id)
    if (previous) clearTimeout(previous.timer)
    const timer = setTimeout(() => {
      void this.invokeAction(task.commandId, {}).catch((error) => {
        this.options.onLog?.({
          pluginKey: this.record.key,
          level: 'warn',
          message: '插件后台任务执行失败: ' + (error instanceof Error ? error.message : String(error)),
          at: Date.now()
        })
      })
      this.scheduleTask(task)
    }, task.intervalMs)
    this.scheduledTasks.set(task.id, { ...task, timer })
  }

  private async connectSocket(options: ReturnType<typeof validateSocketOptions>): Promise<PluginSocketRuntime> {
    const id = 'socket-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
    if (options.kind === 'websocket') {
      const socket = new WebSocket(options.url)
      socket.onopen = () => this.publish(socketEventName(id, 'open'), null)
      socket.onmessage = (event) => this.publish(socketEventName(id, 'message'), parseSocketPayload(event))
      socket.onclose = (event) => this.publish(socketEventName(id, 'close'), event.reason || 'closed')
      socket.onerror = () => this.publish(socketEventName(id, 'error'), 'Socket connection failed')
      const runtime: PluginSocketRuntime = {
        id,
        kind: 'websocket',
        send: async (data) => socket.send(typeof data === 'string' ? data : JSON.stringify(data)),
        emit: async () => {
          throw new Error('原生 WebSocket 不支持 emit，请使用 send')
        },
        disconnect: async () => socket.close(),
        close: () => socket.close()
      }
      this.sockets.set(id, runtime)
      return runtime
    }

    const { io } = await import('socket.io-client')
    const socket = io(options.url, {
      ...(options.path ? { path: options.path } : {}),
      ...(options.auth ? { auth: options.auth } : {}),
      reconnection: options.reconnection !== false,
      transports: ['websocket']
    })
    socket.onAny((event, ...args) => {
      const value = args.length === 1 ? args[0] : args
      this.publish(socketEventName(id, String(event)), value)
    })
    socket.on('connect', () => this.publish(socketEventName(id, 'connect'), null))
    socket.on('disconnect', (reason) => this.publish(socketEventName(id, 'disconnect'), reason))
    socket.on('connect_error', (error) => this.publish(socketEventName(id, 'error'), error?.message || 'Socket connection failed'))
    const runtime: PluginSocketRuntime = {
      id,
      kind: 'socket.io',
      send: async (data) => {
          socket.send(data)
        },
      emit: async (event, data) => {
          socket.emit(event, data)
        },
      disconnect: async () => {
          await socket.disconnect()
        },
      close: () => socket.disconnect()
    }
    this.sockets.set(id, runtime)
    return runtime
  }

  private clearSockets() {
    for (const socket of this.sockets.values()) {
      try {
        socket.close()
      } catch {
        // Closing a failed socket must not block runtime teardown.
      }
    }
    this.sockets.clear()
  }

  private clearScheduledTasks() {
    for (const task of this.scheduledTasks.values()) clearTimeout(task.timer)
    this.scheduledTasks.clear()
  }

  private pickedFiles = new Map<string, File>()

  private async pickFiles(request: any): Promise<any[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = request?.multiple !== false
      input.accept = (request?.extensions ?? []).map((ext: string) => `.${ext}`).join(',')
      input.style.display = 'none'
      document.body.appendChild(input)
      input.onchange = () => {
        const files = Array.from(input.files ?? [])
        const handles = files.map((file) => {
          const id = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`
          this.pickedFiles.set(id, file)
          return {
            kind: 'file',
            id,
            name: file.name,
            size: file.size,
            mime: file.type
          }
        })
        input.remove()
        resolve(handles)
      }
      input.oncancel = () => {
        input.remove()
        resolve([])
      }
      input.click()
    })
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        resolve(result.slice(result.indexOf(',') + 1))
      }
      reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
      reader.readAsDataURL(blob)
    })
  }
}

export class PluginRuntimeManager {
  private runtimes = new Map<string, PluginRuntime>()
  private logSink: ((entry: PluginLogEntry) => void) | null = null
  private surfaceStates = new Map<string, any>()
  private surfaceListeners = new Set<
    (event: { pluginKey: string; surfaceId: string; state: any }) => void
  >()

  setLogSink(sink: (entry: PluginLogEntry) => void) {
    this.logSink = sink
  }

  async activate(
    record: PluginRecord,
    config: Record<string, any>,
    permissions: string[],
    deniedPermissions: string[]
  ): Promise<PluginRuntimeInfo> {
    await this.deactivate(record.key)
    const runtime = new PluginRuntime({
      record,
      config,
      permissions,
      deniedPermissions,
      onLog: (entry) => this.logSink?.(entry),
      onNotice: (notice) => {
        if (notice?.data?.message || notice?.data?.body) {
          void showToast(notice.data.message || notice.data.body)
        }
      },
      onState: ({ surfaceId, state }) => {
        try {
          if (JSON.stringify(state).length > 256 * 1024) return
        } catch {
          return
        }
        this.surfaceStates.set(record.key + '\n' + surfaceId, state)
        for (const listener of this.surfaceListeners) {
          listener({ pluginKey: record.key, surfaceId, state })
        }
      },
      onClosed: () => this.runtimes.delete(record.key),
      onFailed: (error) => {
        this.logSink?.({
          pluginKey: record.key,
          level: 'error',
          message: error,
          at: Date.now()
        })
      }
    })
    this.runtimes.set(record.key, runtime)
    try {
      return await runtime.start()
    } catch (error) {
      this.runtimes.delete(record.key)
      runtime.dispose()
      throw error
    }
  }

  deactivate(pluginKey: string): void {
    const runtime = this.runtimes.get(pluginKey)
    if (!runtime) return
    runtime.dispose()
    this.runtimes.delete(pluginKey)
    void import('@/services/plugin/guests')
      .then(({ disposeGuestStore }) => disposeGuestStore(pluginKey))
      .catch(() => undefined)
    for (const key of [...this.surfaceStates.keys()]) {
      if (key.startsWith(pluginKey + '\n')) this.surfaceStates.delete(key)
    }
  }

  getSurfaceState(pluginKey: string, surfaceId: string): any {
    return this.surfaceStates.get(pluginKey + '\n' + surfaceId) ?? {}
  }

  setSurfaceState(pluginKey: string, surfaceId: string, state: any): void {
    this.surfaceStates.set(pluginKey + '\n' + surfaceId, state)
    for (const listener of this.surfaceListeners) {
      listener({ pluginKey, surfaceId, state })
    }
  }

  onSurfaceState(
    listener: (event: { pluginKey: string; surfaceId: string; state: any }) => void
  ): () => void {
    this.surfaceListeners.add(listener)
    return () => this.surfaceListeners.delete(listener)
  }

  get(pluginKey: string): PluginRuntime | undefined {
    return this.runtimes.get(pluginKey)
  }

  isActive(pluginKey: string): boolean {
    return this.runtimes.has(pluginKey)
  }

  publish(event: string, value: any) {
    for (const runtime of this.runtimes.values()) runtime.publish(event, value)
  }

  disposeAll() {
    for (const runtime of this.runtimes.values()) runtime.dispose()
    this.runtimes.clear()
  }
}

export const pluginRuntimeManager = new PluginRuntimeManager()
