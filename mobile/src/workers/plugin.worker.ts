import { installLegacyPolyfills } from '@/utils/polyfills'

installLegacyPolyfills()

import type { PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest'
import {
  assertContentPage,
  assertLyricsDocument,
  assertResolveResult
} from '@shiqianjiang/ceru-plugin-sdk'
import CryptoJS from 'crypto-js'
import { gzipSync, gunzipSync, inflateSync, deflateSync } from 'fflate'
import * as lodash from 'lodash-es'

type Json = any
type WorkerScope = {
  postMessage: (message: any) => void
  onmessage: ((event: MessageEvent) => void) | null
  close?: () => void
}
const scope = self as unknown as WorkerScope

interface PendingRpc {
  resolve: (value: any) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingRpc = new Map<number, PendingRpc>()
let rpcSequence = 0
let generation = ''
let disposed = false
let cleanup: (() => unknown) | undefined

const providers = new Map<string, any>()
const actions = new Map<string, (input: any, operation: any) => any>()
const importers = new Map<string, any>()
const converters = new Map<string, any>()
const eventListeners = new Map<string, Set<(value: any) => void>>()
const notices: any[] = []

let manifest: PluginManifest
let runtimeConfig: Record<string, any> = {}
let resources: Record<string, any> = {}
let grantedPermissions = new Set<string>()
let deniedPermissions = new Set<string>()

function rpc<T = any>(method: string, params: any = null): Promise<T> {
  if (disposed) return Promise.reject(new Error('插件运行时已停止'))
  const id = ++rpcSequence
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRpc.delete(id)
      reject(new Error(`Host RPC timeout: ${method}`))
    }, 120_000)
    pendingRpc.set(id, { resolve, reject, timer })
    scope.postMessage({ type: 'rpc', id, method, params })
  })
}

function respondRpc(id: number, value?: any, error?: string) {
  const pending = pendingRpc.get(id)
  if (!pending) return
  pendingRpc.delete(id)
  clearTimeout(pending.timer)
  if (error) pending.reject(new Error(error))
  else pending.resolve(value)
}

function createOperation(operationId?: string) {
  const controller = new AbortController()
  const id = operationId ?? `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const timeout = setTimeout(() => controller.abort(new Error('操作超时')), 120_000)
  return {
    id,
    deadlineAt: Date.now() + 120_000,
    signal: controller.signal,
    userIntent: { kind: 'user-intent' as const, id },
    __dispose: () => clearTimeout(timeout)
  }
}

function publicOperation(operation: any) {
  return {
    id: operation.id,
    deadlineAt: operation.deadlineAt,
    signal: operation.signal,
    connectionId: operation.connectionId,
    userIntent: operation.userIntent
  }
}

function log(level: 'debug' | 'info' | 'warn' | 'error', message: any) {
  const text =
    typeof message === 'string'
      ? message
      : (() => {
          try {
            return JSON.stringify(message)
          } catch {
            return String(message)
          }
        })()
  scope.postMessage({ type: 'log', level, message: text.slice(0, 16_000) })
}

function notice(type: string, data: any) {
  notices.push({ type, data })
  scope.postMessage({ type: 'notice', notice: { type, data } })
}

function unsupportedService(name: string): any {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return undefined
        return async () => {
          throw new Error(`当前移动端宿主未连接服务：${name}.${String(prop)}`)
        }
      }
    }
  )
}

function dataUrlForResource(name: string): string {
  const resource = resources[name]
  if (!resource) throw new Error(`资源不存在：${name}`)
  if (resource.type === 'json') {
    return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(resource.value))}`
  }
  if (resource.type === 'text') {
    return `data:${resource.mime || 'text/plain'};charset=utf-8,${encodeURIComponent(resource.value)}`
  }
  if (resource.type === 'base64') {
    return `data:${resource.mime || 'application/octet-stream'};base64,${resource.value}`
  }
  throw new Error(`未知资源类型：${name}`)
}

function toServiceCall(operation: any, permissionKey = '') {
  return { operation: publicOperation(operation), permissionKey }
}

