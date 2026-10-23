import { reactive, watch } from 'vue'
import { alertController } from '@ionic/vue'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore, type AppSettings } from '@/stores/settings'
import { usePlayerStore } from '@/stores/player'
import { CERU_API_RESOURCE } from '@/services/authClient'
import { getAccessToken } from '@/services/ceruApi'
import type { RepeatMode } from '@/stores/settings'

const LAST_UPDATED_KEY = 'ceru-settings-last-updated'
const SENSITIVE_KEYS: Array<keyof AppSettings> = [
  'aiApiKey',
  'grantedPermissions',
  'deniedPermissions',
  'onboardingDone',
  'searchHistory',
  // The wallpaper points at a device-local file, so it must not travel.
  'globalBackground',
  // 下面几项同理：它们标识的是**这台设备上的位置或硬件**。
  // 同步到另一台设备后，SAF 目录授权在新设备上根本不存在（下载会直接失败），
  // 输出设备 id 也不是那边的设备，子目录名则可能与那边的目录布局不符。
  'safDownloadUri',
  'safDownloadName',
  'downloadSubfolder',
  'audioOutputDeviceId'
]

interface PlaySettings {
  volume: number
  playbackRate: number
  repeat: RepeatMode
  shuffle: boolean
}

interface CloudSettings {
  appSettings: Partial<AppSettings>
  playSettings?: Partial<PlaySettings>
}

export const settingsSyncState = reactive({
  status: 'idle' as 'idle' | 'checking' | 'uploading' | 'downloading' | 'synced' | 'error',
  lastSync: Number(localStorage.getItem(LAST_UPDATED_KEY + ':time') || 0),
  message: ''
})

let stopped = true
let applying = false
let syncing = false
let initialized = false
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let watchers: Array<() => void> = []
let onlineHandler: (() => void) | null = null

/** 仅保留可跨设备同步的字段；敏感字段一律剔除。 */
export function toSyncableSettings(settings: AppSettings): Partial<AppSettings> {
  const copy: Partial<AppSettings> = JSON.parse(JSON.stringify(settings))
  for (const key of SENSITIVE_KEYS) delete copy[key]
  return copy
}

/**
 * 以「字典」语义同步的字段：键是本机的音源/插件标识。
 *
 * 这些字段不能整块替换——设备 A 只装了插件 X、设备 B 只装了插件 Y，
 * 云端把 Y 的配置传过来时，若整块覆盖就会把 A 上 X 的选择抹掉。
 */
const RECORD_KEYS: Array<keyof AppSettings> = ['providerOwners', 'capabilityOwners']

/**
 * 把云端设置合并到本机设置。
 *
 * 敏感字段（api key、权限、引导状态、搜索历史、本机壁纸）永远以本机为准，
 * 避免换设备登录后把别人的 key 或权限写进来，也避免本机壁纸被云端空值覆盖。
 *
 * 字典类字段按键合并、云端优先；其它字段整块以云端为准。
 */
export function mergeCloudSettings(current: AppSettings, cloud: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = { ...current, ...(cloud || {}) }
  // 逐字段核对类型：云端可能来自旧版本、另一端的字段迁移，或者干脆是脏数据。
  // 直接展开会把 `theme: null`、`maxConcurrentDownloads: "abc"` 这类值写进本机，
  // 之后界面就会拿 null 去比较、用字符串做算术。类型不符时保留本机值。
  const target = merged as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(cloud || {})) {
    const name = key as keyof AppSettings
    const local = current[name]
    if (value === undefined || value === null) {
      target[name] = local
      continue
    }
    if (Array.isArray(local)) {
      if (!Array.isArray(value)) target[name] = local
      continue
    }
    if (local !== null && typeof local === 'object') {
      // 嵌套对象（tagWriteOptions 等）由读取侧的 normalize* 兜底，这里只要不是标量。
      if (typeof value !== 'object') target[name] = local
      continue
    }
    if (typeof value !== typeof local) target[name] = local
  }
  for (const key of RECORD_KEYS) {
    const fromCloud = cloud?.[key]
    if (!fromCloud || typeof fromCloud !== 'object' || Array.isArray(fromCloud)) {
      // 云端没给或给了非法值时保留本机，绝不因为一次脏数据清空映射。
      ;(merged as unknown as Record<string, unknown>)[key] = current[key]
      continue
    }
    ;(merged as unknown as Record<string, unknown>)[key] = {
      ...(current[key] as Record<string, string>),
      ...(fromCloud as Record<string, string>)
    }
  }
  for (const key of SENSITIVE_KEYS) {
    ;(merged as unknown as Record<string, unknown>)[key] = current[key]
  }
  return merged
}

