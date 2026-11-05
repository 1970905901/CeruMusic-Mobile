import { describe, expect, it } from 'vitest'
import { normalizePluginSettingValue } from './pluginSettingValues'
import { pluginSettingsUpdate } from './pluginSettings'

/**
 * 插件写入公开设置时的取值校验。
 *
 * 白名单只挡名字。名字对了、值不对照样能进运行时：播放页把这几个值直接拼进
 * 内联样式（`Math.round(lyricFontSize * lyricFontScale) + 'px'`），
 * 一个 `lyricFontSize: "abc"` 就让整段歌词按浏览器默认字号渲染，而设置页的
 * 滑杆停在原位、看不出任何异常。同一条路径还能把 `theme` 写成任意字符串、
 * 把缓存上限写成负数、把渲染器写成一个不存在的 id。
 */

describe('normalizePluginSettingValue', () => {
  it('rejects a non-numeric lyric size instead of letting NaN reach the player', () => {
    // 这就是 `NaNpx` 的来源：之前原样写进设置，播放页拼出 `NaNpx`。
    expect(() => normalizePluginSettingValue('lyricFontSize', 'abc')).toThrow('需要数值')
    expect(() => normalizePluginSettingValue('lyricFontSize', null)).toThrow('需要数值')
    expect(() => normalizePluginSettingValue('lyricFontSize', {})).toThrow('需要数值')
  })

  it('clamps to the range the settings page itself can produce', () => {
    expect(normalizePluginSettingValue('lyricFontSize', 22)).toBe(22)
    // 滑杆是 16–34；越界如实拒绝，不猜一个「差不多的」值。
    expect(() => normalizePluginSettingValue('lyricFontSize', 900)).toThrow('16 到 34')
    expect(() => normalizePluginSettingValue('lyricFontSize', 2)).toThrow('16 到 34')
    // 桌面 `updateSettings` 对字号倍率越界时重置为 1；这里同样拒绝越界值。
    expect(() => normalizePluginSettingValue('lyricFontScale', 100)).toThrow('0.5 到 2')
  })

  it('rounds integers and keeps fractional scale', () => {
    expect(normalizePluginSettingValue('lyricFontSize', 22.6)).toBe(23)
    expect(normalizePluginSettingValue('lyricFontScale', 1.25)).toBe(1.25)
  })

  it('accepts numeric strings, which JSON round-trips from plugin code', () => {
    // 插件把控件值直接透传时常见 `"22"`；能安全转换就不必报错。
    expect(normalizePluginSettingValue('lyricFontSize', '22')).toBe(22)
  })

  it('requires real booleans for switches', () => {
    expect(normalizePluginSettingValue('lyricBlur', true)).toBe(true)
    expect(() => normalizePluginSettingValue('lyricBlur', 'true')).toThrow('需要布尔值')
    expect(() => normalizePluginSettingValue('lyricBlur', 1)).toThrow('需要布尔值')
  })

  it('rejects a theme the UI cannot represent', () => {
    expect(normalizePluginSettingValue('theme', 'dark')).toBe('dark')
    expect(() => normalizePluginSettingValue('theme', 'blue')).toThrow('system、light 或 dark')
  })

  it('rejects an accent colour the CSS layer would silently drop', () => {
    expect(normalizePluginSettingValue('accent', '#00dac0')).toBe('#00dac0')
    expect(() => normalizePluginSettingValue('accent', 'teal')).toThrow('颜色值')
    expect(() => normalizePluginSettingValue('accent', '#00da')).toThrow('颜色值')
  })

  it('rejects an unknown background renderer instead of storing a dead id', () => {
    expect(normalizePluginSettingValue('playerBackgroundRenderer', 'mesh')).toBe('mesh')
    expect(() => normalizePluginSettingValue('playerBackgroundRenderer', 'webgl9')).toThrow(
      '未知的背景渲染器'
    )
  })

  it('rejects an unknown lyric font instead of falling back silently', () => {
    // 静默回落成 system 会让插件以为设置生效了；这里是写入路径，如实拒绝。
    expect(normalizePluginSettingValue('lyricFontFamily', 'kai')).toBe('kai')
    expect(() => normalizePluginSettingValue('lyricFontFamily', 'comic-sans')).toThrow('未知的歌词字体')
  })

  it('normalizes tag options to the shape the download flow reads', () => {
    expect(
      normalizePluginSettingValue('tagWriteOptions', { basicInfo: true, lyricFormat: 'mp3' })
    ).toEqual({
      basicInfo: true,
      cover: false,
      lyrics: false,
      downloadLyrics: false,
      lyricFormat: 'lrc'
    })
  })
})

describe('pluginSettingsUpdate is atomic and validated', () => {
  it('does not apply the valid half of a rejected batch', () => {
    // 之前是边查边写：撞到 aiApiKey 抛错时 theme 已经被改掉了——
    // 插件收到「被拒绝」，用户的主题却变了。
    const settings: Record<string, any> = { theme: 'light', accent: '#00dac0' }
    expect(() => pluginSettingsUpdate({ theme: 'dark', aiApiKey: 'x' }, settings)).toThrow(
      '包含不可由插件修改的设置'
    )
    expect(settings.theme).toBe('light')
  })

  it('does not apply anything when one value is invalid', () => {
    // 字号倍率对插件叫 `FullPlayLyricFontRate`（落到移动端 `lyricFontScale`）。
    const settings: Record<string, any> = { lyricFontSize: 22, lyricFontScale: 1 }
    expect(() =>
      pluginSettingsUpdate({ lyricFontSize: 28, FullPlayLyricFontRate: 'huge' }, settings)
    ).toThrow('需要数值')
    expect(settings.lyricFontSize).toBe(22)
    expect(settings.lyricFontScale).toBe(1)
  })

  it('refuses to write the derived read-only keys', () => {
    // `isDarkMode` / `followSystemTheme` 是从三档 theme 推出来的视图，没有字段可写。
    // 之前默默接受再丢弃，插件以为切换了深色模式。
    const settings: Record<string, any> = { theme: 'light' }
    expect(() => pluginSettingsUpdate({ isDarkMode: true }, settings)).toThrow('只读')
    expect(() => pluginSettingsUpdate({ followSystemTheme: true }, settings)).toThrow('只读')
    expect(settings.theme).toBe('light')
  })

  it('still writes the documented names through their mobile fields', () => {
    const settings: Record<string, any> = { downloadFilenameTemplate: '', audioCacheEnabled: false }
    const changed = pluginSettingsUpdate({ filenameTemplate: '%t', autoCacheMusic: true }, settings)
    expect(changed.sort()).toEqual(['autoCacheMusic', 'filenameTemplate'])
    expect(settings.downloadFilenameTemplate).toBe('%t')
    expect(settings.audioCacheEnabled).toBe(true)
  })
})
