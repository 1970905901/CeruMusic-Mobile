import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { alertController, toastController } from '@ionic/vue'
import type { GuestAdapterView, GuestProviderInfo, GuestRecord, PluginRecord } from '@/types/plugin'
import { kvDelete, kvGet, kvSet, toPlain } from '@/services/db'
import { parsePluginArtifact } from '@/services/plugin/artifact'
import { loadPluginRuntimeAssets } from '@/services/pluginSurface'

const MAX_GUEST_BYTES = 2 * 1024 * 1024
const MAX_GUESTS = 64

function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '')
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

async function digestText(value: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    let a = 2166136261
    let b = 5381
    for (let index = 0; index < value.length; index++) {
      a ^= value.charCodeAt(index)
      a = Math.imul(a, 16777619)
      b = Math.imul(b, 33) ^ value.charCodeAt(index)
    }
    return (a >>> 0).toString(16).padStart(8, '0').repeat(4) +
      (b >>> 0).toString(16).padStart(8, '0').repeat(4)
  }
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function dataScript(source: string): string {
  return '<script src="data:text/javascript;base64,' + utf8Base64(source) + '"></script>'
}

export function readGuestInfo(script: string, fallback: string) {
  const comment = /^\s*\/\*[\s\S]*?\*\//.exec(script)?.[0] ?? ''
  const field = (key: string) =>
    new RegExp('@' + key + '[ \t]+([^\r\n*]+)').exec(comment)?.[1]?.trim().slice(0, 500)
  return {
    name: field('name') || fallback,
    version: field('version') || '0.0.0',
    author: field('author'),
    description: field('description'),
    homepage: field('homepage')
  }
}