function playSettings(): PlaySettings {
  const player = usePlayerStore()
  return {
    volume: player.volume,
    playbackRate: player.playbackRate,
    repeat: player.repeat,
    shuffle: player.shuffle
  }
}

function localPayload(): CloudSettings {
  return { appSettings: toSyncableSettings(useSettingsStore().settings), playSettings: playSettings() }
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  if (!token) throw new Error('请先登录')
  const headers = new Headers(init.headers)
  headers.set('Authorization', 'Bearer ' + token)
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(CERU_API_RESOURCE + path, { ...init, headers })
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('ceru:unauthorized'))
    throw new Error('登录已过期，请重新登录')
  }
  return response
}

async function fetchCloud(): Promise<CloudSettings | null> {
  const headers: Record<string, string> = {}
  const last = localStorage.getItem(LAST_UPDATED_KEY)
  if (last) headers['Last-Updated'] = last
  const response = await authorizedFetch('/user-settings', { headers })
  if (response.status === 211) return null
  const text = await response.text()
  let payload: any = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    throw new Error(payload?.message || '读取云端设置失败 (' + response.status + ')')
  }
  const lastUpdated =
    response.headers.get('last-updated') ||
    response.headers.get('last-modified') ||
    new Date().toUTCString()
  localStorage.setItem(LAST_UPDATED_KEY, lastUpdated)
  const data = payload?.data ?? payload
  if (!data || typeof data !== 'object') return null
  return {
    appSettings: data.appSettings && typeof data.appSettings === 'object' ? data.appSettings : {},
    playSettings: data.playSettings && typeof data.playSettings === 'object' ? data.playSettings : {}
  }
}

function different(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right)
}

async function applyCloud(cloud: CloudSettings) {
  const settings = useSettingsStore()
  const player = usePlayerStore()
  applying = true
  try {
    settings.settings = mergeCloudSettings(settings.settings, cloud.appSettings)
    if (cloud.playSettings) {
      if (typeof cloud.playSettings.volume === 'number') {
        player.setVolume(Math.max(0, Math.min(1, cloud.playSettings.volume)))
      }
      if (typeof cloud.playSettings.playbackRate === 'number') {
        player.setPlaybackRate(cloud.playSettings.playbackRate)
      }
      player.setMode({
        repeat: cloud.playSettings.repeat,
        shuffle: typeof cloud.playSettings.shuffle === 'boolean' ? cloud.playSettings.shuffle : undefined
      })
    }
    settingsSyncState.lastSync = Date.now()
    localStorage.setItem(LAST_UPDATED_KEY + ':time', String(settingsSyncState.lastSync))
  } finally {
    setTimeout(() => {
      applying = false
    }, 250)
  }
}

export async function uploadSettings(force = false): Promise<boolean> {
  const auth = useAuthStore()
  if (!auth.authenticated || !useSettingsStore().settings.cloudSyncEnabled) return false
  if (syncing && !force) return false
  syncing = true
  settingsSyncState.status = 'uploading'
  settingsSyncState.message = ''
  try {
    const response = await authorizedFetch('/user-settings', {
      method: 'POST',
      body: JSON.stringify(localPayload())
    })
    if (!response.ok) {
      const text = await response.text()
      let payload: any = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = null
      }
      throw new Error(payload?.message || '上传设置失败 (' + response.status + ')')
    }
    const now = new Date().toUTCString()
    localStorage.setItem(LAST_UPDATED_KEY, now)
    settingsSyncState.lastSync = Date.now()
    localStorage.setItem(LAST_UPDATED_KEY + ':time', String(settingsSyncState.lastSync))
    settingsSyncState.status = 'synced'
    return true
  } catch (cause) {
    settingsSyncState.status = 'error'
    settingsSyncState.message = cause instanceof Error ? cause.message : '同步失败'
    return false
  } finally {
    syncing = false
  }
}

