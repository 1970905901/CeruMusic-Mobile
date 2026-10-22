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
import { assertOwnedRefs, type OwnershipContext } from '@/services/plugin/ownership'
import { checkPermissionDeclaration, permissionLabel } from '@/services/plugin/permissions'
import {
  MAX_STORAGE_VALUE_BYTES,
  checkStorageKey,
  storageValueBytes
} from '@/services/plugin/pluginStorage'
import { isPrivateUrl } from '@/services/plugin/networkScope'
import { assertNavigationRequest } from '@shiqianjiang/ceru-plugin-sdk'
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

/**
 * 导出文件名清洗：插件给的 `suggestedName` 会被拼进 `exports/<name>`。
 * 必须剥掉路径分隔符与 `..`，否则插件能把文件写到 `exports/` 之外，
 * 覆盖应用目录里的其它文件（桌面版走的是系统保存对话框，没有这个问题）。
 */
/**
 * 校验插件传来的下载任务 id：必须是非空字符串数组，且每个 id 都真实存在。
 * 桌面 `services.downloads.*` 对不存在的任务会直接抛错，移动端此前静默跳过。
 */
export function assertDownloadIds(
  tasks: readonly { id: string }[],
  value: unknown
): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('下载任务列表无效')
  if (value.length > 200) throw new Error('一次最多操作 200 个下载任务')
  const known = new Set(tasks.map((task) => task.id))
  const ids: string[] = []
  for (const item of value) {
    const id = typeof item === 'string' ? item.trim() : ''
    if (!id || !known.has(id)) throw new Error('下载任务不存在')
    ids.push(id)
  }
  return ids
}

export function safeExportName(value: unknown): string {
  const raw = String(value ?? '').trim() || 'ceru-export.txt'
  const base = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 120)
  return cleaned || 'ceru-export.txt'
}

export function jsonHeaders(headers?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)])
  )
}

