import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'
export type RepeatMode = 'off' | 'all' | 'one'

export interface AppSettings {
  theme: ThemeMode
  accent: string
  preferredQuality: string
  providerOwners: Record<string, string>
  capabilityOwners: Record<string, string>
  grantedPermissions: Record<string, Record<string, boolean>>
  deniedPermissions: Record<string, Record<string, boolean>>
  downloadQuality: string
  downloadFilenameTemplate: string
  downloadWriteTags: boolean
  maxConcurrentDownloads: number
  autoPlayOnOpen: boolean
  showLyricsInPlayer: boolean
  sleepTimerMinutes: number | null
  pauseTransition: boolean
  onboardingDone: boolean
  lastSource?: string
  searchHistory: string[]
  aiProvider: 'deepseek' | 'openai' | 'siliconflow' | 'custom'
  aiApiKey: string
  aiBaseURL: string
  aiModel: string
  cloudSyncEnabled: boolean
  autoUpdatePlugins: boolean
  downloadDirectoryMode: 'data' | 'documents' | 'saf'
  downloadSubfolder: string
  safDownloadUri?: string
  safDownloadName?: string
  lyricFontSize: number
  lyricShowTranslation: boolean
  lyricShowRomanization: boolean
  lyricAnimate: boolean
  lyricJump: boolean
  lyricSeekStagger: boolean
  lyricAppleStyle: boolean
  lyricImmersiveColor: boolean
  lyricBlur: boolean
  audioVisualizer: boolean
  autoHideControls: boolean
  playerLayout: 'cd' | 'cover'
  lyricOffsetMs: number
  lyricFilterInfo: boolean
  lyricStrictFilter: boolean
  playerBackgroundAnimation: boolean
  audioCacheEnabled: boolean
  audioCacheMaxBytes: number
  audioCacheMaxQuality: string
  localScanFilterMinSizeKb: number
  localScanFilterMinDurationSec: number
}

const STORAGE_KEY = 'ceru-mobile-settings-v1'

