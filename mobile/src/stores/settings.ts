import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { getBackgroundRenderer, type BackgroundRendererType } from '@/services/backgroundRenderers'
import { reconcilePermissionNames } from '@/services/plugin/permissions'
import { normalizeLyricFont } from '@/services/lyricFonts'
import {
  normalizeGlobalBackground,
  type GlobalBackgroundSettings
} from '@/services/globalBackground'
import {
  DEFAULT_TAG_WRITE_OPTIONS,
  normalizeTagWriteOptions,
  type TagWriteOptions
} from '@/services/tagWriteOptions'

export type ThemeMode = 'system' | 'light' | 'dark'
export type RepeatMode = 'off' | 'all' | 'one'

export interface AppSettings {
  theme: ThemeMode
  accent: string
  preferredQuality: string
  providerOwners: Record<string, string>
  capabilityOwners: Record<string, string>
  /**
   * `[pluginKey][permissionKey]` → 授权时的权限名（`permission.control` 等）。
   * 旧版本存的是 `true`；读取时按「仍被声明」处理，并在下次导入时补上名字。
   */
  grantedPermissions: Record<string, Record<string, boolean | string>>
  deniedPermissions: Record<string, Record<string, boolean | string>>
  downloadQuality: string
  downloadFilenameTemplate: string
  /** 下载完成后写入音频文件的标签内容，对齐桌面版 tagWriteOptions。 */
  tagWriteOptions: TagWriteOptions
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
  seamlessTransition: boolean
  autoHideControls: boolean
  playerLayout: 'cd' | 'cover'
  smtcHiresCover: boolean
  lyricOffsetMs: number
  lyricFilterInfo: boolean
  lyricStrictFilter: boolean
  playerBackgroundAnimation: boolean
  playerBackgroundRenderer: BackgroundRendererType
  playerBackgroundBeat: boolean
  globalBackground: GlobalBackgroundSettings
  audioCacheEnabled: boolean
  audioCacheMaxBytes: number
  audioCacheMaxQuality: string
  localScanFilterMinSizeKb: number
  localScanFilterMinDurationSec: number
  routePreloadEnabled: boolean
  /** 一起听：后台时推送聊天与新点歌请求的系统通知 */
  ltNotifyEnabled: boolean
  /** 一起听：被 @ 或被引用时绕过普通通知开关强提示 */
  ltMentionStrong: boolean
  /** 一起听：播放页以弹幕形式飘过房间聊天 */
  ltDanmakuEnabled: boolean
  /** 弹幕飞行速度倍率：越大越快 */
  ltDanmakuSpeed: number
  /** 弹幕字号倍率 */
  ltDanmakuFontScale: number
  /** 歌词字重（100–900） */
  lyricFontWeight: number
  /** 歌词字号倍率，叠加在字号之上 */
  lyricFontScale: number
  /** 歌词字体预设 id，取值见 `services/lyricFonts.ts` */
  lyricFontFamily: string
  /** 音频输出设备 id；空或 default 表示跟随系统 */
  audioOutputDeviceId: string
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
  tagWriteOptions: { ...DEFAULT_TAG_WRITE_OPTIONS },
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
  seamlessTransition: false,
  autoHideControls: true,
  playerLayout: 'cd',
  smtcHiresCover: false,
  lyricOffsetMs: 0,
  lyricFilterInfo: false,
  lyricStrictFilter: false,
  playerBackgroundAnimation: true,
  playerBackgroundRenderer: 'pixi',
  playerBackgroundBeat: false,
  globalBackground: { ...normalizeGlobalBackground(null) },
  audioCacheEnabled: true,
  audioCacheMaxBytes: 1024 * 1024 * 1024,
  audioCacheMaxQuality: 'flac',
  localScanFilterMinSizeKb: 100,
  localScanFilterMinDurationSec: 30,
  routePreloadEnabled: true,
  ltNotifyEnabled: true,
  ltMentionStrong: true,
  ltDanmakuEnabled: true,
  ltDanmakuSpeed: 1,
  ltDanmakuFontScale: 1,
  lyricFontWeight: 400,
  lyricFontScale: 1,
  lyricFontFamily: 'system',
  audioOutputDeviceId: 'default'
}

/**
 * 只保留与默认值同类型的字段。
 *
 * 存档可能来自旧版本、被手动改过，或写到一半损坏（`theme: null`、
 * `maxConcurrentDownloads: "abc"`）。直接展开会让这些值进入运行时状态，
 * 之后界面用 null 做比较、用字符串做算术，症状很难追。
 */
