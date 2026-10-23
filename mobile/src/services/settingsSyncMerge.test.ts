import { describe, expect, it } from 'vitest'
import { mergeCloudSettings, shouldScheduleUpload, toSyncableSettings } from './settingsSync'
import type { AppSettings } from '@/stores/settings'

function localSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    theme: 'dark',
    accent: '#00dac0',
    preferredQuality: 'flac',
    providerOwners: {},
    capabilityOwners: {},
    grantedPermissions: { p: { network: true } },
    deniedPermissions: { p: { files: true } },
    downloadQuality: '',
    downloadFilenameTemplate: '{artist} - {title}',
    tagWriteOptions: { basicInfo: false, cover: false, lyrics: false, downloadLyrics: false, lyricFormat: 'lrc' },
    maxConcurrentDownloads: 2,
    autoPlayOnOpen: false,
    showLyricsInPlayer: true,
    sleepTimerMinutes: null,
    pauseTransition: true,
    onboardingDone: true,
    searchHistory: ['周杰伦'],
    aiProvider: 'deepseek',
    aiApiKey: 'sk-local-secret',
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
    globalBackground: { enable: true, opacity: 1 } as AppSettings['globalBackground'],
    audioCacheEnabled: true,
    audioCacheMaxBytes: 1024,
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
    audioOutputDeviceId: 'default',
    ...overrides
  }
}

describe('settings sync sanitising', () => {
  it('never uploads secrets, permissions, history or the local wallpaper', () => {
    const payload = toSyncableSettings(localSettings())
    for (const key of [
      'aiApiKey',
      'grantedPermissions',
      'deniedPermissions',
      'onboardingDone',
      'searchHistory',
      'globalBackground'
    ]) {
      expect(payload).not.toHaveProperty(key)
    }
  })

  it('keeps ordinary preferences so other devices can inherit them', () => {
    const payload = toSyncableSettings(localSettings())
    expect(payload.theme).toBe('dark')
    expect(payload.preferredQuality).toBe('flac')
    expect(payload.lyricFontSize).toBe(22)
  })

  it('does not mutate the source settings object', () => {
    const local = localSettings()
    toSyncableSettings(local)
    expect(local.aiApiKey).toBe('sk-local-secret')
  })
})

describe('settings sync merge', () => {
  it('applies cloud preferences over local ones', () => {
    const merged = mergeCloudSettings(localSettings(), { theme: 'light', lyricFontSize: 30 })
    expect(merged.theme).toBe('light')
    expect(merged.lyricFontSize).toBe(30)
  })

  it('keeps local secrets and permissions even when the cloud payload carries them', () => {
    const merged = mergeCloudSettings(localSettings(), {
      aiApiKey: 'sk-from-cloud',
      grantedPermissions: { other: { network: true } },
      deniedPermissions: {},
      onboardingDone: false,
      searchHistory: [],
      globalBackground: undefined as unknown as AppSettings['globalBackground']
    })
    expect(merged.aiApiKey).toBe('sk-local-secret')
    expect(merged.grantedPermissions).toEqual({ p: { network: true } })
    expect(merged.deniedPermissions).toEqual({ p: { files: true } })
    expect(merged.onboardingDone).toBe(true)
    expect(merged.searchHistory).toEqual(['周杰伦'])
    expect(merged.globalBackground).toEqual({ enable: true, opacity: 1 })
  })

  it('tolerates an empty cloud payload', () => {
    const local = localSettings()
    expect(mergeCloudSettings(local, {})).toEqual(local)
  })

  it('merges provider and capability owners per key instead of replacing the map', () => {
    // 两台设备装的插件不同：云端只有 B 的配置，整块覆盖会让 A 上架好的
    // 音源实现凭空消失，回到「自动」。
    const local = localSettings({
      providerOwners: { netease: 'plugin-a' },
      capabilityOwners: { 'netease:hot': 'plugin-b' }
    })
    const merged = mergeCloudSettings(local, {
      providerOwners: { qq: 'plugin-c' },
      capabilityOwners: { 'qq:hot': 'plugin-d' }
    })
    expect(merged.providerOwners).toEqual({ netease: 'plugin-a', qq: 'plugin-c' })
    expect(merged.capabilityOwners).toEqual({ 'netease:hot': 'plugin-b', 'qq:hot': 'plugin-d' })
  })

  it('lets the cloud win for a key both sides define', () => {
    const local = localSettings({ providerOwners: { netease: 'plugin-a' } })
    const merged = mergeCloudSettings(local, { providerOwners: { netease: 'plugin-z' } })
    expect(merged.providerOwners).toEqual({ netease: 'plugin-z' })
  })

  it('keeps local owners when the cloud payload carries junk for them', () => {
    const local = localSettings({ providerOwners: { netease: 'plugin-a' } })
    const merged = mergeCloudSettings(local, {
      providerOwners: null as unknown as Record<string, string>
    })
    expect(merged.providerOwners).toEqual({ netease: 'plugin-a' })
  })
})