export async function checkCloudSettings(interactive = true): Promise<boolean> {
  const auth = useAuthStore()
  if (!auth.authenticated) return false
  if (syncing) return false
  syncing = true
  settingsSyncState.status = 'checking'
  settingsSyncState.message = ''
  let cloud: CloudSettings | null = null
  try {
    cloud = await fetchCloud()
    if (!cloud) {
      syncing = false
      return uploadSettings(true)
    }
    const local = localPayload()
    if (different(local, cloud)) {
      let choice: 'cloud' | 'local' = 'cloud'
      if (interactive) {
        const alert = await alertController.create({
          header: '发现云端设置',
          message: '云端设置与这台设备不一致。使用云端设置，还是用本机设置覆盖云端？',
          buttons: [
            { text: '保留本机', role: 'cancel' },
            { text: '使用云端', role: 'confirm' }
          ]
        })
        await alert.present()
        const { role } = await alert.onDidDismiss()
        // 点背景关闭（`backdrop`）不能当成「保留本机」：那会静默把本机设置
        // 上传覆盖云端，而用户只是关掉了一个弹窗。只有明确点了按钮才做选择。
        if (role !== 'confirm' && role !== 'cancel') {
          settingsSyncState.status = 'idle'
          settingsSyncState.message = '已跳过本次同步'
          return false
        }
        choice = role === 'confirm' ? 'cloud' : 'local'
      }
      if (choice === 'cloud') {
        settingsSyncState.status = 'downloading'
        await applyCloud(cloud)
        settingsSyncState.status = 'synced'
        return true
      }
      syncing = false
      return uploadSettings(true)
    }
    settingsSyncState.status = 'synced'
    settingsSyncState.lastSync = Date.now()
    localStorage.setItem(LAST_UPDATED_KEY + ':time', String(settingsSyncState.lastSync))
    return true
  } catch (cause) {
    settingsSyncState.status = 'error'
    settingsSyncState.message = cause instanceof Error ? cause.message : '同步失败'
    return false
  } finally {
    syncing = false
  }
}

/** 是否应当安排一次上传；抽成纯函数以便单测（停止/应用中/未登录/关闭同步都不传）。 */
export function shouldScheduleUpload(state: {
  stopped: boolean
  applying: boolean
  authenticated: boolean
  cloudSyncEnabled: boolean
}): boolean {
  return !state.stopped && !state.applying && state.authenticated && state.cloudSyncEnabled
}

function scheduleUpload() {
  if (
    !shouldScheduleUpload({
      stopped,
      applying,
      authenticated: useAuthStore().authenticated,
      cloudSyncEnabled: useSettingsStore().settings.cloudSyncEnabled
    })
  ) {
    return
  }
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void uploadSettings()
  }, 5000)
}

export function startSettingsSync() {
  if (initialized) return
  initialized = true
  stopped = false
  const settings = useSettingsStore()
  const player = usePlayerStore()
  watchers.push(
    watch(() => settings.settings, scheduleUpload, { deep: true }),
    watch(
      () => [player.volume, player.playbackRate, player.repeat, player.shuffle],
      scheduleUpload
    ),
    // 关闭同步时立刻取消已经排上的那次上传：scheduleUpload 只在**安排**时检查
    // 开关，5 秒防抖期间用户关掉同步，定时器到时仍会照常上传。
    watch(
      () => settings.settings.cloudSyncEnabled,
      (enabled) => {
        if (!enabled) {
          clearTimeout(debounceTimer)
          debounceTimer = undefined
        }
      }
    )
  )
  // 保存引用以便 stop 时移除；每次 start 重新注册同一个函数，不会叠加。
  onlineHandler = () => {
    if (stopped) return
    if (useAuthStore().authenticated) void checkCloudSettings(false)
  }
  window.addEventListener('online', onlineHandler)
  if (useAuthStore().authenticated) {
    setTimeout(() => void checkCloudSettings(true), 1500)
  }
}

/**
 * 停止同步并真正取消订阅。
 *
 * 此前只置 `stopped` 与清防抖定时器，watcher 与 `online` 监听始终留着：
 * 退出登录后它们仍在跑（虽然 scheduleUpload 会早退），而 `initialized`
 * 一直是 true，导致下次登录时 startSettingsSync 直接返回、再也不订阅。
 */
export function stopSettingsSync() {
  stopped = true
  clearTimeout(debounceTimer)
  for (const dispose of watchers) {
    try {
      dispose()
    } catch {
      // 已释放的 watcher 不应阻断后续清理。
    }
  }
  watchers = []
  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }
  initialized = false
}

export function restartSettingsSync() {
  // stop 会把 initialized 复位，所以这里不能再用它当「是否运行过」的判据：
  // 登录切换时必须重新订阅 watcher，否则这次登录后再也不会自动上传。
  stopSettingsSync()
  startSettingsSync()
  if (useAuthStore().authenticated) {
    setTimeout(() => void checkCloudSettings(false), 500)
  }
}