export function buildUrl(input: any): string {
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

async function requestPermission(
  pluginKey: string,
  key: string,
  name?: string
): Promise<'granted' | 'denied' | 'prompt'> {
  const settings = useSettingsStore()
  if (settings.isPermissionGranted(pluginKey, key)) return 'granted'
  if (settings.isPermissionDenied(pluginKey, key)) return 'denied'
  const label = name ? permissionLabel(name) : key
  const alert = await alertController.create({
    header: '插件权限',
    // 用权限的规范名而不是插件自造的 key：用户要看得懂自己在同意什么。
    message: `插件 ${pluginKey} 请求权限：${label}`,
    buttons: [
      { text: '拒绝', role: 'cancel' },
      { text: '允许', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role === 'confirm') {
    settings.grantPermission(pluginKey, key, name)
    return 'granted'
  }
  settings.denyPermission(pluginKey, key, name)
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

/**
 * 插件能力的权限判定。
 *
 * permissionKey 由插件侧传入，插件可以给任意字符串；这里必须把「缺省」视为拒绝，
 * 而不是像旧实现那样 `if (!key) return` 直接放行——否则插件只要不传 key 就能免授权。
 */
export function resolvePermissionKey(key: string | undefined | null): string | null {
  const value = typeof key === 'string' ? key.trim() : ''
  return value ? value : null
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
    // 插件停用/卸载/崩溃后不会再调用 ui.progress.close，
    // 不清理的话它的进度卡片会永远挂在界面上。
    void import('@/services/pluginProgress').then(({ clearPluginProgress }) =>
      clearPluginProgress(this.record.key)
    )
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
      case 'http.request': {
        // 局域网/本机地址要额外声明并获批 network.private（桌面 requestNetwork 同口径）。
        if (isPrivateUrl(String(params?.url ?? ''))) {
          await this.requirePrivateNetwork(params?.permissionKey)
        }
        return performHttp(params)
      }
      // 键与值都要校验（桌面 `PluginStorage.invoke` 同口径）：脏键会永久留在
      // 数据库里，超大值会把整个 IndexedDB 撑到影响所有插件与本地数据。
      case 'storage.get': {
        const keyError = checkStorageKey(params?.key)
        if (keyError) throw new Error(keyError)
        return kvGet(pluginStorageKey(this.record.key, params.key), null)
      }
      case 'storage.set': {
        const keyError = checkStorageKey(params?.key)
        if (keyError) throw new Error(keyError)
        const bytes = storageValueBytes(params?.value)
        if (bytes === null) throw new Error('存储值必须是 JSON')
        if (bytes > MAX_STORAGE_VALUE_BYTES) throw new Error('插件存储超过 10 MiB')
        await kvSet(pluginStorageKey(this.record.key, params.key), params.value)
        return null
      }
      case 'storage.delete': {
        const keyError = checkStorageKey(params?.key)
        if (keyError) throw new Error(keyError)
        await kvDelete(pluginStorageKey(this.record.key, params.key))
        return null
      }
      case 'permissions.request': {
        // 直接请求权限同样要核对声明：否则插件可以绕过 `requirePermission`
        // 先把任意 key 授权下来，再在后续调用里使用。
        const key = resolvePermissionKey(params?.key)
        const declaration = (this.manifest.permissions ?? []).find(
          (item) => String(item.key ?? '') === (key ?? '')
        )
        if (!key || !declaration) throw new Error('插件未声明该权限')
        return requestPermission(this.record.key, key)
      }
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
        // 后台弹系统通知要单独授权（SDK 的 notifications 组只有
        // `notifications.system`）；前台只是 toast，不打扰系统通知栏。
        if (document.visibilityState !== 'visible') {
          await this.requirePermission(params?.call?.permissionKey, 'notifications.system')
        }
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
        // 用 SDK 自带的校验：页面白名单、query 长度、sectionId 必须由本插件声明。
        // 此前未知页面会被静默跳到「发现」页，插件以为导航成功了。
        assertNavigationRequest(params ?? {}, this.manifest)
        const { default: router } = await import('@/router')
        const page = params.page as string
        if (page === 'search') {
          await router.push({ path: '/tabs/search', query: { q: params.query ?? '' } })
          return null
        }
        if (page === 'playlist') {
          const ref = params.ref
          if (!ref || ref.kind !== 'playlist') {
            // 没给具体歌单时退回到歌单列表，而不是假装打开了某张歌单。
            await router.push('/tabs/library')
            return null
          }
          await router.push({
            path:
              '/playlist/remote-' +
              encodeURIComponent(String(ref.providerId ?? '')) +
              '-' +
              encodeURIComponent(String(ref.id ?? '')),
            query: {
              source: String(ref.providerId ?? ''),
              providerId: String(ref.providerId ?? ''),
              remoteId: String(ref.id ?? ''),
              kind: 'playlist'
            }
          })
          return null
        }
        if (page === 'charts') {
          await router.push('/tabs/discover')
          return null
        }
        if (page === 'downloads') {
          await router.push('/downloads')
          return null
        }
        if (page === 'account') {
          await router.push('/account')
          return null
        }
        // settings
        await router.push('/tabs/settings')
        return null
      }
      case 'ui.progress.create': {
        const { createPluginProgress } = await import('@/services/pluginProgress')
        return createPluginProgress(params, this.record.key)
      }
      case 'ui.progress.update': {
        const { updatePluginProgress } = await import('@/services/pluginProgress')
        if (params?.id) {
          updatePluginProgress(String(params.id), params.value ?? params, this.record.key)
        }
        return null
      }
      case 'ui.progress.close': {
        const { closePluginProgress } = await import('@/services/pluginProgress')
        if (params?.id) closePluginProgress(String(params.id), this.record.key)
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
        // 与桌面同口径：只允许插件声明的导入器，参数长度有上限。
        const importers = this.manifest.contributes?.playlistImporters ?? []
        const importerId = String(params?.importerId ?? '')
        if (!importers.length || !importers.some((item) => item.id === importerId)) {
          throw new Error('插件未声明此歌单导入能力')
        }
        const initial = String(params?.value ?? params?.initialValue ?? '')
        if (initial.length > 8192) throw new Error('歌单导入参数过长')
        const title = String(params?.title ?? '导入歌单').slice(0, 100)
        // 方法名是 open：必须先让用户确认内容，不能拿插件传的值直接建歌单。
        const alert = await alertController.create({
          header: title,
          inputs: [{ name: 'value', type: 'text', value: initial, placeholder: '歌单链接或 ID' }],
          buttons: [
            { text: '取消', role: 'cancel' },
            { text: '导入', role: 'confirm' }
          ]
        })
        await alert.present()
        const { role, data } = await alert.onDidDismiss()
        if (role !== 'confirm') return null
        const value = String(data?.values?.value ?? '').trim()
        if (!value) return null
        const { useLibraryStore } = await import('@/stores/library')
        const library = useLibraryStore()
        await library.importPlaylistFromPlugin(this.record.key, params?.pluginId, importerId, value)
        return null
      }
      case 'ui.pluginUpdate.request': {
        // 与桌面同口径：只接受 HTTPS 地址，先让用户确认，再走插件自己的
        // sourceUrl 更新并校验 manifest id 未变。此前移动端只弹一句
        // 「请重新导入文件」，插件根本无法自更新。
        let url: URL
        try {
          url = new URL(String(params?.url ?? ''))
        } catch {
          throw new Error('插件更新地址无效')
        }
        if (url.protocol !== 'https:' || url.username || url.password) {
          throw new Error('插件更新地址必须使用 HTTPS')
        }
        const version = String(params?.version ?? '').trim()
        const notes = String(params?.notes ?? '').trim()
        const confirm = await alertController.create({
          header: version ? `更新到 ${version}` : '更新插件',
          message: notes || '更新将保留现有配置和授权。',
          buttons: [
            { text: '取消', role: 'cancel' },
            { text: '更新', role: 'confirm' }
          ]
        })
        await confirm.present()
        const { role } = await confirm.onDidDismiss()
        if (role !== 'confirm') return { accepted: false, updated: false }
        const { usePluginStore } = await import('@/stores/plugins')
        try {
          const updated = await usePluginStore().updateFromUrl(this.record.key)
          await showToast(`插件已更新到 ${updated.manifest.version || version}`)
          return { accepted: true, updated: true, version: updated.manifest.version || version }
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : '插件更新失败')
        }
      }
      case 'guests.list': {
        const { guestStoreFor } = await import('@/services/plugin/guests')
        return guestStoreFor(this.record).list()
      }
      // 子插件是**嵌在别的插件里运行的第三方脚本**，管理它们要单独授权
      // （桌面 `guests.manage` / `guests.run`）；此前移动端一项都不校验。
      case 'guests.import': {
        await this.requirePermission(params?.call?.permissionKey, 'guests.manage')
        const { guestStoreFor } = await import('@/services/plugin/guests')
        const store = guestStoreFor(this.record)
        const adapterId = String(params?.adapterId || '')
        const file = await store.pickFile(adapterId)
        if (!file) return null
        return store.importFile(adapterId, file)
      }
      case 'guests.select': {
        await this.requirePermission(params?.call?.permissionKey, 'guests.manage')
        const { guestStoreFor } = await import('@/services/plugin/guests')
        const store = guestStoreFor(this.record)
        await store.select(params?.guestId ? String(params.guestId) : null)
        return null
      }
      case 'guests.remove': {
        await this.requirePermission(params?.call?.permissionKey, 'guests.manage')
        const { guestStoreFor } = await import('@/services/plugin/guests')
        const store = guestStoreFor(this.record)
        await store.remove(String(params?.guestId || ''))
        return null
      }
      case 'guests.invoke': {
        await this.requirePermission(params?.call?.permissionKey, 'guests.run')
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
        // 与桌面一致：打开外部链接要授权，且只放行 http(s)、拒绝内嵌凭据的地址。
        await this.requirePermission(params?.call?.permissionKey, 'external.open')
        let target: URL
        try {
          target = new URL(String(params?.url ?? ''))
        } catch {
          throw new Error('只能打开 HTTP 或 HTTPS 地址')
        }
        if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) {
          throw new Error('只能打开 HTTP 或 HTTPS 地址')
        }
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: target.href })
        return null
      }
      case 'account.getSession':
      case 'account.getProfile': {
        await this.requirePermission(params?.call?.permissionKey, 'account.profile')
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
        await this.requirePermission(params?.operation?.permissionKey, 'account.profile')
        const { useAuthStore } = await import('@/stores/auth')
        const auth = useAuthStore()
        if (!auth.authenticated) await auth.login()
        if (!auth.authenticated) throw new Error('登录未完成')
        const { default: router } = await import('@/router')
        if (params?.operation?.next === 'profile') await router.push('/account')
        return null
      }
      // 歌单读写按桌面 `PluginHost` 分级：读取 / 导入 / 删除各自要对应授权，
      // 导入的条目必须是标准歌曲引用（否则会把插件私有结构塞进用户歌单）。
      case 'library.playlists.list': {
        await this.requirePermission(params?.call?.permissionKey, 'library.read')
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().asHostPlaylists()
      }
      case 'library.playlists.getTracks': {
        await this.requirePermission(params?.call?.permissionKey, 'library.read')
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().asHostTracks(params?.reference, params?.cursor)
      }
      case 'library.playlists.import': {
        await this.requirePermission(params?.call?.permissionKey, 'library.write')
        const request = params?.request ?? {}
        const items = Array.isArray(request.items) ? request.items : []
        if (items.some((item: any) => item?.ref?.kind !== 'track')) {
          throw new Error('歌单只接收标准歌曲')
        }
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().importHostPlaylist(request)
      }
      case 'library.playlists.removeTracks': {
        await this.requirePermission(params?.call?.permissionKey, 'library.delete')
        const { useLibraryStore } = await import('@/stores/library')
        await useLibraryStore().removeHostTracks(params?.reference, params?.tracks)
        return null
      }
      case 'library.playlists.clearPlaylist': {
        await this.requirePermission(params?.call?.permissionKey, 'library.delete')
        const { useLibraryStore } = await import('@/stores/library')
        await useLibraryStore().clearHostPlaylist(params?.reference)
        return null
      }
      // 播放器与队列统一校验授权与资源归属（桌面 `PluginHost` 的同一条规则）：
      // 读操作要 player.read，其余要 player.control；带 track 引用的操作还要求
      // 该引用属于本插件声明的 provider，否则插件可以往队列里塞别的音源的歌。
      case 'player.getState': {
        await this.requirePermission(params?.call?.permissionKey, 'player.read')
        const { usePlayerStore } = await import('@/stores/player')
        return usePlayerStore().hostState()
      }
      case 'player.play': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        // 桌面版同样只在传了 track 时校验（`data.args?.[0] != null`）。
        if (params?.track != null) {
          assertOwnedRefs([params.track.ref], 'track', this.ownershipContext())
        }
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().hostPlay(params?.track)
        return null
      }
      case 'player.pause': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().pause()
        return null
      }
      case 'player.next': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().next()
        return null
      }
      case 'player.previous': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().previous()
        return null
      }
      case 'player.seek': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().seek(Number(params?.positionMs) || 0)
        return null
      }
      case 'player.setVolume': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().setVolume(Number(params?.volume) || 0)
        return null
      }
      case 'player.setMode': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().setMode(params?.mode)
        return null
      }
      case 'queue.get': {
        await this.requirePermission(params?.call?.permissionKey, 'player.read')
        const { usePlayerStore } = await import('@/stores/player')
        return usePlayerStore().hostQueue()
      }
      case 'queue.append': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        assertOwnedRefs(
          (params?.tracks ?? []).map((entity: any) => entity?.ref),
          'track',
          this.ownershipContext()
        )
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().appendHostTracks(params?.tracks ?? [])
        return null
      }
      case 'queue.replace': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        assertOwnedRefs(
          (params?.tracks ?? []).map((entity: any) => entity?.ref),
          'track',
          this.ownershipContext()
        )
        const { usePlayerStore } = await import('@/stores/player')
        await usePlayerStore().replaceHostQueue(params?.tracks ?? [])
        return null
      }
      case 'queue.remove': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().removeHostTracks(params?.keys ?? [])
        return null
      }
      case 'queue.reorder': {
        await this.requirePermission(params?.call?.permissionKey, 'player.control')
        const { usePlayerStore } = await import('@/stores/player')
        usePlayerStore().reorderHostTracks(params?.keys ?? [])
        return null
      }
      // 收藏 / 历史 / 下载：与桌面 `PluginHost` 同一套授权与归属规则。
      case 'favorites.contains': {
        await this.requirePermission(params?.call?.permissionKey, 'library.read')
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().isFavorite(params?.track?.ref ?? params?.track)
      }
      case 'favorites.add': {
        await this.requirePermission(params?.call?.permissionKey, 'library.write')
        assertOwnedRefs([params?.track?.ref], 'track', this.ownershipContext())
        const { useLibraryStore } = await import('@/stores/library')
        await useLibraryStore().addHostFavorite(params?.track)
        return null
      }
      case 'favorites.remove': {
        await this.requirePermission(params?.call?.permissionKey, 'library.write')
        assertOwnedRefs([params?.track?.ref], 'track', this.ownershipContext())
        const { useLibraryStore } = await import('@/stores/library')
        await useLibraryStore().removeHostFavorite(params?.track)
        return null
      }
      case 'history.list': {
        await this.requirePermission(params?.call?.permissionKey, 'player.read')
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().historyPage(params?.cursor, params?.limit)
      }
      case 'downloads.list': {
        await this.requirePermission(params?.call?.permissionKey, 'downloads.manage')
        const { useDownloadStore } = await import('@/stores/downloads')
        return useDownloadStore().asHostTasks()
      }
      case 'downloads.create': {
        await this.requirePermission(params?.call?.permissionKey, 'downloads.create')
        const request = params?.request ?? {}
        const tracks = Array.isArray(request.tracks) ? request.tracks : []
        // 与桌面同口径：一次 1–100 个任务，且只能下载自己声明的资源。
        if (tracks.length < 1 || tracks.length > 100) {
          throw new Error('一次只能创建 1 到 100 个下载任务')
        }
        assertOwnedRefs(tracks, 'track', this.ownershipContext())
        const { useDownloadStore } = await import('@/stores/downloads')
        return useDownloadStore().createHostDownloads(request)
      }
      // 与桌面同口径：先确认每个 id 都真实存在，再执行操作。
      // 此前直接把插件给的 id 数组交给 store，不存在的 id 会被静默跳过，
      // 插件无从得知自己传错了，用户也看不到任何反馈。
      case 'downloads.pause': {
        await this.requirePermission(params?.call?.permissionKey, 'downloads.manage')
        const { useDownloadStore } = await import('@/stores/downloads')
        const store = useDownloadStore()
        const ids = assertDownloadIds(store.tasks, params?.ids)
        store.pause(ids)
        return null
      }
      case 'downloads.resume': {
        await this.requirePermission(params?.call?.permissionKey, 'downloads.manage')
        const { useDownloadStore } = await import('@/stores/downloads')
        const store = useDownloadStore()
        const ids = assertDownloadIds(store.tasks, params?.ids)
        store.resume(ids)
        return null
      }
      case 'downloads.cancel': {
        await this.requirePermission(params?.call?.permissionKey, 'downloads.manage')
        const { useDownloadStore } = await import('@/stores/downloads')
        const store = useDownloadStore()
        const ids = assertDownloadIds(store.tasks, params?.ids)
        store.cancel(ids)
        return null
      }
      case 'downloads.retry': {
        await this.requirePermission(params?.call?.permissionKey, 'downloads.manage')
        const { useDownloadStore } = await import('@/stores/downloads')
        const store = useDownloadStore()
        const ids = assertDownloadIds(store.tasks, params?.ids)
        store.retry(ids)
        return null
      }
      case 'downloads.reveal': {
        await this.requirePermission(params?.call?.permissionKey, 'downloads.manage')
        const { useDownloadStore } = await import('@/stores/downloads')
        const store = useDownloadStore()
        const [id] = assertDownloadIds(store.tasks, [params?.id])
        await store.share(id)
        return null
      }
      case 'files.pick':
        return this.pickFiles(params?.request)
      case 'files.pickDirectory':
        return this.pickDirectory()
      case 'files.readText': {
        // 与桌面 `handleFileService` 同口径：读取要 files.read 授权。
        // 只有「选文件」本身不需要——那是用户在系统面板里主动点的。
        await this.requirePermission(params?.call?.permissionKey, 'files.read')
        const file = this.pickedFiles.get(params?.file?.id)
        if (!file) throw new Error('文件句柄已过期')
        return file.text()
      }
      case 'files.readBase64': {
        await this.requirePermission(params?.call?.permissionKey, 'files.read')
        const file = this.pickedFiles.get(params?.file?.id)
        if (!file) throw new Error('文件句柄已过期')
        return this.blobToBase64(file)
      }
      case 'files.saveText': {
        // 写文件同样要 files.write；此前只校验了 readText/readBase64/writeText。
        await this.requirePermission(params?.operation?.permissionKey, 'files.write')
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
        const name = safeExportName(params?.request?.suggestedName)
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
        await this.requirePermission(params?.call?.permissionKey, 'files.write')
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
        const path = String(params?.file?.id || '')
        // 只能写回 `saveText` 给出的导出路径；否则插件可以借句柄覆盖
        // Documents 下的任意文件（包括用户自己的音频与歌词）。
        if (!path.startsWith('exports/')) throw new Error('只能写入导出的文件')
        await Filesystem.writeFile({
          path,
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
      // 本地音乐与桌面同口径：读（list / scan / getTags）要 localMusic.read，
      // 改标签要 localMusic.write。移动端此前一项都不校验，插件可以直接读用户
      // 本机音乐库、甚至改写音频文件里的标签。
      case 'localMusic.list': {
        await this.requirePermission(params?.call?.permissionKey, 'localMusic.read')
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().localMusicPage(params?.cursor, params?.limit)
      }
      case 'localMusic.scan': {
        await this.requirePermission(params?.call?.permissionKey, 'localMusic.read')
        // 插件传了目录句柄就只扫这些目录（Android SAF）；没传则沿用应用自己的扫描范围。
        const handles = Array.isArray(params?.directories) ? params.directories : []
        const folders = handles
          .map((handle: any) => this.pickedDirectories.get(String(handle?.id ?? '')))
          .filter((folder: any): folder is { uri: string; name: string } => Boolean(folder))
        if (handles.length && !folders.length) {
          throw new Error('目录句柄已过期，请重新选择文件夹')
        }
        if (folders.length) {
          const { importSafUris } = await import('@/services/safImport')
          const result = await importSafUris(folders)
          return { taskId: `scan-${Date.now().toString(36)}`, imported: result.imported, skipped: result.skipped }
        }
        const { useLibraryStore } = await import('@/stores/library')
        const records = await useLibraryStore().scanLocalMusic()
        return { taskId: `scan-${Date.now().toString(36)}`, imported: records.length }
      }
      case 'localMusic.getTags': {
        await this.requirePermission(params?.call?.permissionKey, 'localMusic.read')
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().localTags(params?.track)
      }
      case 'localMusic.writeTags': {
        await this.requirePermission(params?.call?.permissionKey, 'localMusic.write')
        const { useLibraryStore } = await import('@/stores/library')
        return useLibraryStore().writeLocalTags(params?.track, params?.tags)
      }
      case 'settings.get': {
        await this.requirePermission(params?.call?.permissionKey, 'settings.read')
        const settings = useSettingsStore()
        return pluginSettingsGet(params?.keys ?? [], settings.settings as Record<string, unknown>)
      }
      case 'settings.update': {
        // 写入同样要授权：公开白名单挡住了密钥类字段，但「改用户的播放设置」
        // 本身也该由用户同意（桌面 `services.settings.update` 要 settings.write）。
        await this.requirePermission(params?.call?.permissionKey, 'settings.write')
        const settings = useSettingsStore()
        pluginSettingsUpdate(params?.values, settings.settings as Record<string, any>)
        return null
      }
      case 'tasks.schedule': {
        await this.requirePermission(params?.call?.permissionKey, 'background.run')
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
        await this.requirePermission(params?.call?.permissionKey, 'sharing.publish')
        return createShareDescriptor(params?.request ?? {})
      }
      case 'sharing.resolve':
        return shareDescriptorFromUrl(String(params?.url ?? ''))
      case 'sharing.revoke':
        await this.requirePermission(params?.call?.permissionKey, 'sharing.revoke')
        return null
      case 'rooms.getState': {
        await this.requirePermission(params?.call?.permissionKey, 'rooms.read')
        const { useListenTogetherStore } = await import('@/stores/listenTogether')
        const room = useListenTogetherStore()
        return pluginRoomState({
          room: room.room,
          members: room.members,
          role: room.myRole
        })
      }
      case 'rooms.join': {
        await this.requirePermission(params?.call?.permissionKey, 'rooms.control')
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
        await this.requirePermission(params?.call?.permissionKey, 'rooms.control')
        const { useListenTogetherStore } = await import('@/stores/listenTogether')
        await useListenTogetherStore().leave()
        return null
      }
      case 'rooms.requestTrack': {
        await this.requirePermission(params?.call?.permissionKey, 'rooms.control')
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
        await this.requirePermission(params?.call?.permissionKey, 'devices.control')
        return pluginAudioDevices()
      }
      case 'devices.select': {
        await this.requirePermission(params?.call?.permissionKey, 'devices.control')
        selectPluginAudioDevice(params?.id)
        return null
      }
      case 'ai.generate': {
        await this.requirePermission(params?.call?.permissionKey, 'ai.use')
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
        // Socket 同 HTTP：连本机/内网还要 network.private。
        if (isPrivateUrl(String(options.url ?? ''))) {
          await this.requirePrivateNetwork(options.permissionKey)
        }
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


  /**
   * 访问局域网/本机地址的额外授权。
   *
   * 插件可能把 `network.private` 声明成一个独立的 key，也可能只在 scope 里注明；
   * 这里按「manifest 里声明了名字为 network.private 的条目」去授权，用的仍是
   * 那条声明自己的 key——与桌面 `declarations().some(p => p.name === 'network.private')`
   * 一致，不会凭空生成一个用户没见过的权限。
   */
  private async requirePrivateNetwork(fallbackKey?: string): Promise<void> {
    const declaration = (this.manifest.permissions ?? []).find(
      (item) => String(item.name ?? '') === 'network.private'
    )
    if (!declaration) {
      throw new Error('插件未声明权限：' + permissionLabel('network.private'))
    }
    await this.requirePermission(String(declaration.key ?? fallbackKey ?? ''), 'network.private')
  }

  /** 归属校验上下文：本插件的 manifest id 与声明的 provider。 */
  private ownershipContext(): OwnershipContext {
    return { manifestId: this.manifest.id, manifest: this.manifest }
  }

  /**
   * 校验「插件声明了这个权限」+「用户已授权」。
   *
   * 两步都不能省：只查授权会让插件随手造 key 弹出没有理由的授权框，
   * 从而绕开 manifest 声明；只查声明则等于没问过用户。
   */
  private async requirePermission(key: string | undefined, name: string): Promise<void> {
    const resolved = resolvePermissionKey(key)
    const declared = checkPermissionDeclaration(this.manifest.permissions, resolved ?? '', name)
    if (declared) throw new Error(declared)
    const status = resolved ? await requestPermission(this.record.key, resolved, name) : 'denied'
    if (status !== 'granted') {
      throw new Error(
        '此功能尚未获得授权，请在插件权限中允许“' + permissionLabel(name) + '”后重试'
      )
    }
  }

  private capabilityList() {
    const call = (
      service: string,
      methods: string[],
      permissionGroups: string[],
      available = true,
      reason?: 'host-not-connected' | 'unsupported'
    ) => ({
      service,
      version: '1.0.0',
      available,
      ...(reason ? { reason } : {}),
      methods,
      permissionGroups
    })
    // 插件应当先看 `available` 再调用。移动端有两处能力是**真的没有**，
    // 标成可用只会让插件在运行时撞上一句「未实现」，不如提前说明：
    // - window：手机上没有「最小化/最大化/迷你播放器」这类桌面窗口动作；
    // - files.pickDirectory：iOS/Web 没有可延续的目录句柄（Android SAF 才有）。
    const directoryPicking = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    return [
      call('account', ['getSession', 'getProfile', 'openLogin'], ['account']),
      call('app', ['getInfo', 'openSettings', 'openExternal'], ['external']),
      call('library', ['playlists.list', 'playlists.getTracks', 'playlists.import', 'playlists.removeTracks', 'playlists.clearPlaylist'], ['libraryRead', 'libraryManage']),
      call('player', ['getState', 'play', 'pause', 'next', 'previous', 'seek', 'setVolume', 'setMode'], ['playbackRead', 'playbackControl']),
      call('queue', ['get', 'append', 'replace', 'remove', 'reorder'], ['playbackRead', 'playbackControl']),
      call('favorites', ['contains', 'add', 'remove'], ['libraryRead', 'libraryManage']),
      call('history', ['list'], ['playbackRead']),
      call('downloads', ['list', 'create', 'pause', 'resume', 'cancel', 'retry', 'reveal'], ['downloads']),
      call(
        'files',
        directoryPicking
          ? ['pick', 'pickDirectory', 'readText', 'readBase64', 'saveText', 'writeText']
          : ['pick', 'readText', 'readBase64', 'saveText', 'writeText'],
        ['files']
      ),
      call('clipboard', ['readText', 'writeText'], ['clipboardRead', 'clipboardWrite']),
      call('localMusic', ['list', 'scan', 'getTags', 'writeTags'], ['localMusic']),
      call('settings', ['get', 'update'], ['settingsRead', 'settingsWrite']),
      call('guests', ['list', 'import', 'select', 'remove', 'invoke'], []),
      // 桌面窗口动作（最小化/最大化/迷你播放器）在手机上不存在：如实标记不可用。
      call('window', ['control'], ['window'], false, 'unsupported'),
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
  /** `files.pickDirectory` 返回的句柄 → SAF 目录，供 `localMusic.scan` 使用。 */
  private pickedDirectories = new Map<string, { uri: string; name: string }>()

  /**
   * 让插件选一个授权目录，返回可再传给 `localMusic.scan` 的句柄。
   *
   * 移动端只有 Android SAF 能给出「一个可以在后续操作中继续访问的目录」；
   * iOS 的 Document Picker 拿到的是一次性 URL，没有对应能力。
   * 因此这里在 iOS/Web 上明确返回 null，而不是给一个之后必然失效的假句柄。
   */
  private async pickDirectory(): Promise<{ kind: 'directory'; id: string; name: string } | null> {
    const { safImportSupported, pickSafDirectory } = await import('@/services/safImport')
    if (!safImportSupported()) return null
    const folder = await pickSafDirectory()
    const id = `dir-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    this.pickedDirectories.set(id, folder)
    return { kind: 'directory', id, name: folder.name }
  }

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

  /**
   * 推送账号会话。与其它事件不同，这条**必须逐插件生成**：
   * 插件看到的身份是 `sha256(manifestId:userId)`，拿原始 subject 推广播
   * 等于把所有插件当作同一个应用，也让插件能跨插件关联同一个用户。
   */
  async publishAccountSession(loggedIn: boolean, userId: string, displayName: string): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      const id = loggedIn && userId
        ? await pluginIdentity(runtime.record.manifestId, userId)
        : null
      runtime.publish('account.changed', {
        loggedIn: Boolean(id),
        profile: id ? { id, displayName, identityScope: 'plugin' } : null
      })
    }
  }

  disposeAll() {
    for (const runtime of this.runtimes.values()) runtime.dispose()
    this.runtimes.clear()
  }
}

export const pluginRuntimeManager = new PluginRuntimeManager()