export function privateHost(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (value === 'localhost' || value.endsWith('.local')) return true
  if (value.includes(':')) return !/^[23][0-9a-f]{3}:/.test(value)
  const [a, b] = value.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

async function guestHttpRequest(input: any, allowPrivate: () => boolean, signal?: AbortSignal): Promise<any> {
  const url = new URL(String(input?.url || ''))
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('子插件只支持 HTTP/HTTPS 请求')
  }
  if (privateHost(url.hostname) && !allowPrivate()) {
    throw new Error('请先授予局域网访问权限')
  }
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(input?.headers ?? {})) {
    if (/^(host|connection|content-length|transfer-encoding|proxy-.*|upgrade)$/i.test(name)) continue
    if (typeof value !== 'string' || /[\r\n]/.test(value)) throw new Error('HTTP 头无效')
    headers[name] = value
  }
  const timeoutMs = Math.min(60000, Math.max(1000, Number(input?.timeoutMs) || 30000))
  const body = input?.body
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url: url.href,
      method: String(input?.method || 'GET').toUpperCase(),
      headers,
      data: body,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: 'text'
    })
    const responseHeaders = Object.fromEntries(
      Object.entries(response.headers || {}).map(([key, value]) => [key, String(value)])
    )
    let parsed: any = response.data
    const contentType = responseHeaders['content-type'] || responseHeaders['Content-Type'] || ''
    if (typeof parsed === 'string' && contentType.includes('json')) {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        // Keep the raw text when the server declared invalid JSON.
      }
    }
    return { status: response.status, headers: responseHeaders, body: parsed }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(url.href, {
      method: String(input?.method || 'GET').toUpperCase(),
      headers,
      body,
      signal: controller.signal
    })
    const text = await response.text()
    let parsed: any = text
    if ((response.headers.get('content-type') || '').includes('json')) {
      try {
        parsed = JSON.parse(text)
      } catch {
        // Keep raw text.
      }
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: parsed
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

async function confirmGuestInstall(
  pluginName: string,
  info: { name: string; version: string; author?: string; description?: string }
): Promise<boolean> {
  const alert = await alertController.create({
    header: '安装子插件',
    message:
      info.name + ' ' + info.version + (info.author ? ' · ' + info.author : '') +
      '\n将安装到 ' + pluginName + ' 的兼容环境。子插件网络请求会单独申请授权。' +
      (info.description ? '\n\n' + info.description : ''),
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '安装', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  return role === 'confirm'
}

async function notify(message: string, color = 'medium') {
  const element = await toastController.create({ message, duration: 2200, color })
  await element.present()
}

interface GuestRuntimeOptions {
  pluginKey: string
  pluginName: string
  guest: GuestRecord
  script: string
  html: string
  init: Record<string, any>
  grants: string[]
  allowedCapabilities: string[]
  projectableProtocols: string[]
  onGrant: (permission: 'network' | 'network.private', allowed: boolean) => Promise<void>
  onState: (state: 'ready' | 'stopped' | 'error', error?: string, providers?: GuestProviderInfo[]) => void
  onEvent: (type: string, data: any) => void
}

class GuestRuntime {
  private frame: HTMLIFrameElement
  private sessionId: string
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private requests = new Map<string, AbortController>()
  private grantPrompts = new Map<string, Promise<boolean>>()
  private readyPromise: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void
  private readySettled = false
  private disposed = false
  private started = false
  private invokeSequence = 0
  private grants: Set<string>

  constructor(private options: GuestRuntimeOptions) {
    this.sessionId = String(options.init.generation || uid())
    this.grants = new Set(options.grants)
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.readyPromise.catch(() => undefined)
    this.frame = document.createElement('iframe')
    this.frame.setAttribute('sandbox', 'allow-scripts')
    this.frame.setAttribute('aria-hidden', 'true')
    this.frame.style.cssText =
      'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0;pointer-events:none'
    this.frame.srcdoc = options.html
    this.frame.addEventListener('load', () => {
      this.send('init', options.init)
    })
    window.addEventListener('message', this.receive)
    document.body.appendChild(this.frame)
    setTimeout(() => {
      if (!this.readySettled) {
        this.fail(new Error('子插件初始化超时'))
      }
    }, 20000)
  }

  private send(type: string, data: unknown) {
    if (this.disposed || !this.frame.contentWindow) return
    try {
      this.frame.contentWindow.postMessage(
        JSON.parse(JSON.stringify({ type, data, generation: this.sessionId })),
        '*'
      )
    } catch {
      // A closing iframe can disappear between the check and postMessage.
    }
  }

  private receive = async (event: MessageEvent) => {
    if (event.source !== this.frame.contentWindow || !event.data || typeof event.data !== 'object') return
    const { type, data, generation } = event.data
    if (type === 'ready') {
      this.send('init', this.options.init)
      return
    }
    if (generation !== this.sessionId) return
    if (type === 'bootstrap-ready') {
      this.started = true
      return
    }
    if (type === 'guest-metadata') {
      const providers = Array.isArray(data?.providers) ? data.providers : []
      for (const provider of providers) {
        if (
          provider?.protocols?.some(
            (protocol: string) => !this.options.projectableProtocols.includes(protocol)
          )
        ) {
          this.fail(new Error('子插件能力超出兼容环境声明'))
          return
        }
        if (
          !provider ||
          typeof provider.id !== 'string' ||
          typeof provider.name !== 'string' ||
          !Array.isArray(provider.qualities) ||
          !Array.isArray(provider.protocols)
        ) {
          this.fail(new Error('子插件返回了无效的平台声明'))
          return
        }
      }
      this.options.onState('ready', undefined, providers as GuestProviderInfo[])
      this.readySettled = true
      this.resolveReady()
      return
    }
    if (type === 'failed') {
      this.fail(new Error(String(data?.message || '子插件加载失败')))
      return
    }
    if (type === 'notify') {
      const message = String(data?.message || data?.body || '')
      if (message) {
        if (data?.level === 'warning') await notify(message, 'warning')
        else this.options.onEvent('notify', data)
      }
      return
    }
    if (type === 'log') {
      this.options.onEvent('log', data)
      return
    }
    if (type === 'disposed') {
      this.stop()
      return
    }
    if (type === 'invoke-result') {
      const pending = this.pending.get(String(data?.id))
      if (!pending) return
      this.pending.delete(String(data.id))
      clearTimeout(pending.timer)
      if (data.error) pending.reject(new Error(String(data.error)))
      else pending.resolve(data.value)
      return
    }
    if (type !== 'rpc' || typeof data?.id !== 'string') return
    try {
      const value = await this.handleRpc(String(data.method || ''), data.data)
      this.send('rpc-result', { id: data.id, value })
    } catch (error) {
      this.send('rpc-result', {
        id: data.id,
        error: error instanceof Error ? error.message : '子插件宿主调用失败'
      })
    }
  }

  private async ensureGrant(permission: 'network' | 'network.private'): Promise<boolean> {
    if (this.grants.has(permission)) return true
    if (this.grants.has('deny:' + permission)) return false
    const existing = this.grantPrompts.get(permission)
    if (existing) return existing
    const prompt = (async () => {
      const alert = await alertController.create({
        header: permission === 'network' ? '访问公网服务' : '访问局域网与本机服务',
        message:
          this.options.guest.name + '（子插件）请求' +
          (permission === 'network' ? '访问互联网。' : '访问局域网或本机地址。') +
          '此授权仅属于该子插件。',
        buttons: [
          { text: '拒绝', role: 'cancel' },
          { text: '允许', role: 'confirm' }
        ]
      })
      await alert.present()
      const { role } = await alert.onDidDismiss()
      const allowed = role === 'confirm'
      if (allowed) this.grants.add(permission)
      else this.grants.add('deny:' + permission)
      await this.options.onGrant(permission, allowed)
      return allowed
    })().finally(() => this.grantPrompts.delete(permission))
    this.grantPrompts.set(permission, prompt)
    return prompt
  }

  private async handleRpc(method: string, input: any): Promise<any> {
    if (method === 'guest.http.request') {
      if (!this.options.allowedCapabilities.includes('network.request')) {
        throw new Error('兼容环境未声明子插件网络能力')
      }
      if (!(await this.ensureGrant('network'))) throw new Error('此子插件没有网络权限')
      const requestId = String(input?.requestId || uid())
      if (this.requests.size >= 16) throw new Error('子插件并发请求过多')
      const controller = new AbortController()
      this.requests.set(requestId, controller)
      try {
        const allowPrivate = () => this.grants.has('network.private')
        if (input?.url && privateHost(new URL(input.url).hostname) && !allowPrivate()) {
          if (!this.options.allowedCapabilities.includes('network.private')) {
            throw new Error('兼容环境未声明子插件局域网能力')
          }
          if (!(await this.ensureGrant('network.private'))) throw new Error('此子插件没有局域网权限')
        }
        return await guestHttpRequest(input, allowPrivate, controller.signal)
      } finally {
        this.requests.delete(requestId)
      }
    }
    if (method === 'guest.http.cancel') {
      this.requests.get(String(input?.requestId || ''))?.abort()
      return null
    }
    if (method === 'operations.cancel') {
      for (const controller of this.requests.values()) controller.abort()
      return null
    }
    if (method === 'guest.notify') {
      this.options.onEvent('notify', input)
      return null
    }
    throw new Error('子插件没有此宿主能力: ' + method)
  }

  private fail(error: Error) {
    if (this.readySettled || this.disposed) return
    this.readySettled = true
    this.rejectReady(error)
    this.options.onState('error', error.message)
  }

  async waitReady(): Promise<void> {
    await this.readyPromise
  }

  async invoke(method: string, input: any): Promise<any> {
    await this.readyPromise
    if (this.disposed) throw new Error('子插件已停止')
    if (!/^[a-zA-Z][\w.-]{0,127}$/.test(method)) throw new Error('无效的子插件方法')
    const id = 'guest-' + ++this.invokeSequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('子插件操作超时'))
      }, 120000)
      this.pending.set(id, { resolve, reject, timer })
      this.send('invoke', {
        id,
        kind: 'guest',
        target: this.options.guest.id,
        method,
        args: [input]
      })
    })
  }

  stop() {
    if (this.disposed) return
    this.send('dispose', {})
    this.disposed = true
    window.removeEventListener('message', this.receive)
    this.frame.remove()
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('子插件已停止'))
    }
    this.pending.clear()
    for (const controller of this.requests.values()) controller.abort()
    this.requests.clear()
    this.options.onState('stopped')
  }
}

