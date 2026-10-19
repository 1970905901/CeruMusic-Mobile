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
  'searchHistory'
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

function sanitizedSettings(): Partial<AppSettings> {
  const settings = useSettingsStore()
  const copy: Partial<AppSettings> = JSON.parse(JSON.stringify(settings.settings))
  for (const key of SENSITIVE_KEYS) delete copy[key]
  return copy
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
  return { appSettings: sanitizedSettings(), playSettings: playSettings() }
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
    const current = settings.settings
    const merged: AppSettings = {
      ...current,
      ...(cloud.appSettings || {}),
      aiApiKey: current.aiApiKey,
      grantedPermissions: current.grantedPermissions,
      deniedPermissions: current.deniedPermissions,
      onboardingDone: current.onboardingDone,
      searchHistory: current.searchHistory
    }
    settings.settings = merged
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

function scheduleUpload() {
  if (stopped || applying || !useAuthStore().authenticated) return
  if (!useSettingsStore().settings.cloudSyncEnabled) return
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
    )
  )
  window.addEventListener('online', () => {
    if (useAuthStore().authenticated) void checkCloudSettings(false)
  })
  if (useAuthStore().authenticated) {
    setTimeout(() => void checkCloudSettings(true), 1500)
  }
}

export function stopSettingsSync() {
  stopped = true
  clearTimeout(debounceTimer)
}

export function restartSettingsSync() {
  if (!initialized) return
  stopSettingsSync()
  stopped = false
  if (useAuthStore().authenticated) {
    setTimeout(() => void checkCloudSettings(false), 500)
  }
}
