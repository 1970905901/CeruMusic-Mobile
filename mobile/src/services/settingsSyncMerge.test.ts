import { describe, expect, it } from 'vitest'
import { mergeCloudSettings, toSyncableSettings } from './settingsSync'
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
})