export { GuestRuntime }

export class PluginGuestStore {
  private records: GuestRecord[] = []
  private runtimes = new Map<string, GuestRuntime>()
  private initialized = false
  private initializing: Promise<void> | null = null
  private onChanged: (() => void) | undefined
  private artifact: ReturnType<typeof parsePluginArtifact>
  private indexKey: string
  private scriptPrefix: string

  constructor(
    private record: PluginRecord,
    changed?: () => void
  ) {
    this.artifact = parsePluginArtifact(record.artifactSource || record.code)
    this.indexKey = 'plugin:' + record.key + ':guestIndex'
    this.scriptPrefix = 'plugin:' + record.key + ':guestScript:'
    this.onChanged = changed
  }

  setChangedHandler(changed: () => void) {
    this.onChanged = changed
  }

  adapters(): GuestAdapterView[] {
    const manifest = this.artifact.manifest
    if (manifest.guestPolicy?.maxDepth !== 1) return []
    return (manifest.contributes?.guestAdapters || []).map((adapter) => ({
      id: adapter.id,
      title: adapter.title || adapter.id,
      extensions: adapter.extensions || ['js'],
      format: adapter.format,
      badge: adapter.badge
    }))
  }

  async init(): Promise<void> {
    if (this.initialized) return
    if (this.initializing) return this.initializing
    this.initializing = (async () => {
      const stored = await kvGet<GuestRecord[]>(this.indexKey, [])
      this.records = Array.isArray(stored)
        ? stored
            .filter(
              (item) =>
                item &&
                typeof item.id === 'string' &&
                typeof item.adapterId === 'string' &&
                this.adapters().some((adapter) => adapter.id === item.adapterId)
            )
            .slice(0, MAX_GUESTS)
            .map((item) => ({
              ...item,
              pluginKey: this.record.key,
              selected: !!item.selected,
              grants: Array.isArray(item.grants) ? item.grants : [],
              providers: Array.isArray(item.providers) ? item.providers : [],
              state: 'stopped' as const,
              error: undefined
            }))
        : []
      this.initialized = true
    })().finally(() => {
      this.initializing = null
    })
    return this.initializing
  }