function pickWellTyped(parsed: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed)) {
    const fallback = (defaults as unknown as Record<string, unknown>)[key]
    if (fallback === undefined) continue
    if (value === null || value === undefined) continue
    if (Array.isArray(fallback)) {
      if (Array.isArray(value)) result[key] = value
      continue
    }
    if (fallback !== null && typeof fallback === 'object') {
      if (typeof value === 'object' && !Array.isArray(value)) result[key] = value
      continue
    }
    if (typeof value === typeof fallback) result[key] = value
  }
  return result
}

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaults }
    const parsedRaw = JSON.parse(raw)
    const parsed = pickWellTyped(
      parsedRaw && typeof parsedRaw === 'object' && !Array.isArray(parsedRaw)
        ? (parsedRaw as Record<string, unknown>)
        : {}
    ) as Partial<AppSettings>
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
          : defaults.localScanFilterMinDurationSec,
      globalBackground: normalizeGlobalBackground(parsed.globalBackground),
      // 旧版本只有 downloadWriteTags 布尔值，升级时迁移为「基础信息」。
      tagWriteOptions: normalizeTagWriteOptions(
        parsed.tagWriteOptions,
        (parsed as Record<string, unknown>).downloadWriteTags
      ),
      playerBackgroundRenderer: getBackgroundRenderer(
        String(parsed.playerBackgroundRenderer ?? defaults.playerBackgroundRenderer)
      ).value,
      // 字体预设来自本机存档或云端同步，可能是已移除的 id 或任意字符串；
      // 非法值直接写进 font-family 会让整页歌词悄悄换字体。
      lyricFontFamily: normalizeLyricFont(parsed.lyricFontFamily)
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

  /**
   * 标签选项由云同步与插件写回，值不可信（可能是 null 或半截对象）。
   * 读取一律走这里归一化，避免下载路径拿到非法值。
   */
  const tagWriteOptions = computed(() => normalizeTagWriteOptions(settings.value.tagWriteOptions))

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

  function setBackgroundRenderer(renderer: string) {
    settings.value.playerBackgroundRenderer = getBackgroundRenderer(renderer).value
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

  /**
   * 记录一次授权。`name` 是授权时的权限名，写进去才能在插件升级后
   * 发现「同一个 key 被拿去要别的权限」并撤销（见 reconcilePermissionNames）。
   */
  function grantPermission(pluginKey: string, permissionKey: string, name?: string) {
    const granted = {
      ...(settings.value.grantedPermissions[pluginKey] ?? {}),
      [permissionKey]: name || true
    }
    const denied = { ...(settings.value.deniedPermissions[pluginKey] ?? {}) }
    delete denied[permissionKey]
    settings.value.grantedPermissions = { ...settings.value.grantedPermissions, [pluginKey]: granted }
    settings.value.deniedPermissions = { ...settings.value.deniedPermissions, [pluginKey]: denied }
  }

  function denyPermission(pluginKey: string, permissionKey: string, name?: string) {
    const denied = {
      ...(settings.value.deniedPermissions[pluginKey] ?? {}),
      [permissionKey]: name || true
    }
    const granted = { ...(settings.value.grantedPermissions[pluginKey] ?? {}) }
    delete granted[permissionKey]
    settings.value.grantedPermissions = { ...settings.value.grantedPermissions, [pluginKey]: granted }
    settings.value.deniedPermissions = { ...settings.value.deniedPermissions, [pluginKey]: denied }
  }

  /**
   * 插件导入/更新后核对旧授权，撤销「key 还在、但要的权限名变了」的记录。
   * 返回是否真的改动了，便于调用方只在必要时持久化。
   */
  function reconcilePluginPermissions(
    pluginKey: string,
    declarations: readonly { key?: unknown; name?: unknown }[] | null | undefined
  ): boolean {
    const current = {
      granted: settings.value.grantedPermissions[pluginKey] ?? {},
      denied: settings.value.deniedPermissions[pluginKey] ?? {}
    }
    const next = reconcilePermissionNames(current, declarations)
    if (next.granted === current.granted && next.denied === current.denied) return false
    settings.value.grantedPermissions = {
      ...settings.value.grantedPermissions,
      [pluginKey]: next.granted as Record<string, boolean>
    }
    settings.value.deniedPermissions = {
      ...settings.value.deniedPermissions,
      [pluginKey]: next.denied as Record<string, boolean>
    }
    return true
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
    tagWriteOptions,
    setTheme,
    setBackgroundRenderer,
    setProviderOwner,
    providerOwner,
    setCapabilityOwner,
    capabilityOwner,
    isPermissionGranted,
    isPermissionDenied,
    grantPermission,
    denyPermission,
    reconcilePluginPermissions,
    resetPermissions,
    addSearchHistory,
    clearSearchHistory
  }
})
