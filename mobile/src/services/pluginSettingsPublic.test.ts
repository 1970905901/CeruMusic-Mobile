import { describe, expect, it } from 'vitest'
import {
  PLUGIN_PUBLIC_SETTINGS_SET,
  pluginSettingsGet,
  pluginSettingsUpdate
} from './pluginSettings'

/**
 * 插件可读写的公开设置。
 *
 * 桌面 `services/pluginHostServices.ts` 的 `PUBLIC_SETTINGS`，以及插件文档
 * `docs/guide/plugins/v2/host-services.md` 里列出的白名单，用的都是**桌面端的
 * 字段名**；移动端的字段名并不相同。此前白名单直接照抄桌面字段名，插件按文档
 * 请求 `filenameTemplate`、`springFestivalDisabled`、`FullPlayLyricFontRate`
 * 时全部被当成「非公开设置」静默丢掉——插件以为宿主没有这项设置，宿主也从不告警。
 *
 * 移动端确实没有对应能力的条目（AI 悬浮球、状态栏歌词、打开时自动导入歌单）
 * 不会假装存在：插件读到的是缺省值，而不是一个拨了也没反应的开关。
 */

const MOBILE_SETTINGS = {
  downloadFilenameTemplate: '{artist} - {title}',
  festivalThemeDisabled: true,
  lyricFontScale: 1.3,
  lyricFontFamily: 'kai',
  lyricFontSize: 18,
  lyricFontWeight: 600,
  routePreloadEnabled: false,
  audioCacheEnabled: false,
  theme: 'system'
}

describe('plugin public settings', () => {
  it('answers the documented name for every setting mobile actually has', () => {
    for (const name of [
      'filenameTemplate',
      'springFestivalDisabled',
      'FullPlayLyricFontRate',
      'lyricFontFamily',
      'lyricFontSize',
      'lyricFontWeight',
      'routePreloadEnabled',
      'autoCacheMusic',
      'theme',
      'isDarkMode',
      'followSystemTheme'
    ]) {
      expect(PLUGIN_PUBLIC_SETTINGS_SET.has(name)).toBe(true)
    }
    const read = pluginSettingsGet(
      [
        'filenameTemplate',
        'springFestivalDisabled',
        'FullPlayLyricFontRate',
        'lyricFontFamily',
        'lyricFontSize',
        'lyricFontWeight',
        'routePreloadEnabled',
        'autoCacheMusic',
        'theme',
        'isDarkMode',
        'followSystemTheme'
      ],
      MOBILE_SETTINGS
    )
    expect(read).toEqual({
      filenameTemplate: '{artist} - {title}',
      springFestivalDisabled: true,
      FullPlayLyricFontRate: 1.3,
      lyricFontFamily: 'kai',
      lyricFontSize: 18,
      lyricFontWeight: 600,
      routePreloadEnabled: false,
      autoCacheMusic: false,
      theme: 'system',
      // 「跟随系统」就是 isDarkMode 未知、followSystemTheme 为真。
      isDarkMode: false,
      followSystemTheme: true
    })
  })

  it('reports a real light/dark preference without pretending it follows the system', () => {
    const read = pluginSettingsGet(
      ['isDarkMode', 'followSystemTheme'],
      { ...MOBILE_SETTINGS, theme: 'dark' }
    )
    expect(read).toEqual({ isDarkMode: true, followSystemTheme: false })
  })

  it('does not advertise settings the mobile app has no equivalent for', () => {
    // 这些是桌面独有的（AI 悬浮球、状态栏歌词、打开时自动导入歌单）。
    // 列进来只会让插件以为可以切换，实际拨了没有任何效果。
    for (const name of [
      'showFloatBall',
      'macStatusBarLyricEnabled',
      'autoImportPlaylistOnOpen',
      'suppressImportPrompt'
    ]) {
      expect(PLUGIN_PUBLIC_SETTINGS_SET.has(name)).toBe(false)
    }
  })

  it('still hides internal state', () => {
    expect(
      pluginSettingsGet(
        ['aiApiKey', 'grantedPermissions', 'deniedPermissions', 'onboardingDone'],
        { aiApiKey: 'secret', grantedPermissions: {}, deniedPermissions: {}, onboardingDone: true }
      )
    ).toEqual({})
  })

  it('writes back through the documented name', () => {
    // 插件按文档写 `filenameTemplate`，落到的必须是移动端真正读取的字段，
    // 否则「改了模板但下载文件名没变」。
    const settings: Record<string, any> = { ...MOBILE_SETTINGS }
    const changed = pluginSettingsUpdate({ filenameTemplate: '{title}', autoCacheMusic: true }, settings)
    expect(changed.sort()).toEqual(['autoCacheMusic', 'filenameTemplate'])
    expect(settings.downloadFilenameTemplate).toBe('{title}')
    expect(settings.audioCacheEnabled).toBe(true)
    // 文档名本身不应该作为字段留在设置里。
    expect(settings.filenameTemplate).toBeUndefined()
    expect(settings.autoCacheMusic).toBeUndefined()
  })
})