const context: any = {
  plugin: {
    id: '',
    version: '',
    manifest: null
  },
  host: {
    apiVersion: '2.0.0',
    libraries: { lodash: 'host', icons: 'host', assets: 'host' },
    mode: 'production'
  },
  modules: {
    require: (name: string) => hostModule(name)
  },
  utils: { lodash },
  icons: {
    list: () => [],
    url: async (name: string) =>
      `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"/><text x="1" y="23" font-size="3">${name}</text></svg>`
      )}`
  },
  assets: {
    list: () => Object.keys(resources),
    url: async (name: string) => dataUrlForResource(name)
  },
  config: {
    get: async () => ({ ...(manifest?.config ?? {}), ...runtimeConfig })
  },
  providers: {
    register(id: string, implementation: any) {
      if (!manifest?.contributes?.providers?.some((item) => item.id === id)) {
        throw new Error(`Provider 未在 manifest 中声明：${id}`)
      }
      providers.set(id, implementation)
      return () => providers.delete(id)
    }
  },
  actions: {
    register(id: string, handler: (input: any, operation: any) => any) {
      if (!manifest?.contributes?.commands?.some((item) => item.action === id)) {
        throw new Error(`动作未在 manifest 中声明：${id}`)
      }
      actions.set(id, handler)
      return () => actions.delete(id)
    }
  },
  playlistImporters: {
    register(id: string, implementation: any) {
      if (!manifest?.contributes?.playlistImporters?.some((item) => item.id === id)) {
        throw new Error(`歌单导入器未在 manifest 中声明：${id}`)
      }
      importers.set(id, implementation)
      return () => importers.delete(id)
    }
  },
  lyricConverters: {
    register(id: string, implementation: any) {
      if (!manifest?.contributes?.lyricConverters?.some((item) => item.id === id)) {
        throw new Error(`歌词转换器未在 manifest 中声明：${id}`)
      }
      converters.set(id, implementation)
      return () => converters.delete(id)
    }
  },
  effects: {
    add(dispose: () => unknown) {
      const previous = cleanup
      cleanup = async () => {
        await previous?.()
        await dispose()
      }
    }
  },
  http: {
    request: (request: any) => httpRequest(request),
    create(defaults: any = {}) {
      const send = (url: string, input: any = {}) =>
        httpRequest({ ...defaults, ...input, url: new URL(url, defaults.baseURL).href })
      return {
        request: send,
        get: async (url: string, input: any = {}) =>
          (await send(url, { ...input, method: 'GET' })).data,
        post: async (url: string, input: any = {}) =>
          (await send(url, { ...input, method: 'POST' })).data,
        authorize: async (key: string, origin: string, operation: any) => {
          const result = await requestPermission(key, operation)
          if (result !== 'granted') throw new Error('网络权限未授予')
        }
      }
    }
  },
  permissions: {
    getGranted: async () => [
      ...grantedPermissions
    ].map((key) => ({ key, status: 'granted' as const, grantedAt: Date.now() })),
    query: async (request: { key: string }) => {
      if (grantedPermissions.has(request.key)) return { status: 'granted' as const, key: request.key }
      if (deniedPermissions.has(request.key)) return { status: 'denied' as const, key: request.key }
      return { status: 'prompt' as const, key: request.key }
    },
    request: async (request: { key: string; intent?: any }) => {
      const status = await requestPermission(request.key, request.intent)
      return { status, key: request.key }
    },
    requestGroup: async (request: { group: string; keys: string[] }) => {
      const grants = []
      for (const key of request.keys) {
        grants.push({ key, status: await requestPermission(key) })
      }
      const status = grants.every((item) => item.status === 'granted')
        ? 'granted'
        : grants.some((item) => item.status === 'denied')
          ? 'denied'
          : 'prompt'
      return { status, grants }
    }
  },
  playback: {
    failure: (error: any) => ({ ok: false, error })
  },
  ui: {
    dialogs: {
      confirm: (request: any) => rpc('ui.confirm', request),
      prompt: (request: any) => rpc('ui.prompt', request),
      pickPlaylist: (request: any) => rpc('ui.pickPlaylist', request)
    },
    navigation: {
      open: (request: any) => rpc('ui.navigation.open', request)
    },
    notifications: {
      show: (request: any, call?: any) => rpc('ui.notify', { ...request, call })
    },
    progress: {
      create: (request: any) => rpc('ui.progress.create', request),
      update: (id: string, value: any) => rpc('ui.progress.update', { id, value }),
      close: (id: string) => rpc('ui.progress.close', { id })
    },
    toast: async (message: any) => {
      notice('toast', message)
      await rpc('ui.toast', message).catch(() => undefined)
    },
    playlistImport: {
      open: (request: any) => rpc('ui.playlistImport.open', request)
    },
    pluginUpdate: {
      request: (request: any) => rpc('ui.pluginUpdate.request', request)
    },
    setState: async (surfaceId: string, state: any) => {
      scope.postMessage({ type: 'state', surfaceId, state })
    },
    notify: async (message: any) => {
      notice('notify', message)
      await rpc('ui.toast', message).catch(() => undefined)
    },
    openView: async (surfaceId: string) => {
      await rpc('ui.openView', { surfaceId })
    },
    closeView: async (surfaceId: string) => {
      await rpc('ui.closeView', { surfaceId })
    }
  },
  log: {
    debug: (message: any) => log('debug', message),
    info: (message: any) => log('info', message),
    warn: (message: any) => log('warn', message),
    error: (message: any) => log('error', message)
  },
  storage: {
    get: (key: string) => rpc('storage.get', { key }),
    set: (key: string, value: any) => rpc('storage.set', { key, value }),
    delete: (key: string) => rpc('storage.delete', { key })
  },
  capabilities: {
    list: () => rpc('capabilities.list'),
    get: (service: string) => rpc('capabilities.get', { service })
  },
  app: {
    getInfo: () => rpc('app.getInfo'),
    openSettings: (section?: string) => rpc('app.openSettings', { section }),
    openExternal: (url: string, call?: any) => rpc('app.openExternal', { url, call })
  },
  account: {
    getSession: (call?: any) => rpc('account.getSession', { call }),
    getProfile: (call?: any) => rpc('account.getProfile', { call }),
    openLogin: (operation?: any) => rpc('account.openLogin', { operation })
  },
  library: {
    playlists: {
      list: (call?: any) => rpc('library.playlists.list', { call }),
      getTracks: (reference: any, cursor: string | undefined, call?: any) =>
        rpc('library.playlists.getTracks', { reference, cursor, call }),
      import: (request: any, call?: any) => rpc('library.playlists.import', { request, call }),
      removeTracks: (reference: any, tracks: any[], call?: any) =>
        rpc('library.playlists.removeTracks', { reference, tracks, call }),
      clearPlaylist: (reference: any, call?: any) =>
        rpc('library.playlists.clearPlaylist', { reference, call })
    }
  },
  player: {
    getState: (call?: any) => rpc('player.getState', { call }),
    play: (track: any, call?: any) => rpc('player.play', { track, call }),
    pause: (call?: any) => rpc('player.pause', { call }),
    next: (call?: any) => rpc('player.next', { call }),
    previous: (call?: any) => rpc('player.previous', { call }),
    seek: (positionMs: number, call?: any) => rpc('player.seek', { positionMs, call }),
    setVolume: (volume: number, call?: any) => rpc('player.setVolume', { volume, call }),
    setMode: (mode: any, call?: any) => rpc('player.setMode', { mode, call })
  },
  queue: {
    get: (call?: any) => rpc('queue.get', { call }),
    append: (tracks: any[], call?: any) => rpc('queue.append', { tracks, call }),
    replace: (tracks: any[], call?: any) => rpc('queue.replace', { tracks, call }),
    remove: (keys: string[], call?: any) => rpc('queue.remove', { keys, call }),
    reorder: (keys: string[], call?: any) => rpc('queue.reorder', { keys, call })
  },
  favorites: {
    contains: (track: any, call?: any) => rpc('favorites.contains', { track, call }),
    add: (track: any, call?: any) => rpc('favorites.add', { track, call }),
    remove: (track: any, call?: any) => rpc('favorites.remove', { track, call })
  },
  history: {
    list: (cursor: string | undefined, call?: any) => rpc('history.list', { cursor, call })
  },
  downloads: {
    list: (call?: any) => rpc('downloads.list', { call }),
    create: (request: any, call?: any) => rpc('downloads.create', { request, call }),
    pause: (ids: string[], call?: any) => rpc('downloads.pause', { ids, call }),
    resume: (ids: string[], call?: any) => rpc('downloads.resume', { ids, call }),
    cancel: (ids: string[], call?: any) => rpc('downloads.cancel', { ids, call }),
    retry: (ids: string[], call?: any) => rpc('downloads.retry', { ids, call }),
    reveal: (id: string, call?: any) => rpc('downloads.reveal', { id, call })
  },
  files: {
    pick: (request: any, operation: any) => rpc('files.pick', { request, operation: publicOperation(operation) }),
    pickDirectory: (operation: any) => rpc('files.pickDirectory', { operation: publicOperation(operation) }),
    readText: (file: any, call?: any) => rpc('files.readText', { file, call }),
    readBase64: (file: any, call?: any) => rpc('files.readBase64', { file, call }),
    saveText: (request: any, operation: any) => rpc('files.saveText', { request, operation: publicOperation(operation) }),
    writeText: (file: any, text: string, call?: any) => rpc('files.writeText', { file, text, call })
  },
  clipboard: {
    readText: (call?: any) => rpc('clipboard.readText', { call }),
    writeText: (text: string, call?: any) => rpc('clipboard.writeText', { text, call })
  },
  localMusic: {
    list: (cursor: string | undefined, call?: any) => rpc('localMusic.list', { cursor, call }),
    scan: (directories: any[], call?: any) => rpc('localMusic.scan', { directories, call }),
    getTags: (track: any, call?: any) => rpc('localMusic.getTags', { track, call }),
    writeTags: (track: any, tags: any, call?: any) => rpc('localMusic.writeTags', { track, tags, call })
  },
  settings: {
    get: (keys: string[], call?: any) => rpc('settings.get', { keys, call }),
    update: (values: any, call?: any) => rpc('settings.update', { values, call })
  },
  window: {
    control: (action: string, call?: any) => rpc('window.control', { action, call })
  },
  hotkeys: {
    register: async () => {
      throw new Error('移动端不支持桌面快捷键')
    }
  },
  sharing: {
    create: (request: any, call?: any) => rpc('sharing.create', { request, call }),
    revoke: (id: string, call?: any) => rpc('sharing.revoke', { id, call }),
    resolve: (url: string) => rpc('sharing.resolve', { url })
  },
  rooms: {
    getState: (call?: any) => rpc('rooms.getState', { call }),
    join: (inviteCode: string, call?: any) => rpc('rooms.join', { inviteCode, call }),
    leave: (call?: any) => rpc('rooms.leave', { call }),
    requestTrack: (track: any, call?: any) => rpc('rooms.requestTrack', { track, call })
  },
  devices: unsupportedService('devices'),
  ai: {
    generate: (request: any, call?: any) => rpc('ai.generate', { request, call })
  },
  tasks: {
    schedule: (request: any, call?: any) => rpc('tasks.schedule', { request, call }),
    cancel: (id: string, call?: any) => rpc('tasks.cancel', { id, call })
  },
  sockets: unsupportedService('sockets'),
  guests: {
    list: () => rpc('guests.list'),
    import: (adapterId: string) => rpc('guests.import', { adapterId }),
    select: (guestId: string | null) => rpc('guests.select', { guestId }),
    remove: (guestId: string) => rpc('guests.remove', { guestId }),
    invoke: (guestId: string, method: string, input: any) =>
      rpc('guests.invoke', { guestId, method, input })
  },
  events: {
    on(event: string, listener: (value: any) => void) {
      let listeners = eventListeners.get(event)
      if (!listeners) {
        listeners = new Set()
        eventListeners.set(event, listeners)
      }
      listeners.add(listener)
      return () => listeners?.delete(listener)
    }
  }
}

function hostModule(name: string): any {
  switch (name) {
    case 'ceru':
    case '@ceru/tools':
      return { utils: context.utils, ...context }
    case '@ceru/http':
      return context.http
    case '@ceru/ui':
      return context.ui
    case '@ceru/socket':
      return context.sockets
    case '@ceru/library':
      return context.library
    case '@ceru/account':
      return context.account
    case '@ceru/player':
      return context.player
    case '@ceru/crypto':
      return CryptoJS
    case '@ceru/compression':
      return { gzip: gzipSync, gunzip: gunzipSync, inflate: inflateSync, deflate: deflateSync }
    case '@ceru/encoding':
      return {
        encode: (value: string) => new TextEncoder().encode(value),
        decode: (value: Uint8Array) => new TextDecoder().decode(value),
        base64: (value: string) => btoa(unescape(encodeURIComponent(value))),
        unbase64: (value: string) => decodeURIComponent(escape(atob(value)))
      }
    case 'lodash':
      return lodash
    case '@ceru/legacy-http':
      return {
        createLegacyHttpBridge:
          (permissionKey: string) =>
          async (url: string, options: any = {}) => {
            const response = await httpRequest({
              url,
              method: options.method || 'GET',
              headers: options.headers,
              json: options.data,
              permissionKey,
              operation: createOperation()
            })
            return response
          }
      }
    default:
      throw new Error(`Host 未提供模块：${name}`)
  }
}

async function requestPermission(key: string, intent?: any): Promise<'granted' | 'denied' | 'prompt'> {
  if (grantedPermissions.has(key)) return 'granted'
  if (deniedPermissions.has(key)) return 'denied'
  const result = await rpc<'granted' | 'denied' | 'prompt'>('permissions.request', { key, intent })
  if (result === 'granted') grantedPermissions.add(key)
  if (result === 'denied') deniedPermissions.add(key)
  return result
}

async function httpRequest(input: any): Promise<any> {
  if (!input?.url) throw new Error('HTTP 请求缺少 URL')
  const permissionKey = input.permissionKey || 'network'
  const status = await requestPermission(permissionKey, input.operation?.userIntent)
  if (status !== 'granted') throw new Error('网络权限未授予')
  const response = await rpc('http.request', {
    url: input.url,
    method: input.method || 'GET',
    headers: input.headers,
    query: input.query,
    json: input.json,
    form: input.form,
    body: input.body,
    timeoutMs: input.timeoutMs,
    responseType: input.responseType
  })
  if (input.throwHttpErrors !== false && (response.status < 200 || response.status >= 300)) {
    const error = new Error(`HTTP ${response.status}`) as Error & { status?: number; response?: any }
    error.status = response.status
    error.response = response
    throw error
  }
  return response
}

function resolveProviderMethod(implementation: any, path: string): Function | undefined {
  const parts = path.split('.')
  const owner = parts.slice(0, -1).reduce((current, key) => current?.[key], implementation)
  const method = owner?.[parts[parts.length - 1]]
  return typeof method === 'function' ? method.bind(owner) : undefined
}

function assertProviderResult(method: string, result: any) {
  if (method === 'tracks.resolve' || method === 'resolve') assertResolveResult(result)
  else if (method === 'tracks.lyrics' || method === 'lyrics') assertLyricsDocument(result)
  else if (
    [
      'tracks.search',
      'tracks.suggest',
      'tracks.hotSearch',
      'playlists.search',
      'playlists.categories',
      'playlists.list',
      'playlists.get',
      'charts.list',
      'charts.getTracks'
    ].includes(method)
  )
    assertContentPage(result)
}

function normalizeOperationResult(value: any) {
  if (value === undefined) return null
  return JSON.parse(JSON.stringify(value))
}

async function activate(message: any) {
  generation = String(message.generation)
  manifest = message.manifest
  runtimeConfig = message.config ?? {}
  grantedPermissions = new Set(message.permissions ?? [])
  deniedPermissions = new Set(message.deniedPermissions ?? [])
  context.plugin = { id: manifest.id, version: manifest.version, manifest }

  const exportsObject: any = {
    manifest,
    package: message.metadata ?? { formatVersion: 2, syntax: 'js', signature: null }
  }
  const moduleObject: any = { exports: exportsObject }
  let registry: any = null
  const CeruPlugin = {
    define(value: any) {
      registry = value
      return value
    }
  }
  ;(scope as any).require = hostModule
  ;(scope as any).CeruPlugin = CeruPlugin
  ;(scope as any).globalThis = scope

  let factory: Function
  try {
    factory = new Function(
      'exports',
      'module',
      'require',
      'CeruPlugin',
      `${message.code}\n;return exports;`
    )
  } catch (error) {
    throw new Error(`插件语法错误：${(error as Error).message}`)
  }
  const result = factory(exportsObject, moduleObject, hostModule, CeruPlugin)
  const exported = result ?? moduleObject.exports ?? exportsObject
  resources = exported.resources ?? registry?.resources ?? {}
  if (exported.modules && typeof exported.modules === 'object') {
    for (const [key, value] of Object.entries(exported.modules)) {
      if (typeof value === 'string' && !resources[key]) {
        resources[key] = { type: 'text', value, mime: 'text/javascript' }
      }
    }
  }

  let activateFunction = exported.activate ?? exported.default ?? (exported as any).logic
  if (typeof activateFunction !== 'function' && registry?.modules?.logic?.entry) {
    const entryCode = registry.modules?.[registry.modules.logic.entry]
    if (typeof entryCode === 'function') activateFunction = entryCode
  }
  if (typeof activateFunction !== 'function') {
    throw new Error('插件没有导出可调用的 activate 入口')
  }
  const maybeCleanup = await activateFunction(context)
  if (typeof maybeCleanup === 'function') cleanup = maybeCleanup

  scope.postMessage({
    type: 'activated',
    generation,
    providers: [...providers.keys()],
    actions: [...actions.keys()],
    importers: [...importers.keys()],
    converters: [...converters.keys()]
  })
}

async function invoke(message: any) {
  const operation = createOperation(message.operationId)
  try {
    let value: any
    if (message.kind === 'provider') {
      const implementation = providers.get(message.target)
      if (!implementation) throw new Error(`Provider 未注册：${message.target}`)
      const method =
        resolveProviderMethod(implementation, message.method) ??
        (message.method.startsWith('tracks.')
          ? resolveProviderMethod(implementation, message.method.slice('tracks.'.length))
          : undefined)
      if (!method) throw new Error(`Provider 不支持方法：${message.method}`)
      value = await method(...(message.args ?? []), publicOperation(operation))
      assertProviderResult(message.method, value)
    } else if (message.kind === 'action') {
      const handler = actions.get(message.target)
      if (!handler) throw new Error(`动作未注册：${message.target}`)
      value = await handler(message.args?.[0] ?? {}, publicOperation(operation))
    } else if (message.kind === 'importer') {
      const importer = importers.get(message.target)
      if (!importer) throw new Error(`歌单导入器未注册：${message.target}`)
      const [request] = message.args ?? []
      value = await importer.getTracks(
        { ...request, cursor: request?.cursor, limit: request?.limit ?? 100 },
        publicOperation(operation)
      )
      assertContentPage(value)
    } else if (message.kind === 'converter') {
      const converter = converters.get(message.target)
      if (!converter) throw new Error(`歌词转换器未注册：${message.target}`)
      const [method, request] = message.args ?? []
      value = await converter[method](request, publicOperation(operation))
    } else {
      throw new Error(`未知调用类型：${message.kind}`)
    }
    scope.postMessage({
      type: 'invoke-result',
      id: message.id,
      value: normalizeOperationResult(value)
    })
  } catch (error) {
    scope.postMessage({
      type: 'invoke-result',
      id: message.id,
      error: error instanceof Error ? error.message : String(error)
    })
  } finally {
    operation.__dispose()
  }
}

async function dispose() {
  if (disposed) return
  disposed = true
  for (const pending of pendingRpc.values()) {
    clearTimeout(pending.timer)
    pending.reject(new Error('插件运行时已停止'))
  }
  pendingRpc.clear()
  try {
    await cleanup?.()
  } catch (error) {
    log('warn', error)
  }
  providers.clear()
  actions.clear()
  importers.clear()
  converters.clear()
  eventListeners.clear()
  scope.postMessage({ type: 'disposed' })
}

scope.onmessage = (event: MessageEvent) => {
  const message = event.data
  if (!message || typeof message !== 'object') return
  if (message.type === 'activate') {
    activate(message).catch((error) => {
      scope.postMessage({
        type: 'failed',
        error: error instanceof Error ? error.message : String(error)
      })
    })
    return
  }
  if (message.type === 'rpc-result') {
    respondRpc(message.id, message.value, message.error)
    return
  }
  if (message.type === 'invoke') {
    void invoke(message)
    return
  }
  if (message.type === 'event') {
    const listeners = eventListeners.get(message.event)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(message.value)
        } catch (error) {
          log('warn', error)
        }
      }
    }
    return
  }
  if (message.type === 'dispose') {
    void dispose()
  }
}

scope.postMessage({ type: 'ready' })