  async list(): Promise<GuestRecord[]> {
    await this.init()
    return this.records.map((item) => ({
      ...item,
      grants: [...item.grants],
      providers: item.providers.map((provider) => ({ ...provider }))
    }))
  }

  async exportSelected(adapterId: string): Promise<{
    script: string
    info: {
      adapterId: string
      name: string
      version: string
      author?: string
      providers: GuestProviderInfo[]
    }
  }> {
    await this.init()
    const record = this.records.find((item) => item.selected)
    if (!record || record.adapterId !== adapterId) {
      throw new Error('请先在插件详情中选择此兼容环境中的子音源')
    }
    const script = await this.getScript(record)
    return {
      script,
      info: {
        adapterId: record.adapterId,
        name: record.name,
        version: record.version,
        author: record.author,
        providers: record.providers.map((provider) => ({
          ...provider,
          qualities: [...provider.qualities],
          protocols: [...provider.protocols]
        }))
      }
    }
  }

  private async persist() {
    await kvSet(this.indexKey, toPlain(this.records))
  }

  private changed() {
    this.onChanged?.()
  }

  private adapter(adapterId: string) {
    return this.adapters().find((item) => item.id === adapterId)
  }

  async pickFile(adapterId: string): Promise<File | null> {
    const adapter = this.adapter(adapterId)
    if (!adapter) throw new Error('插件未声明此兼容环境')
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = adapter.extensions.map((extension: string) => '.' + extension.replace(/^\./, '')).join(',')
      input.style.display = 'none'
      document.body.appendChild(input)
      input.onchange = () => {
        const file = input.files?.[0] || null
        input.remove()
        resolve(file)
      }
      input.oncancel = () => {
        input.remove()
        resolve(null)
      }
      input.click()
    })
  }

  async importFile(adapterId: string, file: File): Promise<GuestRecord | null> {
    if (file.size > MAX_GUEST_BYTES) throw new Error('子插件不能超过 2 MiB')
    return this.importText(adapterId, await file.text(), file.name)
  }

  async importText(adapterId: string, script: string, fallback: string): Promise<GuestRecord | null> {
    await this.init()
    if (new TextEncoder().encode(script).length > MAX_GUEST_BYTES) {
      throw new Error('子插件不能超过 2 MiB')
    }
    if (!this.adapter(adapterId)) throw new Error('插件未声明此兼容环境')
    if (this.records.length >= MAX_GUESTS) throw new Error('子插件数量已达上限')
    const digest = await digestText(script)
    if (this.records.some((item) => item.digest === digest)) throw new Error('这个子插件已经安装')
    const info = readGuestInfo(script, fallback.replace(/\.[^.]+$/, '') || '自定义音源')
    if (!(await confirmGuestInstall(this.record.manifest.name, info))) return null
    const record: GuestRecord = {
      ...info,
      id: uid(),
      pluginKey: this.record.key,
      adapterId,
      digest,
      selected: false,
      grants: [],
      providers: [],
      state: 'stopped'
    }
    await kvSet(this.scriptPrefix + record.id, script)
    this.records.push(record)
    await this.persist()
    this.changed()
    return record
  }

  private async getScript(record: GuestRecord): Promise<string> {
    const script = await kvGet<string>(this.scriptPrefix + record.id, '')
    if (!script) throw new Error('子插件文件缺失，请重新导入')
    if ((await digestText(script)) !== record.digest) {
      throw new Error('子插件文件校验失败，请重新导入')
    }
    return script
  }

  private async documentFor(record: GuestRecord, script: string) {
    const adapter = this.artifact.manifest.contributes?.guestAdapters?.find(
      (item) => item.id === record.adapterId
    )
    if (!adapter) throw new Error('兼容环境未声明此格式')
    const bootstrap = this.artifact.modules[adapter.bootstrap]
    if (!bootstrap) throw new Error('子插件兼容环境缺少 bootstrap 模块')
    const { runtime, catalog } = await loadPluginRuntimeAssets()
    const sessionId = uid()
    const html =
      '<!doctype html><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-eval\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src \'none\'; object-src \'none\'; frame-src \'none\'; form-action \'none\'; base-uri \'none\'">' +
      '<div id="plugin-root" hidden></div>' +
      dataScript(runtime) +
      dataScript('globalThis.__ceruStart(' + bootstrap + ');')
    return {
      sessionId,
      html,
      init: {
        generation: sessionId,
        mode: 'production',
        kind: 'guest',
        manifest: { ...this.artifact.manifest, config: {} },
        resources: this.artifact.resources,
        catalog,
        guest: {
          id: record.id,
          info: {
            name: record.name,
            version: record.version,
            author: record.author,
            description: record.description,
            homepage: record.homepage,
            rawScript: script
          }
        }
      }
    }
  }

  async start(id: string): Promise<GuestRuntime> {
    await this.init()
    const record = this.records.find((item) => item.id === id)
    if (!record) throw new Error('子插件不存在')
    const existing = this.runtimes.get(id)
    if (existing) {
      await existing.waitReady()
      return existing
    }
    const script = await this.getScript(record)
    const documentInfo = await this.documentFor(record, script)
    const runtime = new GuestRuntime({
      pluginKey: this.record.key,
      pluginName: this.record.manifest.name,
      guest: record,
      script,
      html: documentInfo.html,
      init: documentInfo.init,
      grants: record.grants,
      allowedCapabilities: this.artifact.manifest.guestPolicy?.allowedCapabilities || [],
      projectableProtocols:
        this.artifact.manifest.contributes?.guestAdapters?.find(
          (item) => item.id === record.adapterId
        )?.projectableProtocols || [],
      onGrant: async (permission, allowed) => {
        const next = record.grants.filter(
          (item) => item !== permission && item !== 'deny:' + permission
        )
        next.push(allowed ? permission : 'deny:' + permission)
        record.grants = next
        await this.persist()
      },
      onState: (state, error, providers) => {
        record.state = state
        record.error = error
        if (providers) record.providers = providers
        void this.persist()
        this.changed()
      },
      onEvent: (type, data) => {
        if (type === 'log') {
          console.debug('[guest:' + record.id + ']', data)
        } else if (type === 'notify') {
          void notify(String(data?.message || data?.body || record.name), data?.level || 'medium')
        }
      }
    })
    this.runtimes.set(id, runtime)
    try {
      await runtime.waitReady()
      return runtime
    } catch (error) {
      this.runtimes.delete(id)
      runtime.stop()
      throw error
    }
  }

  async select(id: string | null): Promise<void> {
    await this.init()
    const previous = this.records.find((item) => item.selected)
    for (const record of this.records) record.selected = false
    for (const [key, runtime] of this.runtimes) {
      runtime.stop()
      this.runtimes.delete(key)
    }
    if (id === null) {
      await this.persist()
      this.changed()
      return
    }
    const target = this.records.find((item) => item.id === id)
    if (!target) throw new Error('子插件不存在')
    try {
      await this.start(id)
      target.selected = true
      await this.persist()
      this.changed()
    } catch (error) {
      if (previous && previous.id !== id) {
        await this.start(previous.id)
          .then(() => {
            previous.selected = true
          })
          .catch(() => undefined)
      }
      await this.persist()
      this.changed()
      throw error
    }
  }

  async remove(id: string): Promise<void> {
    await this.init()
    const record = this.records.find((item) => item.id === id)
    if (!record) return
    this.runtimes.get(id)?.stop()
    this.runtimes.delete(id)
    this.records = this.records.filter((item) => item.id !== id)
    await kvDelete(this.scriptPrefix + id)
    await this.persist()
    this.changed()
  }

  async invoke(id: string, method: string, input: any): Promise<any> {
    await this.init()
    const record = this.records.find((item) => item.id === id)
    if (!record) throw new Error('子插件不存在')
    if (!record.selected) throw new Error('请先选择使用此子插件')
    if (!/^[a-zA-Z][\w.-]{0,127}$/.test(method)) throw new Error('无效的子插件方法')
    const runtime = await this.start(id)
    return runtime.invoke(method, input)
  }

  dispose(): void {
    for (const runtime of this.runtimes.values()) runtime.stop()
    this.runtimes.clear()
  }
}

const guestStores = new Map<string, PluginGuestStore>()

export function guestStoreFor(record: PluginRecord, changed?: () => void): PluginGuestStore {
  let store = guestStores.get(record.key)
  if (!store) {
    store = new PluginGuestStore(record, changed)
    guestStores.set(record.key, store)
  } else if (changed) {
    store.setChangedHandler(changed)
  }
  return store
}

export function disposeGuestStore(pluginKey: string): void {
  const store = guestStores.get(pluginKey)
  if (!store) return
  store.dispose()
  guestStores.delete(pluginKey)
}