const defaults: AppSettings = {
  theme: 'system',
  accent: '#00dac0',
  preferredQuality: '',
  providerOwners: {},
  capabilityOwners: {},
  grantedPermissions: {},
  deniedPermissions: {},
  downloadQuality: '',
  downloadFilenameTemplate: '{artist} - {title}',
  downloadWriteTags: false,
  maxConcurrentDownloads: 2,
  autoPlayOnOpen: false,
  showLyricsInPlayer: true,
  sleepTimerMinutes: null,
  pauseTransition: true,
  onboardingDone: false,
  searchHistory: [],
  aiProvider: 'deepseek',
  aiApiKey: '',
  aiBaseURL: 'https://api.deepseek.com',
  aiModel: 'deepseek-chat',
  cloudSyncEnabled: true,
  autoUpdatePlugins: false,
  downloadDirectoryMode: 'data',
  downloadSubfolder: 'CeruMusic',
  lyricFontSize: 22,
  lyricShowTranslation: true,
  lyricShowRomanization: false,
  lyricAnimate: true,
  lyricJump: true,
  lyricSeekStagger: true,
  lyricAppleStyle: true,
  lyricImmersiveColor: true,
  lyricBlur: false,
  audioVisualizer: true,
  autoHideControls: true,
  playerLayout: 'cd',
  lyricOffsetMs: 0,
  lyricFilterInfo: false,
  lyricStrictFilter: false,
  playerBackgroundAnimation: true,
  audioCacheEnabled: true,
  audioCacheMaxBytes: 1024 * 1024 * 1024,
  audioCacheMaxQuality: 'flac',
  localScanFilterMinSizeKb: 100,
  localScanFilterMinDurationSec: 30
}

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...defaults,
      ...parsed,
      providerOwners: { ...defaults.providerOwners, ...(parsed.providerOwners ?? {}) },
      capabilityOwners: { ...defaults.capabilityOwners, ...(parsed.capabilityOwners ?? {}) },
      grantedPermissions: { ...defaults.grantedPermissions, ...(parsed.grantedPermissions ?? {}) },
      deniedPermissions: { ...defaults.deniedPermissions, ...(parsed.deniedPermissions ?? {}) },
      searchHistory: Array.isArray(parsed.searchHistory) ? parsed.searchHistory.slice(0, 30) : [],
      localScanFilterMinSizeKb:
        typeof parsed.localScanFilterMinSizeKb === 'number' && !isNaN(parsed.localScanFilterMinSizeKb)
          ? parsed.localScanFilterMinSizeKb
          : defaults.localScanFilterMinSizeKb,
      localScanFilterMinDurationSec:
        typeof parsed.localScanFilterMinDurationSec === 'number' && !isNaN(parsed.localScanFilterMinDurationSec)
          ? parsed.localScanFilterMinDurationSec
          : defaults.localScanFilterMinDurationSec
    }
  } catch {
    return { ...defaults }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(load())
  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  const systemDark = ref(mediaQuery?.matches ?? false)

  if (mediaQuery) {
    const onChange = (event: MediaQueryListEvent) => {
      systemDark.value = event.matches
    }
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange)
    } else {
      mediaQuery.addListener(onChange)
    }
  }

  const isDark = computed(
    () => settings.value.theme === 'dark' || (settings.value.theme === 'system' && systemDark.value)
  )

  watch(
    settings,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // Preferences remain in memory when storage is unavailable.
      }
    },
    { deep: true }
  )

  function setTheme(theme: ThemeMode) {
    settings.value.theme = theme
  }

  function setProviderOwner(providerId: string, pluginKey: string) {
    settings.value.providerOwners = {
      ...settings.value.providerOwners,
      [providerId]: pluginKey
    }
  }

  function providerOwner(providerId: string): string | undefined {
    return settings.value.providerOwners[providerId]
  }

  function setCapabilityOwner(source: string, capability: string, pluginKey: string | null) {
    const next = { ...settings.value.capabilityOwners }
    const key = `${source}:${capability}`
    if (pluginKey) next[key] = pluginKey
    else delete next[key]
    settings.value.capabilityOwners = next
  }

  function capabilityOwner(source: string, capability: string): string | undefined {
    return settings.value.capabilityOwners[`${source}:${capability}`]
  }

  function isPermissionGranted(pluginKey: string, permissionKey: string): boolean {
    return !!settings.value.grantedPermissions[pluginKey]?.[permissionKey]
  }

  function isPermissionDenied(pluginKey: string, permissionKey: string): boolean {
    return !!settings.value.deniedPermissions[pluginKey]?.[permissionKey]
  }

  function grantPermission(pluginKey: string, permissionKey: string) {
    const granted = { ...(settings.value.grantedPermissions[pluginKey] ?? {}), [permissionKey]: true }
    const denied = { ...(settings.value.deniedPermissions[pluginKey] ?? {}) }
    delete denied[permissionKey]
    settings.value.grantedPermissions = { ...settings.value.grantedPermissions, [pluginKey]: granted }
    settings.value.deniedPermissions = { ...settings.value.deniedPermissions, [pluginKey]: denied }
  }

  function denyPermission(pluginKey: string, permissionKey: string) {
    const denied = { ...(settings.value.deniedPermissions[pluginKey] ?? {}), [permissionKey]: true }
    const granted = { ...(settings.value.grantedPermissions[pluginKey] ?? {}) }
    delete granted[permissionKey]
    settings.value.grantedPermissions = { ...settings.value.grantedPermissions, [pluginKey]: granted }
    settings.value.deniedPermissions = { ...settings.value.deniedPermissions, [pluginKey]: denied }
  }

  function resetPermissions(pluginKey: string) {
    const granted = { ...settings.value.grantedPermissions }
    const denied = { ...settings.value.deniedPermissions }
    delete granted[pluginKey]
    delete denied[pluginKey]
    settings.value.grantedPermissions = granted
    settings.value.deniedPermissions = denied
  }

  function addSearchHistory(query: string) {
    const value = query.trim()
    if (!value) return
    settings.value.searchHistory = [
      value,
      ...settings.value.searchHistory.filter((item) => item !== value)
    ].slice(0, 30)
  }

  function clearSearchHistory() {
    settings.value.searchHistory = []
  }

  return {
    settings,
    isDark,
    setTheme,
    setProviderOwner,
    providerOwner,
    setCapabilityOwner,
    capabilityOwner,
    isPermissionGranted,
    isPermissionDenied,
    grantPermission,
    denyPermission,
    resetPermissions,
    addSearchHistory,
    clearSearchHistory
  }
})