describe('settings sync upload scheduling', () => {
  const base = { stopped: false, applying: false, authenticated: true, cloudSyncEnabled: true }

  it('uploads when signed in with cloud sync on', () => {
    expect(shouldScheduleUpload(base)).toBe(true)
  })

  it('stays quiet while signed out, disabled, stopped or applying a cloud merge', () => {
    // applying 期间必须静默：否则把云端值写进来会立刻触发一次上传，来回打乒乓。
    expect(shouldScheduleUpload({ ...base, authenticated: false })).toBe(false)
    expect(shouldScheduleUpload({ ...base, cloudSyncEnabled: false })).toBe(false)
    expect(shouldScheduleUpload({ ...base, stopped: true })).toBe(false)
    expect(shouldScheduleUpload({ ...base, applying: true })).toBe(false)
  })
})

describe('settings sync type guard', () => {
  it('keeps the local value when the cloud sends null or the wrong type', () => {
    // 云端可能来自旧版本或另一端迁移，脏值不能覆盖本机的合法设置——
    // 否则 theme 变 null、并发数变字符串，界面会拿它们去比较和算术。
    const local = localSettings()
    const merged = mergeCloudSettings(local, {
      theme: null as unknown as AppSettings['theme'],
      maxConcurrentDownloads: 'abc' as unknown as number,
      accent: 42 as unknown as string
    })
    expect(merged.theme).toBe(local.theme)
    expect(merged.maxConcurrentDownloads).toBe(local.maxConcurrentDownloads)
    expect(merged.accent).toBe(local.accent)
  })

  it('keeps the local array when the cloud sends a non-array', () => {
    const local = localSettings({ searchHistory: ['A'] })
    const merged = mergeCloudSettings(local, {
      searchHistory: 'nope' as unknown as string[]
    })
    // searchHistory 在敏感字段里，本来也不会被云端覆盖；这里确认类型守卫生效。
    expect(Array.isArray(merged.searchHistory)).toBe(true)
  })

  it('still accepts a well-typed cloud value', () => {
    const merged = mergeCloudSettings(localSettings(), { theme: 'light', maxConcurrentDownloads: 4 })
    expect(merged.theme).toBe('light')
    expect(merged.maxConcurrentDownloads).toBe(4)
  })
})

describe('device-local settings never travel', () => {
  it('does not upload a folder grant, subfolder or output device', () => {
    // 这些值在另一台设备上没有意义：SAF 目录授权根本不存在，
    // 输出设备 id 也不是那边硬件，子目录名可能与那边布局不符。
    const payload = toSyncableSettings(
      localSettings({
        safDownloadUri: 'content://tree/abc',
        safDownloadName: 'Music',
        downloadSubfolder: 'CeruMusic/Mobile',
        audioOutputDeviceId: 'speaker-2'
      })
    )
    expect(payload.safDownloadUri).toBeUndefined()
    expect(payload.safDownloadName).toBeUndefined()
    expect(payload.downloadSubfolder).toBeUndefined()
    expect(payload.audioOutputDeviceId).toBeUndefined()
  })
})
